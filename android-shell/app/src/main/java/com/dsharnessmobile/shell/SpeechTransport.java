package com.dsharnessmobile.shell;
import android.content.Context;
import org.json.JSONObject;
import java.net.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
/** Authenticated loopback only. Upstream service credentials remain in the Host. */
public final class SpeechTransport {
 private final Context context; private volatile HttpURLConnection connection; private volatile boolean closed;
 public SpeechTransport(Context context){this.context=context.getApplicationContext();}
 public void cancel(){closed=true;HttpURLConnection c=connection;if(c!=null)c.disconnect();}
 public JSONObject config() throws Exception {return request(null);}
 public JSONObject post(JSONObject config,JSONObject body)throws Exception{
  body.put("csrf",config.getString("csrf")).put("revision",config.getInt("revision"));return request(body);
 }
 public interface StreamConsumer {void accept(JSONObject event)throws Exception;}
 public void stream(JSONObject config,String text,StreamConsumer consumer)throws Exception{
  if(closed)throw new IOException("朗读已取消");
  JSONObject body=new JSONObject().put("action","tts-stream").put("text",text).put("csrf",config.getString("csrf")).put("revision",config.getInt("revision"));
  HttpURLConnection c=(HttpURLConnection)new URL("http://127.0.0.1:3080/api/android/speech").openConnection(Proxy.NO_PROXY);connection=c;
  c.setInstanceFollowRedirects(false);c.setConnectTimeout(3000);c.setReadTimeout(30000);
  try{
   EngineAuth.INSTANCE.attach(context,c);c.setRequestMethod("POST");c.setDoOutput(true);c.setRequestProperty("Content-Type","application/json");
   try(OutputStream out=c.getOutputStream()){out.write(body.toString().getBytes(StandardCharsets.UTF_8));}
   if(c.getResponseCode()!=200)throw new IOException("流式朗读服务不可用："+c.getResponseCode());
   boolean done=false;int total=0;
   try(BufferedReader reader=new BufferedReader(new InputStreamReader(c.getInputStream(),StandardCharsets.UTF_8))){
    String line;while((line=reader.readLine())!=null){if(closed)throw new IOException("朗读已取消");total+=line.length();if(line.length()>3_000_000||total>12_000_000)throw new IOException("朗读响应过大");JSONObject event=new JSONObject(line);if(event.optString("type").equals("error"))throw new IOException("流式朗读失败");consumer.accept(event);if(event.optString("type").equals("done")){done=true;break;}}
   }
   if(!done)throw new IOException("朗读流提前结束");
  }finally{c.disconnect();if(connection==c)connection=null;}
 }
 private JSONObject request(JSONObject body)throws Exception{
  if(closed)throw new IOException("语音请求已取消");
  HttpURLConnection c=(HttpURLConnection)new URL("http://127.0.0.1:3080/api/android/speech").openConnection(Proxy.NO_PROXY);
  c.setInstanceFollowRedirects(false);c.setConnectTimeout(3000);c.setReadTimeout(body==null?4000:125000);connection=c;
  try{
   EngineAuth.INSTANCE.attach(context,c);
   if(body!=null){c.setRequestMethod("POST");c.setDoOutput(true);c.setRequestProperty("Content-Type","application/json");try(OutputStream out=c.getOutputStream()){out.write(body.toString().getBytes(StandardCharsets.UTF_8));}}
   int code=c.getResponseCode();if(code==401)EngineAuth.INSTANCE.handleUnauthorized(context);
   if(code==404)throw new FileNotFoundException("语音服务插件尚未安装");
   InputStream in=code>=400?c.getErrorStream():c.getInputStream();if(in==null)throw new IOException("语音服务不可用："+code);
   ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] block=new byte[8192];int size;
   try(in){while((size=in.read(block))!=-1){if(closed)throw new IOException("已取消");if(out.size()+size>12000000)throw new IOException("语音响应过大");out.write(block,0,size);}}
   JSONObject result=new JSONObject(out.toString("UTF-8"));if(code!=200)throw new IOException(result.optString("error","语音服务失败"));return result;
  }finally{c.disconnect();if(connection==c)connection=null;}
 }
}
