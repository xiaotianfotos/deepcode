package com.dsharnessmobile.asrlab;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.SystemClock;
import android.provider.Settings;
import android.view.View;
import android.view.WindowManager;
import android.widget.*;
import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.*;
import java.util.concurrent.*;

/** Standalone foreground ASR experiment. Audio never leaves the device. */
public class MainActivity extends Activity {
    private static final File MODELS = new File("/storage/emulated/0/work/models/qwen3-asr");
    private static final File REPORTS = new File("/storage/emulated/0/work/asr-lab");
    private static final int PORT = 8876, SR = 16000;
    private final ExecutorService control = Executors.newSingleThreadExecutor();
    private final ThreadPoolExecutor inference = new ThreadPoolExecutor(1, 1, 0,
            TimeUnit.MILLISECONDS, new ArrayBlockingQueue<>(3));
    private volatile Process engine;
    private volatile boolean ready, recording, destroyed, testing;
    private volatile AudioRecord recorder;
    private volatile String model = "0.6B", backend = "cpu", context = "";
    private final String key = UUID.randomUUID().toString();
    private Spinner modelChoice, backendChoice, chunkChoice;
    private TextView status, transcript, metrics;
    private EditText contextInput;
    private Button start, mic, bench;
    private final JSONArray results = new JSONArray();
    private final StringBuilder committed = new StringBuilder();
    private String runId;
    private double loadMs;
    private long captureStart;
    private int chunkSeconds = 4;
    private int captureSession;
    private MediaPlayer loopbackPlayer;
    private volatile String captureSource="user-microphone";

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        runId = "run-" + System.currentTimeMillis();
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(28, 24, 28, 24);
        root.setBackgroundColor(Color.rgb(247, 249, 252));
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            android.graphics.Insets i = insets.getInsets(android.view.WindowInsets.Type.systemBars());
            v.setPadding(28+i.left, 24+i.top, 28+i.right, 24+i.bottom); return insets;
        });
        TextView title = text("Qwen 实时语音实验", 25); root.addView(title);
        root.addView(text("本机离线 · GGUF Q8 · 麦克风分段识别\n模型：内部存储/work/models/qwen3-asr", 14));
        LinearLayout choices = new LinearLayout(this);
        modelChoice = spinner(new String[]{"1.7B", "0.6B"});
        modelChoice.setSelection(1);
        backendChoice = spinner(new String[]{"CPU 对照", "Vulkan GPU"});
        chunkChoice = spinner(new String[]{"每 4 秒", "每 2 秒", "每 6 秒"});
        choices.addView(modelChoice, new LinearLayout.LayoutParams(0, 58, 1));
        choices.addView(backendChoice, new LinearLayout.LayoutParams(0, 58, 1));
        choices.addView(chunkChoice, new LinearLayout.LayoutParams(0, 58, 1)); root.addView(choices);
        contextInput = new EditText(this);
        contextInput.setHint("热词／上下文（可选，如：玄戒、澎湃 OS、HyperFrames）");
        contextInput.setMaxLines(2);
        contextInput.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(500)});
        contextInput.setText(getPreferences(0).getString("context", ""));
        root.addView(contextInput);
        LinearLayout buttons = new LinearLayout(this);
        start = button("加载模型", v -> startEngine(false));
        mic = button("开始说话", v -> { if (recording) stopMic(); else startMic(); });
        bench = button("标准音频测速", v -> runBench());
        buttons.addView(start); buttons.addView(mic); buttons.addView(bench); root.addView(buttons);
        LinearLayout utilities = new LinearLayout(this);
        utilities.addView(button("授权 work 目录", v -> startActivity(new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:"+getPackageName())))));
        utilities.addView(button("导出报告", v -> { saveReport(); say("报告已写入 work/asr-lab/"+runId+".json"); }));
        utilities.addView(button("卸载模型", v -> { if (!testing && !recording && inference.getActiveCount()==0 && inference.getQueue().isEmpty()) { stopEngine(); say("模型已卸载"); } }));
        root.addView(utilities);
        status = text("先授权 work 目录，再加载模型。开始说话后每段会逐字显示；停止后继续处理尾段。", 16);
        metrics = text("等待测试", 14); transcript = text("", 22);
        root.addView(status); root.addView(metrics);
        ScrollView scroll = new ScrollView(this); scroll.addView(transcript);
        root.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
        root.addView(text("这是分段实时原型：没有跨段声学缓存，段边界可能截断词语。仅在当前页面录音；待处理超过 3 段时会停止并报告。", 13));
        setContentView(root);
        setButtons();
        // Instrumentation entry: fixed model/backend choices only, never starts microphone.
        String selected = getIntent().getStringExtra("model");
        if ("0.6B".equals(selected)) modelChoice.setSelection(1);
        if ("1.7B".equals(selected)) modelChoice.setSelection(0);
        if ("vulkan".equals(getIntent().getStringExtra("backend"))) backendChoice.setSelection(1);
        String mode=getIntent().getStringExtra("mode");
        if ("bench".equals(mode)||"loopback".equals(mode)) root.postDelayed(() -> startEngine("bench".equals(mode)), 400);
    }
    private TextView text(String s,int size) { TextView t=new TextView(this);t.setText(s);t.setTextSize(size);t.setTextColor(Color.rgb(25,38,57));t.setPadding(0,8,0,8);t.setTextIsSelectable(true);return t; }
    private Spinner spinner(String[] values) { Spinner s=new Spinner(this);s.setAdapter(new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,values));return s; }
    private Button button(String s,View.OnClickListener listener) { Button b=new Button(this);b.setText(s);b.setOnClickListener(listener);return b; }
    private void say(String s) { runOnUiThread(() -> { if(!destroyed)status.setText(s); }); }
    private void setButtons() { runOnUiThread(() -> {
        if(destroyed)return;
        boolean busy=recording||testing||inference.getActiveCount()>0||!inference.getQueue().isEmpty();
        start.setEnabled(!busy); bench.setEnabled(ready&&!busy); mic.setEnabled(ready&&!testing);
        mic.setText(recording?"停止说话":"开始说话");
        modelChoice.setEnabled(!busy);backendChoice.setEnabled(!busy);chunkChoice.setEnabled(!busy);
        contextInput.setEnabled(!busy);
    }); }
    private void startEngine(boolean autoBench) {
        if(recording||testing||inference.getActiveCount()>0||!inference.getQueue().isEmpty())return;
        if(!Environment.isExternalStorageManager()){say("请点“授权 work 目录”，允许管理所有文件以读取共享模型。");return;}
        model=modelChoice.getSelectedItemPosition()==0?"1.7B":"0.6B";
        backend=backendChoice.getSelectedItemPosition()==0?"cpu":"vulkan";
        synchronized(results){while(results.length()>0)results.remove(results.length()-1);}
        committed.setLength(0);transcript.setText("");
        runId="run-"+System.currentTimeMillis(); testing=true; setButtons(); say("正在加载 "+model+" / "+backend+"…");
        control.execute(() -> {
            try {
                stopEngine();
                startForegroundService(new Intent(this,LabService.class));
                File weights=new File(MODELS,"Qwen3-ASR-"+model+"-Q8_0.gguf");
                File audio=new File(MODELS,"mmproj-Qwen3-ASR-"+model+"-Q8_0.gguf");
                if(!weights.canRead()||!audio.canRead())throw new IOException("缺少模型或音频编码器："+MODELS);
                long t=SystemClock.elapsedRealtime();
                ArrayList<String> args=new ArrayList<>(Arrays.asList(
                    getApplicationInfo().nativeLibraryDir+"/libasr_server.so",
                    "-m",weights.toString(),"--mmproj",audio.toString(),"--host","127.0.0.1","--port",Integer.toString(PORT),
                    "--api-key",key,"-c","2048","-b","512","-ub","256","-np","1","-t","4","-tb","4",
                    "--no-warmup","--jinja","--cache-ram","0","--no-webui","-lv","4",
                    "-ngl",backend.equals("cpu")?"0":"99"));
                if(backend.equals("cpu")){args.add("--device");args.add("none");args.add("--no-mmproj-offload");}
                File log=new File(getFilesDir(),runId+"-engine.log");
                ProcessBuilder pb=new ProcessBuilder(args).redirectErrorStream(true).redirectOutput(log);
                pb.environment().put("HOME",getFilesDir().toString());
                engine=pb.start();
                JSONObject connection=new JSONObject().put("port",PORT).put("key",key).put("runId",runId).put("model",model).put("backend",backend);
                writeText(new File(getFilesDir(),"connection.json").toPath(),connection.toString());
                while(SystemClock.elapsedRealtime()-t<180000) {
                    if(destroyed)throw new IOException("页面已关闭");
                    if(!engine.isAlive())throw new IOException("引擎退出，请查看 "+log.getName());
                    try { HttpURLConnection c=connect("/health");c.setReadTimeout(1000);boolean ok=c.getResponseCode()==200;c.disconnect();if(ok){ready=true;break;} }catch(IOException ignored){}
                    Thread.sleep(250);
                }
                if(!ready)throw new IOException("模型加载超时");
                loadMs=SystemClock.elapsedRealtime()-t;
                say("已加载 "+model+" / "+backend+"，用时 "+String.format(Locale.US,"%.1f",loadMs/1000)+" 秒");
                saveReport();
            } catch(Exception e){say(e.toString());stopEngine();eventError("load",e);}
            finally{testing=false;setButtons();}
            if(autoBench&&ready)runOnUiThread(this::runBench);
            else if(ready&&"loopback".equals(getIntent().getStringExtra("mode")))runOnUiThread(this::runLoopback);
        });
    }
    private HttpURLConnection connect(String path)throws IOException {
        HttpURLConnection c=(HttpURLConnection)new URL("http://127.0.0.1:"+PORT+path).openConnection();
        c.setConnectTimeout(3000);c.setReadTimeout(180000);c.setRequestProperty("Authorization","Bearer "+key);return c;
    }
    private static String clean(String s) {
        int i=s.indexOf("<asr_text>");
        if(i>=0)return s.substring(i+10).replace("<|im_end|>","").trim();
        return ""; // Never expose a partial language header or count it as first text.
    }
    private JSONObject transcribe(byte[] wav,String label,boolean warmup,long audioStartMs,long audioEndMs)throws Exception {
        long begin=SystemClock.elapsedRealtime();double duration=wavDuration(wav);
        JSONObject message=new JSONObject().put("role","user").put("content",new JSONArray().put(new JSONObject().put("type","input_audio").put("input_audio",new JSONObject().put("data",android.util.Base64.encodeToString(wav,android.util.Base64.NO_WRAP)).put("format","wav"))));
        JSONArray messages=new JSONArray().put(new JSONObject().put("role","system").put("content",context)).put(message);
        JSONObject body=new JSONObject().put("messages",messages).put("temperature",0).put("max_tokens",256).put("stream",true).put("cache_prompt",false);
        HttpURLConnection c=connect("/v1/chat/completions");c.setRequestMethod("POST");c.setDoOutput(true);c.setRequestProperty("Content-Type","application/json");
        StringBuilder raw=new StringBuilder();long firstRaw=-1,firstText=-1;JSONObject timings=new JSONObject();String finish="";
        try {
            c.getOutputStream().write(body.toString().getBytes(StandardCharsets.UTF_8));
            int code=c.getResponseCode();if(code!=200)throw new IOException("HTTP "+code+": "+new String(c.getErrorStream().readAllBytes(),StandardCharsets.UTF_8));
            try(BufferedReader reader=new BufferedReader(new InputStreamReader(c.getInputStream(),StandardCharsets.UTF_8))){
                String line;
                while((line=reader.readLine())!=null){
                    if(!line.startsWith("data: "))continue;
                    String data=line.substring(6);if(data.equals("[DONE]"))break;
                    JSONObject part=new JSONObject(data);if(part.has("error"))throw new IOException(part.get("error").toString());
                    if(part.has("timings"))timings=part.getJSONObject("timings");
                    JSONArray choices=part.optJSONArray("choices");if(choices==null||choices.length()==0)continue;
                    JSONObject choice=choices.getJSONObject(0);JSONObject delta=choice.optJSONObject("delta");
                    if(delta!=null&&!delta.isNull("content")){
                        String token=delta.optString("content","");if(!token.isEmpty()){
                            if(firstRaw<0)firstRaw=SystemClock.elapsedRealtime();raw.append(token);
                            String out=clean(raw.toString());if(!out.isEmpty()&&firstText<0)firstText=SystemClock.elapsedRealtime();
                            if(!out.isEmpty())runOnUiThread(() -> transcript.setText(committed.toString()+out));
                        }
                    }
                    if(!choice.isNull("finish_reason"))finish=choice.optString("finish_reason");
                }
            }
        }finally{c.disconnect();}
        long end=SystemClock.elapsedRealtime();String output=clean(raw.toString());
        // An empty <asr_text> is a valid silent-audio result, not a language label to display.
        if(output.isEmpty()&&raw.indexOf("<asr_text>")<0)throw new IOException("响应缺少有效 ASR 文本标记");
        JSONObject result=new JSONObject().put("label",label).put("model",model).put("backendRequested",backend).put("warmup",warmup)
            .put("audioSeconds",duration).put("requestMs",end-begin).put("rtf",(end-begin)/1000.0/duration)
            .put("firstRawTokenMs",firstRaw<0?JSONObject.NULL:firstRaw-begin).put("firstTextMs",firstText<0?JSONObject.NULL:firstText-begin)
            .put("raw",raw.toString()).put("text",output).put("context",context).put("captureSource",label.startsWith("mic-")?captureSource:"file").put("finishReason",finish).put("serverTimings",timings)
            .put("queueMs",audioEndMs>0?begin-audioEndMs:0).put("captureToFirstTextMs",audioStartMs>0&&firstText>=0?firstText-audioStartMs:JSONObject.NULL)
            .put("captureEndToFinalMs",audioEndMs>0?end-audioEndMs:JSONObject.NULL).put("elapsedRealtimeMs",end);
        synchronized(results){results.put(result);}saveReport();
        String finalOutput=output;runOnUiThread(() -> {
            if(!finalOutput.isEmpty())committed.append(finalOutput).append('\n'); transcript.setText(committed.toString());
            metrics.setText(String.format(Locale.US,"%s · 音频 %.2fs · 处理 %.2fs · RTF %.2f · 首字 %s ms · 排队 %d ms",label,duration,(end-begin)/1000.0,result.optDouble("rtf"),result.opt("firstTextMs"),result.optLong("queueMs")));
        });
        return result;
    }
    private void runBench(){
        if(!ready||recording||testing||inference.getActiveCount()>0||!inference.getQueue().isEmpty())return;
        readContext();
        testing=true;setButtons();say("标准中英文音频测试：每条预热 1 次，计时 3 次。");
        inference.execute(() -> {
            try{
                for(String lang:new String[]{"zh","en"}){
                    byte[] wav;try(InputStream in=getAssets().open("samples/asr_"+lang+".wav")){wav=in.readAllBytes();}
                    for(int i=0;i<4&&!destroyed;i++)transcribe(wav,"sample-"+lang+"-"+i,i==0,0,0);
                }
                if(getIntent().getBooleanExtra("silence",false))transcribe(wave(new byte[SR*2]),"silence-1s",false,0,0);
                writeText(new File(getFilesDir(),"bench-done.json").toPath(),new JSONObject().put("runId",runId).put("complete",true).toString());
                say("标准测试完成。结果已保存到 work/asr-lab。");
            }catch(Exception e){eventError("bench",e);say("测试失败："+e);}
            finally{testing=false;saveReport();start.postDelayed(this::setButtons,100);}
        });
    }
    private void startMic(){
        if(!ready||testing||recording||inference.getActiveCount()>0||!inference.getQueue().isEmpty())return;
        readContext();
        captureSource="user-microphone";
        if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED){requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO},7);return;}
        chunkSeconds=new int[]{4,2,6}[chunkChoice.getSelectedItemPosition()];
        int min=AudioRecord.getMinBufferSize(SR,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT);
        if(min<=0){say("设备不支持本次 16kHz 录音配置");return;}
        try{
            recorder=new AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION,SR,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT,Math.max(min*2,SR*2));
            if(recorder.getState()!=AudioRecord.STATE_INITIALIZED)throw new IOException("AudioRecord 初始化失败");
            recorder.startRecording();recording=true;captureSession++;captureStart=SystemClock.elapsedRealtime();setButtons();say("正在听，每 "+chunkSeconds+" 秒提交一段，最长连续测试 120 秒。");
            new Thread(this::capture,"asr-microphone").start();
        }catch(Exception e){if(recorder!=null){recorder.release();recorder=null;}say(e.toString());}
    }
    private void runLoopback(){
        getIntent().removeExtra("mode"); // One-shot diagnostic, never replay on a later manual reload.
        try{
            loopbackPlayer=new MediaPlayer();
            try(android.content.res.AssetFileDescriptor fd=getAssets().openFd("samples/asr_zh.wav")){
                loopbackPlayer.setDataSource(fd.getFileDescriptor(),fd.getStartOffset(),fd.getLength());
            }
            loopbackPlayer.setAudioAttributes(new android.media.AudioAttributes.Builder().setUsage(android.media.AudioAttributes.USAGE_MEDIA).setContentType(android.media.AudioAttributes.CONTENT_TYPE_SPEECH).build());
            loopbackPlayer.prepare();
            loopbackPlayer.setOnCompletionListener(p -> {
                p.release();loopbackPlayer=null;start.postDelayed(this::stopMic,500);
            });
            chunkChoice.setSelection(1);startMic();captureSource="speaker-loopback";
            if(!recording)throw new IOException("回环测试需要已授权麦克风");
            say("扬声器回环测试：即将播放公开中文样例，麦克风每 2 秒识别一段。");
            start.postDelayed(() -> {if(loopbackPlayer!=null&&recording)loopbackPlayer.start();},400);
        }catch(Exception e){if(loopbackPlayer!=null){loopbackPlayer.release();loopbackPlayer=null;}stopMic();eventError("loopback",e);say(e.toString());}
    }
    private void capture(){
        AudioRecord local=recorder;
        byte[] block=new byte[640];ByteArrayOutputStream pending=new ByteArrayOutputStream();long segmentStart=captureStart;int number=0;
        try{
            while(recording&&SystemClock.elapsedRealtime()-captureStart<120000){
                int n=local.read(block,0,block.length);if(n<=0){if(recording)throw new IOException("AudioRecord read="+n);break;}
                pending.write(block,0,n);
                if(pending.size()>=SR*2*chunkSeconds){
                    if(!submitAudio(pending.toByteArray(),++number,segmentStart)){pending.reset();break;}
                    pending.reset();segmentStart=SystemClock.elapsedRealtime();
                }
            }
            if(pending.size()>=SR/2)submitAudio(pending.toByteArray(),++number,segmentStart);
        }catch(Exception e){eventError("microphone",e);say(e.toString());}
        finally{recording=false;try{local.stop();}catch(Exception ignored){}local.release();recorder=null;setButtons();}
    }
    private void readContext(){
        context=contextInput.getText().toString().trim();
        getPreferences(0).edit().putString("context",context).apply();
    }
    private boolean submitAudio(byte[] pcm,int number,long segmentStart){
        long segmentEnd=SystemClock.elapsedRealtime();double sum=0;
        for(int i=0;i+1<pcm.length;i+=2){short sample=(short)((pcm[i]&255)|(pcm[i+1]<<8));double f=sample/32768.0;sum+=f*f;}
        double rms=Math.sqrt(sum/(pcm.length/2));
        if(rms<0.003){say("正在听：第 "+number+" 段音量很低，跳过识别。");return true;}
        try{
            inference.execute(() -> {
                try{transcribe(wave(pcm),"mic-"+captureSession+"-"+number,false,segmentStart,segmentEnd);}
                catch(Exception e){eventError("mic-inference",e);say("识别失败："+e);stopMic();}
                finally{start.postDelayed(this::setButtons,100);}
            });return true;
        }catch(RejectedExecutionException e){recording=false;eventError("audio-queue-full",new IOException("推理落后超过 3 段，本段未识别；已停止录音"));say("推理跟不上，待处理超过 3 段；已停止录音。本段未识别。");return false;}
    }
    private void stopMic(){recording=false;AudioRecord r=recorder;if(r!=null)try{r.stop();}catch(Exception ignored){}say("录音已停止，正在处理剩余音频。");setButtons();}
    private static void writeText(java.nio.file.Path p,String s)throws IOException {Files.write(p,s.getBytes(StandardCharsets.UTF_8));}
    private static byte[] wave(byte[] pcm){ByteBuffer b=ByteBuffer.allocate(44+pcm.length).order(ByteOrder.LITTLE_ENDIAN);b.put("RIFF".getBytes(StandardCharsets.US_ASCII)).putInt(36+pcm.length).put("WAVEfmt ".getBytes(StandardCharsets.US_ASCII)).putInt(16).putShort((short)1).putShort((short)1).putInt(SR).putInt(SR*2).putShort((short)2).putShort((short)16).put("data".getBytes(StandardCharsets.US_ASCII)).putInt(pcm.length).put(pcm);return b.array();}
    private static double wavDuration(byte[] wav)throws IOException {
        ByteBuffer b=ByteBuffer.wrap(wav).order(ByteOrder.LITTLE_ENDIAN);int rate=0,align=0;
        for(int pos=12;pos+8<=wav.length;){int size=b.getInt(pos+4);if(size<0||size>wav.length-pos-8)throw new IOException("Invalid WAV chunk");String tag=new String(wav,pos,4,StandardCharsets.US_ASCII);if(tag.equals("fmt ")&&size>=16){rate=b.getInt(pos+12);align=b.getShort(pos+20)&65535;}if(tag.equals("data")&&rate>0&&align>0)return size/(double)(rate*align);pos+=8+size+(size&1);}
        throw new IOException("Missing WAV fmt/data");
    }
    private void eventError(String stage,Exception e){try{synchronized(results){results.put(new JSONObject().put("error",e.toString()).put("stage",stage).put("model",model).put("backendRequested",backend));}saveReport();}catch(Exception ignored){}}
    private synchronized void saveReport(){try{
        JSONObject doc=new JSONObject().put("schema",1).put("runId",runId).put("device",Build.MODEL).put("soc",Build.SOC_MODEL).put("sdk",Build.VERSION.SDK_INT).put("model",model).put("backendRequested",backend).put("loadMs",loadMs).put("threads",4).put("quantization","Q8_0 decoder + Q8_0 mmproj").put("streamingMode","independent PCM chunks; SSE token output; no cross-chunk acoustic state").put("modelRoot",MODELS.toString());
        synchronized(results){doc.put("results",new JSONArray(results.toString()));}
        String json=doc.toString(2);File tmp=new File(getFilesDir(),"latest.json.tmp");writeText(tmp.toPath(),json);Files.move(tmp.toPath(),new File(getFilesDir(),"latest.json").toPath(),java.nio.file.StandardCopyOption.REPLACE_EXISTING);
        if(Environment.isExternalStorageManager()){REPORTS.mkdirs();writeText(new File(REPORTS,runId+".json").toPath(),json);File log=new File(getFilesDir(),runId+"-engine.log");if(log.exists())Files.copy(log.toPath(),new File(REPORTS,log.getName()).toPath(),java.nio.file.StandardCopyOption.REPLACE_EXISTING);}
    }catch(Exception e){android.util.Log.e("AsrLab","Report write failed",e);}}
    private void stopEngine(){ready=false;Process p=engine;engine=null;if(p!=null){p.destroy();try{if(!p.waitFor(2,TimeUnit.SECONDS))p.destroyForcibly();}catch(InterruptedException e){Thread.currentThread().interrupt();}}stopService(new Intent(this,LabService.class));setButtons();}
    @Override protected void onPause(){super.onPause();if(recording)stopMic();}
    @Override protected void onDestroy(){destroyed=true;if(loopbackPlayer!=null){loopbackPlayer.release();loopbackPlayer=null;}stopMic();inference.shutdownNow();control.shutdownNow();stopEngine();super.onDestroy();}
}
