package com.dsharnessmobile.shell

import android.content.Context
import org.json.JSONObject
import org.webrtc.*
import org.webrtc.audio.JavaAudioDeviceModule
import java.net.HttpURLConnection
import java.net.Proxy
import java.net.URL
import java.util.concurrent.CompletableFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong

/** Native WebRTC transport: microphone and playback survive Activity/WebView pauses. */
class LiveVoiceTransport(private val context: Context, private val session: String,
  private val lease: String, private val identity: (JSONObject) -> Unit, private val update: (String, String) -> Unit) : AutoCloseable {
  @Volatile private var interruptTask = true
  fun preserveTasks() { interruptTask=false }
  @Volatile private var closed = false
  @Volatile private var connected = false
  @Volatile private var channelOpen = false
  private var peer: PeerConnection? = null
  private var factory: PeerConnectionFactory? = null
  private var audioModule: JavaAudioDeviceModule? = null
  private var source: AudioSource? = null
  private var track: AudioTrack? = null
  private var remoteTrack: AudioTrack? = null
  private var microphoneMuted = false
  private var audioPaused = false
  private var playbackGain = 1.0
  private var channel: DataChannel? = null
  val capturedSamples = AtomicLong()
  val receivedEvents = AtomicLong()
  val transcriptEvents = AtomicLong()
  val sentAudioPackets = AtomicLong()
  val receivedAudioPackets = AtomicLong()
  private val ice = CompletableFuture<Unit>()

  private fun request(body: JSONObject? = null): JSONObject {
    val conn = URL("http://127.0.0.1:3080/api/android/codex/live").openConnection(Proxy.NO_PROXY) as HttpURLConnection
    try {
      conn.connectTimeout = 4000; conn.readTimeout = if (body?.optString("action") == "start") 65000 else 10000
      EngineAuth.attach(context, conn)
      if (body != null) {
        conn.requestMethod = "POST"; conn.doOutput = true
        conn.setRequestProperty("Content-Type", "application/json")
        conn.outputStream.use { it.write(body.toString().toByteArray()) }
      }
      val code = conn.responseCode
      val value = JSONObject((if(code in 200..299) conn.inputStream else conn.errorStream).bufferedReader().use { it.readText() })
      check(code in 200..299) { value.optString("error", "无法连接 Codex Live") }
      return value
    } finally { conn.disconnect() }
  }
  private fun action(name: String) = JSONObject().put("action", name).put("sessionId", session).put("lease", lease).put("interrupt",interruptTask)
  private fun ready() { if (!closed && connected && channelOpen) update("listening", "GPT Live 正在聆听") }
  private fun fail(message: String) { if (!closed) update("error", message) }
  private fun observer(future: CompletableFuture<SessionDescription?>) = object : SdpObserver {
    override fun onCreateSuccess(sdp: SessionDescription) { future.complete(sdp) }
    override fun onSetSuccess() { future.complete(null) }
    override fun onCreateFailure(error: String) { future.completeExceptionally(IllegalStateException(error)) }
    override fun onSetFailure(error: String) { future.completeExceptionally(IllegalStateException(error)) }
  }
  @Synchronized private fun preparePeer() {
    check(!closed)
    PeerConnectionFactory.initialize(PeerConnectionFactory.InitializationOptions.builder(context).createInitializationOptions())
    audioModule = JavaAudioDeviceModule.builder(context)
      .setUseHardwareAcousticEchoCanceler(true).setUseHardwareNoiseSuppressor(true)
      .setAudioTrackStateCallback(object:JavaAudioDeviceModule.AudioTrackStateCallback {
        override fun onWebRtcAudioTrackStart(){LiveVoiceService.instance?.playbackStarted()}
        override fun onWebRtcAudioTrackStop(){}
      })
      .setSamplesReadyCallback { samples -> capturedSamples.addAndGet((samples.data.size / 2).toLong()) }
      .createAudioDeviceModule()
    factory = PeerConnectionFactory.builder().setAudioDeviceModule(audioModule).createPeerConnectionFactory()
    val config = PeerConnection.RTCConfiguration(emptyList()).apply { sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN }
    peer = factory!!.createPeerConnection(config, object : PeerConnection.Observer {
      override fun onSignalingChange(state: PeerConnection.SignalingState) {}
      override fun onIceConnectionChange(state: PeerConnection.IceConnectionState) {
        if (state == PeerConnection.IceConnectionState.FAILED || state == PeerConnection.IceConnectionState.DISCONNECTED) fail("语音网络已断开，请重新开启")
      }
      override fun onConnectionChange(state: PeerConnection.PeerConnectionState) {
        connected = state == PeerConnection.PeerConnectionState.CONNECTED
        if(connected) ready()
        if(state == PeerConnection.PeerConnectionState.FAILED) fail("GPT Live 连接失败")
      }
      override fun onIceConnectionReceivingChange(receiving: Boolean) {}
      override fun onIceGatheringChange(state: PeerConnection.IceGatheringState) { if(state == PeerConnection.IceGatheringState.COMPLETE) ice.complete(Unit) }
      override fun onIceCandidate(candidate: IceCandidate) {}
      override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>) {}
      override fun onAddStream(stream: MediaStream) {}
      override fun onRemoveStream(stream: MediaStream) {}
      override fun onDataChannel(dc: DataChannel) {}
      override fun onRenegotiationNeeded() {}
      override fun onAddTrack(receiver: RtpReceiver, streams: Array<out MediaStream>) {
        synchronized(this@LiveVoiceTransport) {
          if(!closed){remoteTrack=receiver.track() as? AudioTrack;applyAudioState()}
        }
      }
    }) ?: error("无法初始化语音连接")
    source = factory!!.createAudioSource(MediaConstraints())
    track = factory!!.createAudioTrack("deepcode-live-mic", source)
    applyAudioState()
    peer!!.addTrack(track, listOf("deepcode-live"))
    channel = peer!!.createDataChannel("oai-events", DataChannel.Init())
    channel!!.registerObserver(object : DataChannel.Observer {
      override fun onBufferedAmountChange(amount: Long) {}
      override fun onStateChange() { channelOpen = channel?.state() == DataChannel.State.OPEN; ready() }
      override fun onMessage(buffer: DataChannel.Buffer) {
        if(closed || buffer.binary) return
        receivedEvents.incrementAndGet()
        val data = ByteArray(buffer.data.remaining()); buffer.data.get(data)
        runCatching { JSONObject(String(data)).optString("type") }.onSuccess {
          if(it.contains("transcript")) transcriptEvents.incrementAndGet()
          if(it == "error") fail("GPT Live 返回语音错误，请重新开启")
        }
      }
    })
  }
  fun run() {
    try {
      val info = request(); check(info.optBoolean("enabled") && info.optBoolean("available")) { "请先连接 Codex 后端" }
      preparePeer()
      val offer = CompletableFuture<SessionDescription?>()
      peer!!.createOffer(observer(offer), MediaConstraints())
      val description = offer.get(10, TimeUnit.SECONDS)!!; check(!closed)
      val local = CompletableFuture<SessionDescription?>(); peer!!.setLocalDescription(observer(local), description);local.get(10, TimeUnit.SECONDS)
      runCatching { ice.get(8, TimeUnit.SECONDS) }; check(!closed)
      val answer = request(action("start").put("csrf", info.getString("csrf")).put("sdp", peer!!.localDescription.description))
      if(closed) { runCatching { request(action("stop")) };return }
      identity(answer)
      val remote = CompletableFuture<SessionDescription?>()
      peer!!.setRemoteDescription(observer(remote), SessionDescription(SessionDescription.Type.ANSWER, answer.getString("sdp")))
      remote.get(10, TimeUnit.SECONDS)
      val deadline = System.nanoTime()+TimeUnit.SECONDS.toNanos(25)
      var cursor = 0L
      while(!closed) {
        if(!connected && System.nanoTime()>deadline) error("GPT Live 音频连接超时")
        val next=request(action("poll").put("after",cursor))
        if(next.optString("error").let { it.isNotEmpty() && it != "null" }) error(next.optString("error"))
        identity(next)
        val events=next.optJSONArray("events")
        for(i in 0 until (events?.length()?:0)) {
          val event=events!!.getJSONObject(i);cursor=maxOf(cursor,event.optLong("seq"))
          if(event.optString("type").contains("transcript")) transcriptEvents.incrementAndGet()
          if(event.optString("type")=="turn/started") update("working","Codex 正在处理，仍可继续说话")
          if(event.optString("type")=="turn/completed") ready()
        }
        synchronized(this) { if(!closed) peer?.getStats { report ->
          report.statsMap.values.forEach { stat ->
            val m=stat.members
            if(m["kind"]=="audio"||m["mediaType"]=="audio") {
              if(stat.type=="outbound-rtp") sentAudioPackets.set((m["packetsSent"] as? Number)?.toLong()?:0)
              if(stat.type=="inbound-rtp") receivedAudioPackets.set((m["packetsReceived"] as? Number)?.toLong()?:0)
            }
          }
        } }
        Thread.sleep(750)
      }
    }catch(e:Exception){fail(e.message?:"实时语音失败")}
    finally { runCatching { request(action("stop")) } }
  }
  // Caller holds this transport's monitor. User mute and focus pause are independent.
  private fun applyAudioState() {
    track?.setEnabled(!microphoneMuted && !audioPaused)
    remoteTrack?.setEnabled(!audioPaused)
    remoteTrack?.setVolume(playbackGain)
  }
  fun mute(value: Boolean) { synchronized(this) {
    if(!closed){microphoneMuted=value;applyAudioState()}
  } }
  fun setAudioFocus(paused: Boolean, gain: Double) { synchronized(this) {
    if(!closed){audioPaused=paused;playbackGain=gain.coerceIn(0.0,1.0);applyAudioState()}
  } }
  override fun close() {
    synchronized(this) {
      if(closed)return
      closed=true;track?.setEnabled(false)
      channel?.unregisterObserver();channel?.close();channel?.dispose();channel=null
      remoteTrack=null // Owned and disposed by PeerConnection.
      peer?.close();peer?.dispose();peer=null
      track?.dispose();track=null;source?.dispose();source=null
      factory?.dispose();factory=null;audioModule?.release();audioModule=null
    }
    Thread { runCatching { request(action("stop")) } }.start()
  }
}
