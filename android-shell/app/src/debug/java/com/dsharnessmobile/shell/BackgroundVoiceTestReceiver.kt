package com.dsharnessmobile.shell

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.media.MediaPlayer
import org.json.JSONObject
import java.io.File

/** Real speaker -> microphone test. Does not inject PCM into ASR or bypass start restrictions. */
class BackgroundVoiceTestReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (!BuildConfig.DEBUG) return
    when (intent.action) {
      "voice.test.STOP_LIVE" -> context.stopService(Intent(context, LiveVoiceService::class.java))
      "voice.test.LIVE_STATUS" -> {
        val state = JSONObject(LiveVoiceService.state.toString())
        state.put("serviceAlive", LiveVoiceService.instance != null)
        File(context.filesDir, "live-voice-test.json").writeText(state.toString())
      }

      "voice.test.STATUS" -> {
        val state = JSONObject(BackgroundVoiceService.snapshot.toString())
        state.put("textLength", state.optString("text").length)
        state.remove("text"); state.remove("waveform"); state.remove("waveformSamples")
        state.put("serviceAlive", BackgroundVoiceService.instance != null)
        File(context.filesDir, "background-voice-test.json").writeText(state.toString())
      }
      "voice.test.PLAY" -> {
        if (BackgroundVoiceService.snapshot.optString("phase") != "recording") return
        player?.release()
        val fixture = File(context.cacheDir, "background-voice-fixture.wav")
        context.assets.open("voice-validation.wav").use { input -> fixture.outputStream().use { input.copyTo(it) } }
        player = MediaPlayer().apply {
          setDataSource(fixture.absolutePath); setVolume(.7f, .7f)
          setOnCompletionListener { it.release(); player = null; fixture.delete() }
          setOnErrorListener { media, _, _ -> media.release(); player = null; fixture.delete(); true }
          prepare(); start()
        }
      }
      "voice.test.CLEANUP" -> {
        player?.release(); player = null
        File(context.cacheDir, "background-voice-fixture.wav").delete()
        File(context.filesDir, "background-voice-test.json").delete()
        File(context.filesDir, "live-voice-test.json").delete()
      }
    }
  }
  companion object { private var player: MediaPlayer? = null }
}
