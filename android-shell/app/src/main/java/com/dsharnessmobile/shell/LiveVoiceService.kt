package com.dsharnessmobile.shell

import android.app.*
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.*
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.AudioDeviceInfo
import android.os.*
import android.provider.Settings
import android.view.*
import androidx.core.app.NotificationCompat
import org.json.JSONObject
import java.util.UUID

/** User-owned continuous microphone FGS. No boot restart or hidden recovery. */
class LiveVoiceService : Service() {
  private val main=Handler(Looper.getMainLooper())
  private var transport:LiveVoiceTransport?=null
  private var wake:PowerManager.WakeLock?=null
  private var focus:AudioFocusRequest?=null
  private var oldMode=AudioManager.MODE_NORMAL
  private var oldSpeaker=false
  private var audioConfigured=false
  private var muted=false
  private val audioFocusPolicy=LiveAudioFocusPolicy()
  private var target=""
  private var ended=false
  override fun onBind(intent:Intent?)=null
  override fun onStartCommand(intent:Intent?, flags:Int,startId:Int):Int {
    if(intent?.action==STOP){stopSelf();return START_NOT_STICKY}
    if(intent?.action==MUTE){if(transport==null)stopSelf() else {muted=!muted;transport?.mute(muted);render()};return START_NOT_STICKY}
    if(intent?.action!=START||transport!=null)return START_NOT_STICKY
    target=intent.getStringExtra("sessionId").orEmpty()
    try {
      check(target.matches(Regex("session-[A-Za-z0-9-]+"))){"请先选择 Codex 会话"}
      check(Settings.canDrawOverlays(this)){"请先允许显示语音状态图标"}
      check(VoiceInputController.claimMicrophone(this)){"请先结束当前录音"}
      SpeechPlayback.stop()
      instance=this;state=JSONObject().put("phase","connecting").put("message","正在连接 GPT Live").put("sessionId",target)
      val nm=getSystemService(NotificationManager::class.java)
      nm.createNotificationChannel(NotificationChannel(CHANNEL,"GPT Live 实时语音",NotificationManager.IMPORTANCE_LOW))
      if(Build.VERSION.SDK_INT>=29)startForeground(ID,notification(),ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE or ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
      else startForeground(ID,notification())
      wake=getSystemService(PowerManager::class.java).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"DeepCode:LiveVoice").apply{acquire()}
      val audio=getSystemService(AudioManager::class.java)
      oldMode=audio.mode;oldSpeaker=audio.isSpeakerphoneOn;audioConfigured=true
      focus=AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
        .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
        .setOnAudioFocusChangeListener({change->handleAudioFocus(change)},main).build()
      check(audio.requestAudioFocus(focus!!)==AudioManager.AUDIOFOCUS_REQUEST_GRANTED){"无法获得麦克风音频焦点"}
      audio.registerAudioDeviceCallback(routeChanges,main)
      configureRoute()
      OverlayService.instance?.speechBall(false)
      transport=LiveVoiceTransport(applicationContext,target,"live-"+UUID.randomUUID(),{ids->main.post{
        if(!ended){val next=JSONObject(state.toString());for(key in listOf("codexThreadId","realtimeSessionId","sessionTitle","relationship","historyError"))if(ids.has(key))next.put(key,ids.get(key));state=next}
      }}){phase,message->main.post{
        if(!ended){state=JSONObject(state.toString()).put("phase",phase).put("message",message);if(phase=="error")finishError(message) else render()}
      }}
      val live=transport!!
      live.mute(muted)
      live.setAudioFocus(audioFocusPolicy.paused,audioFocusPolicy.gain)
      Thread({
        // Refresh the app's own paired loopback endpoint before Codex reads it.
        // No pairing, permission changes, or desktop ADB keys are involved.
        val adb=runCatching {
          JSONObject(AdbState.adbShellExecute(applicationContext,EngineManager(applicationContext),"getprop ro.product.device"))
        }.getOrNull()
        val adbReady=adb?.optBoolean("ok")==true && adb.optString("stdout").trim().isNotEmpty()
        main.post{if(!ended)state=JSONObject(state.toString()).put("adbConnected",adbReady)
          .put("adbMessage",if(adbReady)"本机 ADB 已连接" else "本机 ADB 不可用，请检查安卓调试授权")}
        live.run()
      },"deepcode-live").start()
      main.post(pulse)
    }catch(e:Exception){finishError(e.message?:"无法开启实时语音")}
    return START_NOT_STICKY
  }
  private val routeChanges=object:android.media.AudioDeviceCallback(){
    override fun onAudioDevicesAdded(devices:Array<AudioDeviceInfo>){configureRoute()}
    override fun onAudioDevicesRemoved(devices:Array<AudioDeviceInfo>){configureRoute()}
  }
  internal fun playbackStarted(){main.post{if(!ended&&instance===this)configureRoute()}}
  private fun configureRoute(){
    if(ended||!audioConfigured||audioFocusPolicy.paused)return
    val audio=getSystemService(AudioManager::class.java)
    runCatching {
      audio.mode=AudioManager.MODE_IN_COMMUNICATION
      if(Build.VERSION.SDK_INT>=31){
        val devices=audio.availableCommunicationDevices
        val id=LiveAudioRoutePolicy.choose(devices.map{LiveAudioRoutePolicy.Device(it.id,it.type)},audio.communicationDevice?.id)
        val selected=devices.firstOrNull{it.id==id}
        val ok=selected!=null&&audio.setCommunicationDevice(selected)
        state=JSONObject(state.toString()).put("routeRequested",selected?.type?:-1).put("routeAccepted",ok)
      }else{
        val external=audio.getDevices(AudioManager.GET_DEVICES_OUTPUTS).any{LiveAudioRoutePolicy.external(it.type)}
        audio.isSpeakerphoneOn=!external
      }
    }.onFailure{state=JSONObject(state.toString()).put("routeAccepted",false)}
  }
  private fun handleAudioFocus(change:Int){
    if(ended || instance!==this)return
    android.util.Log.i("DeepCodeLiveVoice","audio focus change=$change")
    val mode=audioFocusPolicy.change(change)
    state=JSONObject(state.toString()).put("audioFocus",mode.name.lowercase()).put("audioPaused",audioFocusPolicy.paused)
    transport?.setAudioFocus(audioFocusPolicy.paused,audioFocusPolicy.gain)
    if(mode==LiveAudioFocusPolicy.Mode.ACTIVE)configureRoute()
    if(mode==LiveAudioFocusPolicy.Mode.STOPPED){
      finishError("其他应用持续占用音频，语音已结束；后台 Codex 任务继续运行")
      return
    }
    render()
  }
  private fun statusMessage():String = when {
    state.optString("phase")=="error" -> state.optString("message")
    audioFocusPolicy.paused -> "音频暂被占用，语音连接保留，等待自动恢复"
    muted -> "GPT Live 已静音"
    audioFocusPolicy.mode==LiveAudioFocusPolicy.Mode.DUCKED -> "提示音播放中，GPT Live 已降低音量"
    else -> state.optString("message")
  }
  private fun finishError(message:String){transport?.preserveTasks();state=JSONObject(state.toString()).put("phase","error").put("message",message).put("audioMessage",message);stopSelf()}
  private fun render(){
    state=JSONObject(state.toString()).put("muted",muted).put("audioPaused",audioFocusPolicy.paused).put("audioFocus",audioFocusPolicy.mode.name.lowercase()).put("audioMessage",statusMessage())
    OverlayService.instance?.speechBall(false)
    if(instance===this)getSystemService(NotificationManager::class.java).notify(ID,notification())
  }
  private val pulse=object:Runnable{override fun run(){
    if(ended)return
    transport?.let{state=JSONObject(state.toString()).put("capturedSamples",it.capturedSamples.get()).put("sentAudioPackets",it.sentAudioPackets.get()).put("receivedAudioPackets",it.receivedAudioPackets.get()).put("transcriptEvents",it.transcriptEvents.get())}
    if(Build.VERSION.SDK_INT>=31){
      val audio=getSystemService(AudioManager::class.java)
      state=JSONObject(state.toString()).put("outputDeviceType",audio.communicationDevice?.type?:-1).put("audioMode",audio.mode)
    }
    main.postDelayed(this,1000)
  }}
  private fun notification():Notification {
    val open=PendingIntent.getActivity(this,430,Intent(this,LiveVoiceActivity::class.java).putExtra("sessionId",target),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    fun control(action:String,id:Int)=PendingIntent.getService(this,id,Intent(this,LiveVoiceService::class.java).setAction(action),PendingIntent.FLAG_IMMUTABLE)
    return NotificationCompat.Builder(this,CHANNEL).setSmallIcon(android.R.drawable.ic_btn_speak_now)
      .setContentTitle(if(muted)"GPT Live · 已静音" else "GPT Live · 实时语音")
      .setSubText(state.optString("sessionTitle", "Codex 语音会话"))
      .setContentText(statusMessage()).setContentIntent(open)
      .setOngoing(true).setOnlyAlertOnce(true)
      .addAction(0,if(muted)"继续收音" else "静音",control(MUTE,431))
      .addAction(0,"结束语音和任务",control(STOP,432)).build()
  }
  fun release(){transport?.preserveTasks();stopSelf()}
  override fun onTaskRemoved(rootIntent:Intent?){stopSelf()}
  override fun onDestroy(){
    ended=true;main.removeCallbacksAndMessages(null)
    transport?.close();transport=null
    if(wake?.isHeld==true)wake?.release()
    if(audioConfigured){
      val audio=getSystemService(AudioManager::class.java)
      audio.unregisterAudioDeviceCallback(routeChanges)
      if(Build.VERSION.SDK_INT>=31)audio.clearCommunicationDevice() else audio.isSpeakerphoneOn=oldSpeaker
      if(audio.mode==AudioManager.MODE_IN_COMMUNICATION)audio.mode=oldMode
      focus?.let{audio.abandonAudioFocusRequest(it)}
    }
    VoiceInputController.releaseMicrophone(this)
    if(instance===this)instance=null
    OverlayService.instance?.speechBall(false)
    if(state.optString("phase")!="error")state=JSONObject(state.toString()).put("phase","closed").put("message","实时语音已结束").put("audioMessage","实时语音已结束")
    stopForeground(STOP_FOREGROUND_REMOVE);super.onDestroy()
  }
  companion object {
    const val START="live.start";const val STOP="live.stop";const val MUTE="live.mute"
    private const val CHANNEL="codex-live-voice";private const val ID=430
    @Volatile var instance:LiveVoiceService?=null;private set
    @Volatile var state=JSONObject().put("phase","idle").put("message","尚未开启 GPT Live");private set
  }
}
