package com.dsharnessmobile.shell

import android.app.*
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.*
import androidx.core.app.NotificationCompat
import org.json.JSONObject
import java.util.UUID

/** A bounded, explicitly started microphone session, independent of Activity/WebView. */
class BackgroundVoiceService : Service() {
  private val main = Handler(Looper.getMainLooper())
  private var voice: VoiceInputController? = null
  private var requestId = ""
  private var target = ""
  private var direct = false
  private var submitting = false
  private var delivery: SpeechDelivery? = null
  private val worker = java.util.concurrent.Executors.newSingleThreadExecutor()
  private var lastPhase = ""
  private var wakeLock: PowerManager.WakeLock? = null

  override fun onBind(intent: Intent?) = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == STOP) { stopSelf(); return START_NOT_STICKY }
    if (intent?.action == FINISH) { voice?.stop(requestId); return START_NOT_STICKY }
    // No sticky restart, boot start, or implicit resume of the microphone.
    if (intent?.action != START || voice != null) { if (voice == null) stopSelf(); return START_NOT_STICKY }
    target = intent.getStringExtra("sessionId").orEmpty()
    direct = intent.getBooleanExtra("direct", false)
    if (direct && target.isBlank()) { stopSelf(); return START_NOT_STICKY }
    requestId = "background-" + UUID.randomUUID()
    delivery = SpeechDelivery(target,requestId)
    instance = this
    snapshot = JSONObject().put("phase", "preparing").put("id", requestId).put("sessionId", target).put("direct", direct)
    try {
      val nm = getSystemService(NotificationManager::class.java)
      nm.createNotificationChannel(NotificationChannel(CHANNEL, "后台语音", NotificationManager.IMPORTANCE_LOW))
      val notification = notification("准备语音识别")
      if (Build.VERSION.SDK_INT >= 29) startForeground(ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
      else startForeground(ID, notification)
      wakeLock = getSystemService(PowerManager::class.java).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "DeepCode:voice").apply { acquire(240_000L) }
      voice = VoiceInputController(applicationContext) {}
      // Capture authority comes from this user-started microphone FGS, not Activity visibility.
      voice!!.manualEndpoint(false)
      voice!!.foreground(true)
      val result = JSONObject(voice!!.start(requestId))
      if (!result.optBoolean("ok")) throw IllegalStateException(result.optString("error"))
      main.post(tick)
      main.postDelayed({
        snapshot = JSONObject(snapshot.toString()).put("phase", "error").put("error", "语音会话超时，请重新开始")
        stopSelf()
      }, 240_000L)
    } catch (e: Exception) {
      snapshot = JSONObject(snapshot.toString()).put("phase", "error").put("error", e.message ?: "无法开启后台语音")
      stopSelf()
    }
    return START_NOT_STICKY
  }

  private val tick = object : Runnable {
    override fun run() {
      val state = JSONObject(voice?.status() ?: return)
      state.put("sessionId", target).put("direct", direct)
      snapshot = state
      val phase = state.optString("phase")
      if (phase != lastPhase) {
        lastPhase = phase
        getSystemService(NotificationManager::class.java).notify(ID, notification(label(state)))
      }
      if (phase == "done" && direct && (!state.optBoolean("autoStopped") || state.optString("stopReason") == "silence") && !submitting) {
        submitting = true
        snapshot = JSONObject(state.toString()).put("phase", "sending")
        val text = delivery?.claim(state.optString("text"),state.optBoolean("autoStopped"),state.optString("stopReason")=="silence") ?: run {stopSelf(); return}
        val sid = target
        val submittedAt = System.currentTimeMillis()
        worker.execute {
          val result = runCatching {
            check(delivery?.valid()==true) { "录音已取消" }
            val config=SpeechTransport(applicationContext).config()
            check(config.optBoolean("enabled") && config.optBoolean("asrEnabled")) { "语音功能已关闭，文本未发送" }
            VoiceAgentRpc(applicationContext).call("session/prompt", JSONObject().put("request", JSONObject().put("sessionId",sid).put("requestId",requestId)
              .put("mode","queue").put("content",org.json.JSONArray().put(JSONObject().put("type","text").put("text",text))))) as? JSONObject
          }
          main.post {
            if (instance !== this@BackgroundVoiceService) return@post
            snapshot = JSONObject(state.toString()).put("phase",if(result.getOrNull()?.optBoolean("accepted")==true) "sent" else "send-error")
              .put("submittedAt",submittedAt)
              .put("error",if(result.getOrNull()?.optBoolean("accepted")==true) "" else "发送结果未确认，请打开原会话检查；转录文本已保留，不自动重发")
            stopSelf()
          }
        }
        return
      }
      if (phase in listOf("done", "error", "canceled")) {
        if (phase != "canceled") getSystemService(NotificationManager::class.java).notify(413, notification(label(state), false))
        stopSelf()
      } else main.postDelayed(this, 250)
    }
  }

  private fun notification(message: String, ongoing: Boolean = true): Notification {
    val open = PendingIntent.getActivity(this, 410, Intent(this, BackgroundVoiceActivity::class.java)
      .putExtra("sessionId", target), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    fun action(action: String, code: Int) = PendingIntent.getService(this, code,
      Intent(this, BackgroundVoiceService::class.java).setAction(action), PendingIntent.FLAG_IMMUTABLE)
    return NotificationCompat.Builder(this, CHANNEL)
      .setSmallIcon(android.R.drawable.ic_btn_speak_now).setContentTitle("DeepCode 后台语音")
      .setContentText(message).setContentIntent(open).setOngoing(ongoing).setAutoCancel(!ongoing).setOnlyAlertOnce(true)
      .apply { if (ongoing) { addAction(0, "完成录音", action(FINISH, 411)); addAction(0, "取消收音", action(STOP, 412)) } }.build()
  }

  override fun onTaskRemoved(rootIntent: Intent?) { stopSelf() }
  override fun onDestroy() {
    main.removeCallbacksAndMessages(null)
    delivery?.cancel()
    if (snapshot.optString("phase") !in listOf("done", "sent", "send-error", "error", "canceled"))
      snapshot = JSONObject(snapshot.toString()).put("phase", "canceled").put("text", "")
    voice?.close(); voice = null
    worker.shutdown()
    if (wakeLock?.isHeld == true) wakeLock?.release()
    if (instance === this) instance = null
    stopForeground(STOP_FOREGROUND_REMOVE)
    super.onDestroy()
  }

  companion object {
    private const val CHANNEL = "background-voice"
    private const val ID = 410
    const val START = "voice.start"
    const val STOP = "voice.stop"
    const val FINISH = "voice.finish"
    @Volatile var instance: BackgroundVoiceService? = null; private set
    @Volatile var snapshot = JSONObject().put("phase", "idle"); private set
    fun acknowledge(id: String) {
      if (snapshot.optString("id") == id && snapshot.optString("phase") in listOf("done", "send-error"))
        snapshot = JSONObject(snapshot.toString()).put("phase", "idle").put("text", "")
    }
    fun label(state: JSONObject): String = when (state.optString("phase")) {
      "preparing" -> "正在准备所选语音服务"
      "recording" -> "正在听 · ${state.optInt("capturedMs") / 1000} 秒"
      "transcribing" -> "正在转写，麦克风已释放"
      "sent" -> "Agent 已接收，正在处理"
      "sending" -> "正在发送转录文字"
      "send-error" -> state.optString("error")
      "done" -> "转写完成，请确认后发送"
      "error" -> state.optString("error", "语音失败")
      "canceled" -> "收音已取消"
      else -> "未开启收音"
    }
  }
}
