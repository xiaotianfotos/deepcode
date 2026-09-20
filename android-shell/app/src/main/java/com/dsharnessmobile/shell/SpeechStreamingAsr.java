package com.dsharnessmobile.shell;

import android.content.Context;
import android.util.Base64;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Consumer;

/** Sends bounded PCM packets off the AudioRecord thread. Credentials stay in Host. */
final class SpeechStreamingAsr {
 private final Context context;
 private final JSONObject config;
 private final SpeechTransport transport;
 private final String streamId;
 private final Consumer<String> partial;
 private final ExecutorService sender=Executors.newSingleThreadExecutor();
 private final AtomicInteger queued=new AtomicInteger();
 private final ByteArrayOutputStream packet=new ByteArrayOutputStream();
 private volatile Exception failure;
 private volatile boolean closed;
 private int sequence;
 SpeechStreamingAsr(Context context,JSONObject config,Consumer<String> partial)throws Exception{
  this.context=context;this.config=config;this.partial=partial;transport=new SpeechTransport(context);
  streamId=transport.post(config,new JSONObject().put("action","asr-start")).getString("streamId");
 }
 static boolean selected(JSONObject config){
  if(config==null)return false;
  org.json.JSONArray list=config.optJSONArray("services");if(list==null)return false;
  for(int i=0;i<list.length();i++){JSONObject s=list.optJSONObject(i);if(s!=null&&s.optString("id").equals(config.optString("asrProvider")))return s.optString("baseUrl").matches("wss?://.*");}
  return false;
 }
 synchronized void append(byte[] pcm,int length)throws Exception{
  check();packet.write(pcm,0,length);if(packet.size()>=6400)flush();
 }
 private void check()throws Exception{if(closed)throw new IOException("录音流已关闭");if(failure!=null)throw failure;}
 private void flush()throws Exception{
  if(packet.size()==0)return;
  if(queued.get()>=10)throw new IOException("语音网络过慢，请重新录音");
  byte[] pcm=packet.toByteArray();packet.reset();queued.incrementAndGet();
  sender.execute(()->{try{check();JSONObject r=transport.post(config,new JSONObject().put("action","asr-chunk").put("streamId",streamId).put("sequence",sequence++).put("audio",Base64.encodeToString(pcm,Base64.NO_WRAP)));String text=r.optString("partial");if(!closed&&!text.isEmpty())partial.accept(text);}catch(Exception e){failure=e;}finally{queued.decrementAndGet();}});
 }
 String finish()throws Exception{
  synchronized(this){check();flush();}
  try{return sender.submit(()->{check();return transport.post(config,new JSONObject().put("action","asr-finish").put("streamId",streamId).put("sequence",sequence)).getString("text");}).get(40,TimeUnit.SECONDS);}
  finally{close();}
 }
 synchronized void close(){
  if(closed)return;closed=true;transport.cancel();sender.shutdownNow();
  // Separate connection: never wait on a blocked upload while canceling a capture.
  Thread cleanup=new Thread(()->{try{new SpeechTransport(context).post(config,new JSONObject().put("action","asr-cancel").put("streamId",streamId));}catch(Exception ignored){}},"speech-stream-close");cleanup.setDaemon(true);cleanup.start();
 }
}
