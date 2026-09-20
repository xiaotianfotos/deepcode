package com.dsharnessmobile.shell;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.AudioManager;
import android.media.AudioDeviceInfo;
import android.media.MediaRecorder;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Base64;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

/** Android primitives for the voice plugin. Never submits an agent message. */
public final class VoiceInputController {
  private static final int RATE=16000, MAX_SECONDS=60;
  private final Context activity;
  private static final java.util.concurrent.atomic.AtomicReference<Object> MICROPHONE_OWNER = new java.util.concurrent.atomic.AtomicReference<>();
  public static boolean microphoneInUse(){return MICROPHONE_OWNER.get()!=null;}
  public static boolean claimMicrophone(Object owner){return MICROPHONE_OWNER.compareAndSet(null,owner);}
  public static void releaseMicrophone(Object owner){MICROPHONE_OWNER.compareAndSet(owner,null);}
  private final Runnable requestPermission;
  private final ExecutorService worker=Executors.newSingleThreadExecutor();
  private final Handler main=new Handler(Looper.getMainLooper());
  private final String key=UUID.randomUUID().toString();
  private volatile boolean foreground, closed, recording, engineReady;
  // Sticky until Activity recreation after an optimized-engine failure.
  private volatile boolean compatibilityEngine;
  private volatile Process engine;
  private volatile AudioRecord recorder;
  private volatile String routedDeviceName="", routedDeviceType="";
  private volatile int routedDeviceId=-1;
  private AudioManager audioManager;
  private int previousAudioMode;
  private boolean ownsCommunication;
  private AudioDeviceInfo previousCommunication;
  private volatile HttpURLConnection request;
  private volatile long generation, startedAt;
  private volatile double level;
  private volatile double inputRms, vadThreshold;
  private volatile double[] waveform = new double[34], waveformSamples = new double[72];
  private volatile int silenceMs, capturedMs, audioMs, lastSpeechMs;
  private volatile boolean speechDetected, autoStopped;
  private volatile String id="", phase="idle", error="", text="", stopReason="manual";
  private volatile int port;
  private volatile boolean manualEndpoint;
  private volatile JSONObject speechConfig;
  private volatile SpeechTransport speechTransport;
  private volatile SpeechStreamingAsr streamingAsr;
  private void closeStream(){SpeechStreamingAsr s=streamingAsr;streamingAsr=null;if(s!=null)s.close();}
  private final java.util.concurrent.ScheduledExecutorService guard=java.util.concurrent.Executors.newSingleThreadScheduledExecutor();
  private java.util.concurrent.ScheduledFuture<?> configGuard;
  public synchronized void manualEndpoint(boolean value){if(!busy())manualEndpoint=value;}
  private boolean remoteAsr(){return speechConfig!=null&&!speechConfig.optString("asrProvider","local").equals("local");}
  private void loadSpeechConfig(long token)throws Exception{
    SpeechTransport transport=new SpeechTransport(activity);speechTransport=transport;
    try{JSONObject c=transport.config();if(!c.optBoolean("enabled")||!c.optBoolean("asrEnabled"))throw new IOException("语音识别已关闭");speechConfig=c;activity.getSharedPreferences("speech-services",Context.MODE_PRIVATE).edit().putBoolean("seen",true).apply();}
    catch(java.io.FileNotFoundException legacy){if(activity.getSharedPreferences("speech-services",Context.MODE_PRIVATE).getBoolean("seen",false))throw legacy;speechConfig=null;}
    if(!valid(token))return;
    if(speechConfig!=null){final int rev=speechConfig.getInt("revision");final String ownerId=id;configGuard=guard.scheduleWithFixedDelay(()->{
      if(!valid(token)||!busy())return;
      try{JSONObject c=new SpeechTransport(activity).config();if(!c.optBoolean("enabled")||!c.optBoolean("asrEnabled")||c.optInt("revision")!=rev||!c.optString("csrf").equals(speechConfig.optString("csrf"))){if(valid(token))cancel(ownerId);}}
      catch(Exception unavailable){if(valid(token))cancel(ownerId);}
    },1,1,java.util.concurrent.TimeUnit.SECONDS);}
  }
  private volatile long requestMs, firstTextMs=-1;
  private final Runnable idleUnload=() -> {if(!busy())stopEngine();};

