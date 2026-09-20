package com.dsharnessmobile.shell

import android.app.*
import android.content.*
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.graphics.PixelFormat
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.media.*
import android.os.*
import android.view.*
import android.widget.TextView
import org.json.JSONObject
import java.io.File
import java.util.concurrent.Executors

/** Native presentation/polling survives WebView pause. Never reads tool output or history. */
internal class SpeechOverlay(private val svc: OverlayService) {
 private val main=svc.main
 private val worker=Executors.newSingleThreadExecutor()
 private var textView:SpeechCaptionView?=null
 private var fading=false
 private var replySession=""
 private val replyPolicy=SpeechReplyPolicy()
 private var replyCapture=""
 private var audio:MediaPlayer?=null
 private var pcmPlayer:SpeechPcmPlayer?=null
 private var audioFile:File?=null
 private var focus:AudioFocusRequest?=null
 private var transport:SpeechTransport?=null
 private val playbackWorker=Executors.newSingleThreadExecutor()
 private var playbackTransport:SpeechTransport?=null
 private var audioPending=false
 private var audioGeneration=0L
 private var failureKey=""
 private var primed=false
 private var pending=false
 private var enabled=false
 private var generation=0L
 private var target=""
 private var revision=-1
 private var csrf=""
 private var seen=0L
 private var spoken=""
 private var feedPhase="idle"
 private var feedSequence=0L
 private var captureFeedSequence=0L
 private var submittedCapture=""
 private var awaitingReply=false
 private var feedbackTarget=""
 private var startingUntil=0L
 private var endingUntil=0L
 private var error=""
 private var asrAvailable=true
 private var gamepad=false
 private val keys=SpeechKeyPolicy()
 private val inputManager=svc.getSystemService(android.hardware.input.InputManager::class.java)
 private val deviceListener=object:android.hardware.input.InputManager.InputDeviceListener {
  override fun onInputDeviceAdded(id:Int){}
  override fun onInputDeviceChanged(id:Int){keys.disconnected(id)}
  override fun onInputDeviceRemoved(id:Int){keys.disconnected(id)}
 }
 fun focusChanged(focused:Boolean){if(!focused)keys.reset()}
 private var dead=false
 private val audioManager=svc.getSystemService(AudioManager::class.java)
 private val keyguard=svc.getSystemService(KeyguardManager::class.java)
 private val power=svc.getSystemService(PowerManager::class.java)
 private val lockedReceiver=object:BroadcastReceiver(){override fun onReceive(c:Context?,i:Intent?){if(i?.action==Intent.ACTION_SCREEN_OFF){removeText();stopAudio()}}}
 init {inputManager.registerInputDeviceListener(deviceListener,main);SpeechPlayback.cancel={stopAudio()};svc.registerReceiver(lockedReceiver,IntentFilter(Intent.ACTION_SCREEN_OFF))}
 fun notice(message:String){error=message;android.widget.Toast.makeText(svc,message,android.widget.Toast.LENGTH_SHORT).show()}
 fun watch(){
  if(dead||!SpeechSessionFocus.enabled)return
  if(!enabled){replyPolicy.reset(System.currentTimeMillis());enabled=true;generation++;seen=0;primed=false;spoken="";error="";main.post(tick);main.post(feedbackTick)}
 }
 fun activateAndToggle(){
  watch()
  // Finishing a capture always addresses its original session, even after a UI switch.
  val ongoing=BackgroundVoiceService.snapshot
  if(BackgroundVoiceService.instance!=null&&ongoing.optBoolean("direct")){
   if(ongoing.optString("phase")=="recording"){endingUntil=SystemClock.uptimeMillis()+1500;svc.panel.speechPhase("transcribing");svc.startService(Intent(svc,BackgroundVoiceService::class.java).setAction(BackgroundVoiceService.FINISH))}
   return
  }
  if(!enabled||svc.activeSessionId.isBlank()){svc.flashStatus("先在 DeepCode 打开一个会话");return}
  if(target!=svc.activeSessionId){target=svc.activeSessionId;generation++;seen=0;primed=false;spoken="";transport?.cancel();removeText()}
  stopAudio()
  if(!asrAvailable){notice("ASR 已关闭，可继续查看回复");return}
  val state=BackgroundVoiceService.snapshot
  if(BackgroundVoiceService.instance!=null){
   if(state.optString("sessionId")!=target){error="另一个会话正在收音";return}
   if(state.optString("phase")=="recording")svc.startService(Intent(svc,BackgroundVoiceService::class.java).setAction(BackgroundVoiceService.FINISH))
   return
  }
  if(state.optString("phase") in listOf("send-error","done")){
   error=state.optString("error").ifBlank{"有待确认的转录，请先处理"};svc.startActivity(Intent(svc,BackgroundVoiceActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK).putExtra("sessionId",state.optString("sessionId")));return
  }
  if(svc.checkSelfPermission(android.Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED){
   notice("请在语音页面授权麦克风，再按录音")
   svc.startActivity(Intent(svc,BackgroundVoiceActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK).putExtra("sessionId",target).putExtra("direct",true));return
  }
  try{error="";startingUntil=SystemClock.uptimeMillis()+3000;svc.panel.speechPhase("preparing");svc.startForegroundService(Intent(svc,BackgroundVoiceService::class.java).setAction(BackgroundVoiceService.START).putExtra("sessionId",target).putExtra("direct",true))}
  catch(e:Exception){notice("无法后台启动麦克风，请打开 DeepCode 后再试")}
 }
 fun disable(){NotificationAttention.clearCompanion();keys.reset();enabled=false;generation++;main.removeCallbacks(tick);main.removeCallbacks(feedbackTick);replyPolicy.clear(System.currentTimeMillis());feedbackTarget="";awaitingReply=false;feedPhase="idle";startingUntil=0;endingUntil=0;transport?.cancel();transport=null;stopAudio();removeText();if(BackgroundVoiceService.snapshot.optBoolean("direct"))svc.stopService(Intent(svc,BackgroundVoiceService::class.java));error="";csrf="";revision=-1;gamepad=false;primed=false;svc.panel.speechPhase("idle");svc.speechBall(false)}
 fun destroy(){inputManager.unregisterInputDeviceListener(deviceListener);dead=true;disable();SpeechPlayback.cancel=null;worker.shutdownNow();playbackWorker.shutdownNow();runCatching{svc.unregisterReceiver(lockedReceiver)}}
 fun resized(){removeText()}
 fun foregroundChanged(){if(SpeechSessionFocus.foreground)removeText()}
 fun replyStatus():JSONObject = JSONObject().put("visible",textView!=null).put("sessionId",replySession)
  .put("busy",textView?.busy?:false).put("textLength",textView?.textLength?:0)
  .put("shader",textView?.surface?.shaderActive?:false).put("frames",textView?.surface?.frames?:0)
  .put("fading",fading)
  .put("enabled",enabled).put("target",target).put("selectedSession",svc.activeSessionId)
  .put("interactive",power.isInteractive).put("locked",keyguard.isKeyguardLocked)
  .put("foreground",SpeechSessionFocus.foreground).put("feedPhase",feedPhase).put("pending",pending)
 private fun openHistory(){
  val id=replySession;if(id.isBlank()||id!=target)return
  SpeechSessionFocus.requestOpen(id)
  try{svc.startActivity(Intent(svc,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_SINGLE_TOP));removeText()}
  catch(_:Exception){SpeechSessionFocus.ackOpen(id);notice("无法打开对话，请返回 DeepCode")}
 }
 fun remoteAction(action:String){
  when(action){
   "record"->activateAndToggle()
   // Desktop dictation needs no draft editing or confirm press. Explicit typed input still has its send button.
   "send", "delete" -> Unit
  }
 }
 fun dispatch(event:KeyEvent):Boolean{
  val isPad=(event.source and InputDevice.SOURCE_GAMEPAD)==InputDevice.SOURCE_GAMEPAD||(event.source and InputDevice.SOURCE_JOYSTICK)==InputDevice.SOURCE_JOYSTICK
  if(!enabled||!gamepad||!isPad||!svc.hasCompanionKeyFocus())return false
  if(event.keyCode !in listOf(KeyEvent.KEYCODE_BUTTON_Y,KeyEvent.KEYCODE_BUTTON_X,KeyEvent.KEYCODE_BUTTON_B))return false
  if(keys.press(event.deviceId,event.keyCode,true,true,event.action==KeyEvent.ACTION_DOWN,event.repeatCount))when(event.keyCode){
   KeyEvent.KEYCODE_BUTTON_Y->activateAndToggle()
   KeyEvent.KEYCODE_BUTTON_B, KeyEvent.KEYCODE_BUTTON_X -> Unit
  }
  return true
 }
 // Mic amplitude is process-local. Do not poll the network at animation frequency.
 private val feedbackTick=object:Runnable{override fun run(){
  if(!enabled||dead)return
  val focused=replyPolicy.focus(svc.activeSessionId,System.currentTimeMillis())
  if(feedbackTarget!=focused){replyCapture="";feedbackTarget=focused;feedPhase="idle";feedSequence=0;captureFeedSequence=0;awaitingReply=false;submittedCapture=""}
  val state=BackgroundVoiceService.snapshot
  val raw=if(state.optBoolean("direct"))state.optString("phase") else "idle"
  val mine=state.optString("sessionId")==focused
  val capturing=raw in listOf("preparing","recording","transcribing","sending")
  if(mine&&capturing&&replyCapture!=state.optString("id")){
   replyCapture=state.optString("id");replyPolicy.reset(System.currentTimeMillis());removeText()
  }
  if(mine&&raw=="sent")replyPolicy.submission(state.optString("id"),state.optLong("submittedAt"))
  if(mine&&capturing){captureFeedSequence=feedSequence;submittedCapture="";awaitingReply=true}
  if(mine&&raw=="sent"&&submittedCapture!=state.optString("id")){
   submittedCapture=state.optString("id");awaitingReply=!(feedSequence>captureFeedSequence&&feedPhase in listOf("done","error","stopped"))
  }
  if(mine&&raw in listOf("error","send-error","canceled","done"))awaitingReply=false
  if(capturing)startingUntil=0
  val capture=when{
   raw=="recording"&&SystemClock.uptimeMillis()<endingUntil -> "transcribing"
   capturing -> raw
   SystemClock.uptimeMillis()<startingUntil -> "preparing"
   else -> "idle"
  }
  val level=state.optDouble("level",0.0).toFloat().coerceIn(0f,1f)
  val feedback=SpeechFeedback.phase(capture,feedPhase=="working",awaitingReply,audioPending||audio!=null||pcmPlayer!=null)
  svc.speechBall(capture=="recording" && BackgroundVoiceService.instance!=null, level, feedback)
  val bars=state.optJSONArray("waveform")
  val levels=FloatArray(5){i -> maxOf((bars?.optDouble(i*7,0.0)?:0.0).toFloat(),level*floatArrayOf(.45f,.75f,1f,.75f,.45f)[i]).coerceIn(0f,1f)}
  svc.panel.speechPhase(SpeechFeedback.phase(capture,feedPhase=="working",awaitingReply,audioPending||audio!=null||pcmPlayer!=null),levels)
  main.postDelayed(this,80)
 }}
 private val tick=object:Runnable{override fun run(){
  if(!enabled||dead)return
  if(keyguard.isKeyguardLocked||!power.isInteractive){NotificationAttention.clearCompanion();removeText();stopAudio();main.postDelayed(this,1000);return}
  val focused=replyPolicy.focus(svc.activeSessionId,System.currentTimeMillis())
  if(target!=focused){target=focused;generation++;seen=0;primed=false;spoken="";error="";transport?.cancel();stopAudio();removeText()}
  if(target.isBlank())removeText()
  if(!pending&&target.isNotBlank()){
   pending=true;val token=generation;val sid=target
   val companionActive=!SpeechSessionFocus.foreground || svc.expanded
   val sayReady=!audioPending&&audio==null&&pcmPlayer==null&&!VoiceInputController.microphoneInUse()
   worker.execute{
    val client=SpeechTransport(svc);transport=client
    val result=runCatching{val config=client.config();val feed=if(config.optBoolean("enabled")) client.post(config,JSONObject().put("action","feed").put("sessionId",sid).put("sayReady",sayReady).put("companionActive",companionActive)) else JSONObject();config to feed}
    main.post{
     pending=false;if(!enabled||dead||token!=generation)return@post
     result.onSuccess{(config,feed)->
      if(!config.optBoolean("enabled")){disable();return@onSuccess}
      asrAvailable=config.optBoolean("asrEnabled")
      if(revision!=config.optInt("revision")||csrf!=config.optString("csrf")){if(revision!=-1){replyPolicy.reset(System.currentTimeMillis());removeText();stopAudio();seen=feed.optLong("seq");spoken=feed.optString("finalId")};revision=config.optInt("revision");csrf=config.optString("csrf")}
      gamepad=config.optBoolean("overlayGamepad",true)
      if(!config.optBoolean("ttsEnabled"))stopAudio()
      val state=BackgroundVoiceService.snapshot
      val mine=state.optString("sessionId")==sid
      val phase=state.optString("phase")
      feedPhase=feed.optString("phase","idle");feedSequence=feed.optLong("seq")
      if(feedSequence>captureFeedSequence&&feedPhase in listOf("done","error","stopped"))awaitingReply=false
      if(mine&&state.optBoolean("direct")&&phase in listOf("error","send-error")){
       val key=state.optString("id")+phase+state.optString("error")
       if(failureKey!=key){failureKey=key;notice(BackgroundVoiceService.label(state))}
      }
      NotificationAttention.companion=NotificationAttention.Companion(sid,SystemClock.uptimeMillis())
      if(mine&&state.optBoolean("direct")&&phase=="sent")replyPolicy.submission(state.optString("id"),state.optLong("submittedAt"))
      val ids=feed.optJSONArray("requestIds")
      val display=replyPolicy.display(List(ids?.length()?:0){ids!!.optString(it)},feed.optLong("turn",-1),feedPhase,feed.optString("text"),feed.optLong("textAt"),System.currentTimeMillis())
      if(display!=null)render(display.text,working=display.busy)
      else fadeText()
      val seq=feed.optLong("seq");primed=true;seen=maxOf(seen,seq)
      // Only explicit say requests can start playback. Assistant text is display-only.
      val utterance=feed.optJSONObject("say")
      if(config.optBoolean("ttsEnabled")&&utterance!=null&&utterance.optString("id")!=spoken){
       spoken=utterance.optString("id")
       if(!audioPending&&audio==null&&pcmPlayer==null&&!VoiceInputController.microphoneInUse())
        requestAudio(config,utterance.optString("text"),token)
      }
     }.onFailure{NotificationAttention.clearCompanion();feedPhase="idle";awaitingReply=false;stopAudio();removeText();val message="语音服务不可用，请打开 DeepCode 检查插件设置";if(error!=message)notice(message)}
    }
   }
  }
  main.postDelayed(this,700)
 }}
 private fun render(value:String,working:Boolean=false){
  if(keyguard.isKeyguardLocked||!power.isInteractive||SpeechSessionFocus.foreground){removeText();return}
  val dp=svc.resources.displayMetrics.density
  val metrics=if(Build.VERSION.SDK_INT>=30)svc.wm.currentWindowMetrics else null
  val screenWidth=metrics?.bounds?.width()?:svc.resources.displayMetrics.widthPixels
  val desired=minOf(screenWidth-(20*dp).toInt(),(440*dp).toInt())
  var view=textView
  if(fading){view?.animate()?.cancel();view?.alpha=1f;fading=false}
  if(view==null){
   view=SpeechCaptionView(svc).apply{setOnClickListener{openHistory()}}
   val params=WindowManager.LayoutParams(desired,WindowManager.LayoutParams.WRAP_CONTENT,WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED,PixelFormat.TRANSLUCENT).apply{
    if(value.isBlank())flags=flags or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
    gravity=Gravity.TOP or Gravity.CENTER_HORIZONTAL;y=(6*dp).toInt();setTitle("DeepCode reply")
    // Let WindowManager keep the content below status bars and the physical camera cutout.
    if(Build.VERSION.SDK_INT>=30)setFitInsetsTypes(WindowInsets.Type.statusBars() or WindowInsets.Type.displayCutout())
   }
   view.show(value.takeLast(600),working)
   try{svc.wm.addView(view,params);textView=view;replySession=target}catch(_:Exception){return}
  }else{
   val params=view.layoutParams as WindowManager.LayoutParams
   view.show(value.takeLast(600),working)
   params.width=desired
   params.flags=if(value.isBlank())params.flags or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE else params.flags and WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE.inv()
   runCatching{svc.wm.updateViewLayout(view,params)}
  }
 }
 private fun fadeText(){
  val view=textView?:return
  if(fading)return
  fading=true
  view.animate().alpha(0f).setDuration(250).withEndAction{if(textView===view)removeText()}.start()
 }
 private fun removeText(){replySession="";fading=false;textView?.animate()?.cancel();textView?.let{runCatching{svc.wm.removeView(it)}};textView=null}
 private fun requestAudio(config:JSONObject,text:String,token:Long){
  if(text.isBlank()||audioPending||VoiceInputController.microphoneInUse())return
  val services=config.optJSONArray("services")
  val stream=(0 until (services?.length()?:0)).mapNotNull{services?.optJSONObject(it)}.any{it.optString("id")==config.optString("ttsProvider")&&it.optString("baseUrl").matches(Regex("wss?://.*"))}
  if(stream){requestStreamAudio(config,text,token);return}
  audioPending=true;val audioToken=audioGeneration
  playbackWorker.execute{
   val client=SpeechTransport(svc);playbackTransport=client
   val result=runCatching{client.post(config,JSONObject().put("action","tts").put("text",text)).getString("audio")}
   main.post{audioPending=false;if(!enabled||dead||token!=generation||audioToken!=audioGeneration||VoiceInputController.microphoneInUse())return@post;result.onSuccess{play(it)}.onFailure{svc.panel.statusText?.text="朗读失败，文字回复仍可查看"}}
  }
 }
 private fun requestStreamAudio(config:JSONObject,text:String,token:Long){
  stopAudio();if(keyguard.isKeyguardLocked||!power.isInteractive)return
  try{beginPlayback()}catch(_:Exception){stopAudio();return}
  audioPending=true;val audioToken=audioGeneration;val player=SpeechPcmPlayer();pcmPlayer=player
  val client=SpeechTransport(svc);playbackTransport=client
  playbackWorker.execute{
   val result=runCatching{client.stream(config,text){event->player.accept(event)}}
   player.close()
   main.post{audioPending=false;if(audioToken==audioGeneration){stopAudio();if(result.isFailure&&enabled&&!dead&&token==generation)notice("朗读失败，文字回复仍可查看")}}
  }
 }
 private fun beginPlayback(){
  val nm=svc.getSystemService(NotificationManager::class.java);nm.createNotificationChannel(NotificationChannel("speech-playback","语音朗读",NotificationManager.IMPORTANCE_LOW))
  val stop=PendingIntent.getService(svc,441,Intent(svc,OverlayService::class.java).setAction("speech.disable"),PendingIntent.FLAG_IMMUTABLE)
  val note=Notification.Builder(svc,"speech-playback").setSmallIcon(android.R.drawable.ic_btn_speak_now).setContentTitle("DeepCode 正在朗读").setContentText("所选会话的回复").addAction(Notification.Action.Builder(null,"停止语音",stop).build()).build()
  if(Build.VERSION.SDK_INT>=29)svc.startForeground(441,note,ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)else svc.startForeground(441,note)
  val attributes=AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANT).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()
  focus=AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK).setAudioAttributes(attributes).setOnAudioFocusChangeListener{change->if(change<0)stopAudio()}.build()
  check(audioManager.requestAudioFocus(focus!!)==AudioManager.AUDIOFOCUS_REQUEST_GRANTED)
 }
 private fun play(encoded:String){
  stopAudio();if(keyguard.isKeyguardLocked||!power.isInteractive)return
  try{
   beginPlayback()
   val attributes=AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANT).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()
   val file=File.createTempFile("speech-",".mp3",svc.cacheDir);audioFile=file;file.writeBytes(android.util.Base64.decode(encoded,android.util.Base64.DEFAULT))
   audio=MediaPlayer().apply{setAudioAttributes(attributes);setDataSource(file.absolutePath);setOnPreparedListener{it.start()};setOnCompletionListener{stopAudio()};setOnErrorListener{_,_,_->stopAudio();true};prepareAsync()}
  }catch(_:Exception){stopAudio()}
 }
 private fun stopAudio(){audioGeneration++;pcmPlayer?.close();pcmPlayer=null;playbackTransport?.cancel();playbackTransport=null;audio?.let{runCatching{it.release()}};audio=null;audioFile?.delete();audioFile=null;focus?.let{audioManager.abandonAudioFocusRequest(it)};focus=null;svc.stopForeground(Service.STOP_FOREGROUND_REMOVE)}
}