  public VoiceInputController(Context activity,Runnable requestPermission){
    this.activity=activity;this.requestPermission=requestPermission;
  }
  private boolean busy(){return Arrays.asList("permission","preparing","recording","transcribing").contains(phase);}
  public synchronized String start(String requestId){
    if(android.os.Build.VERSION.SDK_INT<29)return failure("本地语音输入需要 Android 10 或以上");
    if(closed||!foreground)return failure("请在应用前台使用语音输入");
    if(requestId==null||!requestId.matches("[A-Za-z0-9_-]{1,80}"))return failure("无效录音请求");
    if(busy()||recorder!=null)return failure("语音输入正在处理或释放麦克风，请稍后重试");
    if(!MICROPHONE_OWNER.compareAndSet(null,this))return failure("麦克风正在被另一个语音会话使用");
    if(configGuard!=null)configGuard.cancel(false);
    SpeechPlayback.INSTANCE.stop();
    id=requestId;generation++;waveform=new double[34];waveformSamples=new double[72];silenceMs=0;capturedMs=0;audioMs=0;lastSpeechMs=0;speechDetected=false;autoStopped=false;stopReason="manual";text="";error="";level=0;inputRms=0;vadThreshold=0;requestMs=0;firstTextMs=-1;
    main.removeCallbacks(idleUnload);
    if(activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED){
      phase="permission";main.post(requestPermission);
    }else prepare(generation);
    return status();
  }
  public synchronized void permissionResult(boolean granted){
    if(!phase.equals("permission"))return;
    if(!granted){MICROPHONE_OWNER.compareAndSet(this,null);phase="error";error="麦克风权限未授予，可以再次点击麦克风授权";return;}
    prepare(generation);
  }
  /** Debug-only fixed public fixture. No arbitrary path, microphone or agent submit. */
  public synchronized String testSample(String requestId,boolean compatibility){return testSampleInternal(requestId,compatibility,false);}
  public synchronized String testServiceSample(String requestId){return testSampleInternal(requestId,false,true);}
  private String testSampleInternal(String requestId,boolean compatibility,boolean service){
    if(!BuildConfig.DEBUG||closed||!foreground||busy()||recorder!=null)return failure("语音测试当前不可用");
    if(requestId==null||!requestId.matches("[A-Za-z0-9_-]{1,80}"))return failure("无效录音请求");
    if(configGuard!=null)configGuard.cancel(false);if(speechTransport!=null)speechTransport.cancel();speechConfig=null;
    stopEngine();compatibilityEngine=compatibility;main.removeCallbacks(idleUnload);
    id=requestId;generation++;text="";error="";requestMs=0;firstTextMs=-1;phase="preparing";
    long token=generation;
    worker.execute(() -> {
      try(InputStream input=activity.getAssets().open("voice-validation.wav")){
        ByteArrayOutputStream bytes=new ByteArrayOutputStream();byte[] block=new byte[8192];int n;
        while((n=input.read(block))!=-1)bytes.write(block,0,n);
        if(service){
          loadSpeechConfig(token);if(!SpeechStreamingAsr.selected(speechConfig))throw new IOException("请选择流式 ASR 服务");
          long begin=SystemClock.elapsedRealtime();
          SpeechStreamingAsr stream=new SpeechStreamingAsr(activity,speechConfig,partial->{synchronized(this){if(valid(token)){text=partial;if(firstTextMs<0)firstTextMs=SystemClock.elapsedRealtime()-begin;}}});
          synchronized(this){if(!valid(token)){stream.close();return;}streamingAsr=stream;phase="transcribing";}
          byte[] pcm=Arrays.copyOfRange(bytes.toByteArray(),44,bytes.size());
          for(int i=0;i<pcm.length&&valid(token);i+=6400){byte[] part=Arrays.copyOfRange(pcm,i,Math.min(i+6400,pcm.length));stream.append(part,part.length);Thread.sleep(part.length*1000L/(RATE*2));}
          if(!valid(token))return;
        }else ensureEngine(token);if(!valid(token))return;
        synchronized(this){if(!valid(token))return;phase="transcribing";audioMs=(bytes.size()-44)*1000/(RATE*2);}
        transcribeWithFallback(bytes.toByteArray(),token);
      }catch(Exception e){fail(token,e);}finally{if(valid(token))scheduleUnload();}
    });
    return status();
  }
  private void prepare(long token){
    phase="preparing";
    worker.execute(() -> {
      try{loadSpeechConfig(token);if(!valid(token))return;if(!remoteAsr())ensureEngine(token);else stopEngine();if(!valid(token))return;if(!foreground){cancel(id);return;}
        if(SpeechStreamingAsr.selected(speechConfig)){
          long begin=SystemClock.elapsedRealtime();
          SpeechStreamingAsr stream=new SpeechStreamingAsr(activity,speechConfig,partial->{synchronized(this){if(valid(token)){text=partial;if(firstTextMs<0)firstTextMs=SystemClock.elapsedRealtime()-begin;}}});
          synchronized(this){if(!valid(token)){stream.close();return;}streamingAsr=stream;}
        }
        beginCapture(token);}
      catch(Exception e){restoreAudioRoute();fail(token,e);}
    });
  }
  private boolean valid(long token){return !closed&&token==generation;}
  private synchronized void fail(long token,Exception e){
    if(!valid(token))return;
    closeStream();
    if(recorder==null)MICROPHONE_OWNER.compareAndSet(this,null);recording=false;phase="error";error=e.getMessage()==null?e.toString():e.getMessage();scheduleUnload();
  }
  private String failure(String message){try{return new JSONObject().put("ok",false).put("error",message).toString();}catch(Exception e){return "{}";}}
  public synchronized String status(){
    try{JSONArray bars=new JSONArray();for(double bar:waveform)bars.put(bar);JSONArray signed=new JSONArray();for(double v:waveformSamples)signed.put(v);return new JSONObject().put("ok",true).put("id",id).put("phase",phase).put("error",error)
      .put("text",text).put("model",remoteAsr()?speechConfig.optString("asrProvider"):"Qwen3-ASR-0.6B").put("backend",remoteAsr()?"api":"cpu").put("level",level)
      .put("engine",compatibilityEngine?"compatibility":"kleidiai").put("engineReady",engineReady)
      .put("inputDevice",routedDeviceName).put("inputDeviceType",routedDeviceType).put("inputDeviceId",routedDeviceId)
      .put("inputRms",inputRms).put("vadThreshold",vadThreshold)
      .put("waveformSamples",signed).put("waveform",bars).put("silenceMs",silenceMs).put("silenceLimitMs",VoiceEndpoint.SILENCE_MS)
      .put("speechDetected",speechDetected).put("autoStopped",autoStopped).put("stopReason",stopReason).put("capturedMs",capturedMs).put("audioMs",audioMs).put("lastSpeechMs",lastSpeechMs).put("vad","webrtc-mode-2")
      .put("elapsedMs",recording?SystemClock.elapsedRealtime()-startedAt:0).put("limitSeconds",MAX_SECONDS)
      .put("requestMs",requestMs).put("firstTextMs",firstTextMs<0?JSONObject.NULL:firstTextMs).toString();}
    catch(Exception e){return failure("无法读取语音状态");}
  }
  public synchronized void stop(String requestId){
    if(!id.equals(requestId)||!recording)return;
    phase="transcribing";recording=false;
    AudioRecord r=recorder;if(r!=null)try{r.stop();}catch(Exception ignored){}
  }
  public synchronized void cancel(String requestId){
    if(!id.equals(requestId))return;
    generation++;closeStream();if(configGuard!=null)configGuard.cancel(false);if(speechTransport!=null)speechTransport.cancel();if(recorder==null)MICROPHONE_OWNER.compareAndSet(this,null);recording=false;phase="canceled";text="";level=0;
    AudioRecord r=recorder;if(r!=null)try{r.stop();}catch(Exception ignored){}
    HttpURLConnection c=request;if(c!=null)c.disconnect();
    stopEngine();
  }
  public synchronized void acknowledge(String requestId){
    if(id.equals(requestId)&&!busy()){text="";error="";phase="idle";}
  }
  public synchronized void foreground(boolean enabled){
    foreground=enabled;
    // Permission dialogs may pause the Activity. Preserve only that explicit authorization request.
    if(!enabled&&busy()&&!phase.equals("permission"))cancel(id);
  }
  public synchronized void release(){cancel(id);main.removeCallbacks(idleUnload);stopEngine();}
  public synchronized void close(){closed=true;release();worker.shutdownNow();guard.shutdownNow();}
  private void scheduleUnload(){main.removeCallbacks(idleUnload);main.postDelayed(idleUnload,120000);}

  private void ensureEngine(long token)throws Exception{
    Process existing=engine;if(engineReady&&existing!=null&&existing.isAlive())return;
    File root=new File("/storage/emulated/0/work/models/qwen3-asr");
    File model=new File(root,"Qwen3-ASR-0.6B-Q8_0.gguf"),encoder=new File(root,"mmproj-Qwen3-ASR-0.6B-Q8_0.gguf");
    if(!model.canRead()||!encoder.canRead())throw new IOException("0.6B 模型尚未就绪，请检查 work/models/qwen3-asr 及共享存储权限");
    if(model.length()!=804749248L||encoder.length()!=214392480L)throw new IOException("0.6B 模型文件不完整，请重新准备模型");
    try{startEngine(token,model,encoder);}
    catch(IOException failure){
      if(!valid(token)||compatibilityEngine)throw failure;
      stopEngine();compatibilityEngine=true;startEngine(token,model,encoder);
    }
  }
  private void startEngine(long token,File model,File encoder)throws Exception{
    if(!valid(token))return;
    File nativeFile=new File(activity.getApplicationInfo().nativeLibraryDir,compatibilityEngine?"libdsh_voice_compat.so":"libdsh_voice_server.so");
    if(!nativeFile.canExecute())throw new IOException("当前安装包未提供 ARM64 语音引擎");
    try(ServerSocket socket=new ServerSocket(0,1,InetAddress.getLoopbackAddress())){port=socket.getLocalPort();}
    ProcessBuilder pb=new ProcessBuilder(nativeFile.toString(),"-m",model.toString(),"--mmproj",encoder.toString(),
      "--host","127.0.0.1","--port",Integer.toString(port),"-c","4096","-b","512","-ub","256",
      "-np","1","-t","4","-tb","4","--no-warmup","--jinja","--cache-ram","0","--no-webui","-lv","2",
      "--device","none","-ngl","0","--no-mmproj-offload");
    pb.environment().put("HOME",activity.getFilesDir().toString());
    pb.environment().put("LLAMA_API_KEY",key);
    pb.environment().remove("GGML_KLEIDIAI_SME");
    pb.redirectErrorStream(true).redirectOutput(new File(activity.getCacheDir(),compatibilityEngine?"voice-engine-compat.log":"voice-engine.log"));
    Process process=pb.start();
    synchronized(this){if(!valid(token)){process.destroy();return;}engine=process;}
    long start=SystemClock.elapsedRealtime();
    while(valid(token)&&process.isAlive()&&SystemClock.elapsedRealtime()-start<90000){
      try{HttpURLConnection c=connection("/health");c.setReadTimeout(800);try{if(c.getResponseCode()==200){synchronized(this){if(valid(token)&&engine==process){engineReady=true;return;}}}}finally{c.disconnect();}}catch(IOException ignored){}
      Thread.sleep(150);
    }
    if(engine==process)stopEngine();else process.destroy();
    if(valid(token))throw new IOException("语音模型加载失败，请稍后重试");
  }
  private synchronized void stopEngine(){
    engineReady=false;Process p=engine;engine=null;if(p!=null){p.destroy();main.postDelayed(() -> {if(p.isAlive())p.destroyForcibly();},500);}
  }
  private HttpURLConnection connection(String path)throws IOException{
    HttpURLConnection c=(HttpURLConnection)new URL("http://127.0.0.1:"+port+path).openConnection(Proxy.NO_PROXY);
    c.setConnectTimeout(3000);c.setReadTimeout(120000);c.setRequestProperty("Authorization","Bearer "+key);return c;
  }
  private void beginCapture(long token)throws Exception{
    audioManager=activity.getSystemService(AudioManager.class);
    AudioDeviceInfo preferred=null;
    for(AudioDeviceInfo input:audioManager.getDevices(AudioManager.GET_DEVICES_INPUTS)){
      if(input.getType()==AudioDeviceInfo.TYPE_BLUETOOTH_SCO){preferred=input;break;}
    }
    if(preferred!=null&&android.os.Build.VERSION.SDK_INT>=31){
      previousAudioMode=audioManager.getMode();previousCommunication=audioManager.getCommunicationDevice();
      for(AudioDeviceInfo output:audioManager.getAvailableCommunicationDevices()){
        if(output.getType()==AudioDeviceInfo.TYPE_BLUETOOTH_SCO && output.getAddress().equals(preferred.getAddress())){
          audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);ownsCommunication=true;
          if(!audioManager.setCommunicationDevice(output)){restoreAudioRoute();throw new IOException("无法启用当前蓝牙麦克风");}
          break;
        }
      }
    }
    int min=AudioRecord.getMinBufferSize(RATE,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT);
    if(min<=0)throw new IOException("设备不支持语音录音格式");
    AudioRecord local=new AudioRecord(preferred!=null?MediaRecorder.AudioSource.VOICE_COMMUNICATION:MediaRecorder.AudioSource.VOICE_RECOGNITION,RATE,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT,Math.max(min*2,RATE*2));
    if(preferred!=null)local.setPreferredDevice(preferred);
    synchronized(this){
      if(!valid(token)||!foreground){local.release();restoreAudioRoute();return;}
      if(local.getState()!=AudioRecord.STATE_INITIALIZED){local.release();restoreAudioRoute();throw new IOException("无法初始化麦克风");}
      try{local.startRecording();}catch(Exception e){local.release();restoreAudioRoute();throw e;}
      AudioDeviceInfo routed=local.getRoutedDevice();
      if(routed==null || preferred!=null&&routed.getId()!=preferred.getId()){
        local.stop();local.release();restoreAudioRoute();throw new IOException("麦克风实际路由尚未就绪，请重试");
      }
      routedDeviceId=routed.getId();routedDeviceName=routed.getProductName().toString();routedDeviceType=Integer.toString(routed.getType());
      recorder=local;startedAt=SystemClock.elapsedRealtime();recording=true;phase="recording";
    }
    new Thread(() -> capture(local,token),"dsh-voice-capture").start();
  }
  private synchronized void restoreAudioRoute(){
    if(!ownsCommunication||audioManager==null)return;
    ownsCommunication=false;
    try{
      if(android.os.Build.VERSION.SDK_INT>=31){
        if(previousCommunication!=null)audioManager.setCommunicationDevice(previousCommunication);else audioManager.clearCommunicationDevice();
      }
      audioManager.setMode(previousAudioMode);
    }catch(Exception ignored){}
  }
  private void capture(AudioRecord local,long token){
    ByteArrayOutputStream pcm=new ByteArrayOutputStream();byte[] block=new byte[640];
    VoiceEndpoint endpoint=new VoiceEndpoint();VoiceActivityGate gate=new VoiceActivityGate();int firstVoiceByte=-1;
    try(NativeVoiceVad vad=new NativeVoiceVad()){
      while(valid(token)&&recording&&pcm.size()<RATE*2*MAX_SECONDS){
        AudioDeviceInfo route=local.getRoutedDevice();
        if(recording&&(route==null||route.getId()!=routedDeviceId))throw new IOException("麦克风连接或路由已变化，请重新录音");
        int n=0;
        while(n<block.length&&valid(token)&&recording){
          int read=local.read(block,n,block.length-n,AudioRecord.READ_BLOCKING);
          if(read<=0){if(recording)throw new IOException("麦克风读取失败");break;}
          n+=read;
        }
        if(n==0)break;
        if(n<block.length)Arrays.fill(block,n,block.length,(byte)0);
        pcm.write(block,0,n);SpeechStreamingAsr stream=streamingAsr;if(stream!=null)stream.append(block,n);double sum=0;double[] bars=new double[34];
        for(int i=0;i+1<n;i+=2){short sample=(short)((block[i]&255)|(block[i+1]<<8));double v=Math.abs(sample/32768.0);sum+=v*v;int at=Math.min(33,(i/2)*34/(n/2));bars[at]=Math.max(bars[at],v);}
        double rms=Math.sqrt(sum/Math.max(1,n/2));
        level=Math.min(1,rms*8);
        for(int i=0;i<bars.length;i++)bars[i]=Math.min(1,bars[i]*1.8+level*0.35);
        double[] signed=new double[72];
        // Homerail's live input meter: signed samples, 6x display gain and temporal smoothing.
        for(int i=0;i<signed.length;i++){
          int j=i*Math.max(1,n/2-1)/71;
          double sample=(short)((block[j*2]&255)|(block[j*2+1]<<8))/32768.0;
          signed[i]=waveformSamples[i]*.24+Math.max(-1,Math.min(1,sample*6))*.76;
        }
        // Estimate noise even during VAD hangover; a fixed gate cuts off quiet speech.
        boolean speech=gate.accept(vad.speech(block),rms);
        inputRms=rms;vadThreshold=gate.threshold();
        if(speech&&firstVoiceByte<0)firstVoiceByte=pcm.size()-n;
        endpoint.accept(speech,n*1000/(RATE*2));
        synchronized(this){
          if(!valid(token))return;
          waveform=bars;waveformSamples=signed;silenceMs=endpoint.silenceMs();speechDetected=endpoint.heardSpeech();capturedMs=pcm.size()*1000/(RATE*2);lastSpeechMs=endpoint.lastVoiceMs();
          if(!manualEndpoint&&endpoint.finished()){autoStopped=true;stopReason="silence";recording=false;}
        }
      }
    }catch(Exception e){fail(token,e);}
    finally{try{local.stop();}catch(Exception ignored){}local.release();synchronized(this){if(recorder==local){recorder=null;recording=false;level=0;restoreAudioRoute();if(!valid(token)||phase.equals("error"))MICROPHONE_OWNER.compareAndSet(this,null);}}}
    if(!valid(token)||phase.equals("error"))return;
    if(pcm.size()>=RATE*2*MAX_SECONDS){autoStopped=true;stopReason="limit";}
    if(!endpoint.heardSpeech()){fail(token,new IOException("未听到语音，请点击麦克风重试"));return;}
    // Keep 300ms of context around the detected utterance; don't encode 5s of endpoint silence.
    int from=Math.max(0,firstVoiceByte-RATE*2*300/1000);
    int to=Math.min(pcm.size(),(endpoint.lastVoiceMs()+300)*RATE*2/1000);
    byte[] recorded=pcm.toByteArray();byte[] wave=wave(Arrays.copyOfRange(recorded,from,to));
    audioMs=(to-from)*1000/(RATE*2);
    synchronized(this){
      if(!valid(token))return;
      phase="transcribing";
      worker.execute(() -> {try{if(valid(token))transcribeWithFallback(wave,token);}catch(Exception e){fail(token,e);}finally{if(valid(token))scheduleUnload();}});
    }
  }
  private void transcribeWithFallback(byte[] wav,long token)throws Exception{
    if(remoteAsr()){
      long begin=SystemClock.elapsedRealtime();SpeechStreamingAsr stream=streamingAsr;
      JSONObject result=stream!=null?new JSONObject().put("text",stream.finish()):speechTransport.post(speechConfig,new JSONObject().put("action","asr").put("audio",Base64.encodeToString(wav,Base64.NO_WRAP)));
      synchronized(this){if(!valid(token))return;streamingAsr=null;requestMs=SystemClock.elapsedRealtime()-begin;text=result.getString("text").trim();if(text.isEmpty())throw new IOException("没有识别到文字");phase="done";MICROPHONE_OWNER.compareAndSet(this,null);}return;
    }
    try{transcribe(wav,token);}
    catch(IOException failure){
      Process failed=engine;
      // Retry the same retained audio only for a dead optimized process. Never
      // duplicate a delivered draft or retry a cancellation/HTTP validation error.
      if(!valid(token)||compatibilityEngine||failed==null||failed.isAlive())throw failure;
      stopEngine();compatibilityEngine=true;ensureEngine(token);if(valid(token))transcribe(wav,token);
    }
  }
  private void transcribe(byte[] wav,long token)throws Exception{
    long begin=SystemClock.elapsedRealtime(),first=-1;StringBuilder raw=new StringBuilder();String finish="";
    JSONObject audio=new JSONObject().put("type","input_audio").put("input_audio",new JSONObject().put("data",Base64.encodeToString(wav,Base64.NO_WRAP)).put("format","wav"));
    JSONObject body=new JSONObject().put("messages",new JSONArray().put(new JSONObject().put("role","system").put("content",""))
      .put(new JSONObject().put("role","user").put("content",new JSONArray().put(audio)))).put("stream",true).put("temperature",0).put("max_tokens",512).put("cache_prompt",false);
    HttpURLConnection c=connection("/v1/chat/completions");
    synchronized(this){if(!valid(token)){c.disconnect();return;}request=c;}c.setRequestMethod("POST");c.setDoOutput(true);c.setRequestProperty("Content-Type","application/json");
    try{
      c.getOutputStream().write(body.toString().getBytes(StandardCharsets.UTF_8));
      if(c.getResponseCode()!=200)throw new IOException("语音识别服务返回错误："+c.getResponseCode());
      try(BufferedReader reader=new BufferedReader(new InputStreamReader(c.getInputStream(),StandardCharsets.UTF_8))){
        String line;while(valid(token)&&(line=reader.readLine())!=null){
          if(!line.startsWith("data: "))continue;String data=line.substring(6);if(data.equals("[DONE]"))break;
          JSONObject part=new JSONObject(data);if(part.has("error"))throw new IOException("语音识别失败");
          JSONArray choices=part.optJSONArray("choices");if(choices==null||choices.length()==0)continue;
          JSONObject choice=choices.getJSONObject(0),delta=choice.optJSONObject("delta");
          if(delta!=null&&!delta.isNull("content"))raw.append(delta.optString("content",""));
          if(!choice.isNull("finish_reason"))finish=choice.getString("finish_reason");
          String draft=clean(raw.toString());if(!draft.isEmpty()&&first<0)first=SystemClock.elapsedRealtime()-begin;
        }
      }
    }finally{c.disconnect();if(request==c)request=null;}
    synchronized(this){
      if(!valid(token))return;
      if(!finish.equals("stop"))throw new IOException("转录未完整结束，请缩短录音重试");
      text=clean(raw.toString());firstTextMs=first;requestMs=SystemClock.elapsedRealtime()-begin;
      if(text.isEmpty())throw new IOException("没有识别到文字，请再试一次");
      MICROPHONE_OWNER.compareAndSet(this,null);phase="done";
    }
  }
  static String clean(String raw){int i=raw.indexOf("<asr_text>");return i<0?"":raw.substring(i+10).replace("<|im_end|>","").trim();}
  static byte[] wave(byte[] pcm){
    ByteBuffer b=ByteBuffer.allocate(44+pcm.length).order(ByteOrder.LITTLE_ENDIAN);
    b.put("RIFF".getBytes(StandardCharsets.US_ASCII)).putInt(36+pcm.length).put("WAVEfmt ".getBytes(StandardCharsets.US_ASCII));
    b.putInt(16).putShort((short)1).putShort((short)1).putInt(RATE).putInt(RATE*2).putShort((short)2).putShort((short)16);
    b.put("data".getBytes(StandardCharsets.US_ASCII)).putInt(pcm.length).put(pcm);return b.array();
  }
}
