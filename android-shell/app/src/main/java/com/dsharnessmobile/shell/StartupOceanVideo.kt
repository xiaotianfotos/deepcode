package com.dsharnessmobile.shell

import android.graphics.Matrix
import android.graphics.SurfaceTexture
import android.media.MediaPlayer
import android.os.Handler
import android.os.Looper
import android.view.Surface
import android.view.TextureView
import android.view.View
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver

/** The bundled 72-frame clip is one matched cycle. One decoder loops it without a JS timer,
 * reverse playback, cross-fade, or audio track. The engine never waits for the animation.
 */
internal class StartupOceanVideo(private val activity: ComponentActivity) : FrameLayout(activity) {
  private var player: MediaPlayer? = null
  private var surface: Surface? = null
  private var texture: TextureView? = null
  private val handler = Handler(Looper.getMainLooper())
  private var resumed = false
  private var running = false
  private var failed = false
  private var generation = 0
  private val observer: LifecycleEventObserver = LifecycleEventObserver { _, event ->
    if (event == Lifecycle.Event.ON_RESUME) { resumed = true; syncPlayback() }
    if (event == Lifecycle.Event.ON_PAUSE || event == Lifecycle.Event.ON_DESTROY) {
      resumed = false; releasePlayback()
    }
  }
  init {
    importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
    isClickable = false
  }
  override fun onVisibilityAggregated(visible: Boolean) {
    super.onVisibilityAggregated(visible)
    if (visible) syncPlayback() else releasePlayback()
  }
  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    resumed = activity.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)
    activity.lifecycle.addObserver(observer)
    syncPlayback()
  }
  override fun onDetachedFromWindow() {
    activity.lifecycle.removeObserver(observer)
    releasePlayback()
    super.onDetachedFromWindow()
  }
  private fun syncPlayback() {
    if (!resumed || !isShown || !isAttachedToWindow || failed || running) return
    running = true
    val token = ++generation
    val view = TextureView(activity).apply { alpha = 0f; isOpaque = false }
    texture = view
    view.surfaceTextureListener = object : TextureView.SurfaceTextureListener {
      override fun onSurfaceTextureAvailable(st: SurfaceTexture, width: Int, height: Int) {
        if (running && token == generation) prepare(st, token)
      }
      override fun onSurfaceTextureSizeChanged(st: SurfaceTexture, width: Int, height: Int) = fit()
      override fun onSurfaceTextureDestroyed(st: SurfaceTexture): Boolean {
        if (token == generation) releaseDecoder()
        return true
      }
      override fun onSurfaceTextureUpdated(st: SurfaceTexture) {
        if (running && token == generation) { view.alpha = 1f; handler.removeCallbacksAndMessages(null) }
      }
    }
    addView(view, LayoutParams(-1, -1))
    handler.postDelayed({ if (running && token == generation && view.alpha == 0f) fail() }, 4_000)
  }
  private fun prepare(st: SurfaceTexture, token: Int) {
    try {
      val media = MediaPlayer()
      player = media
      surface = Surface(st)
      media.setSurface(surface)
      media.setVolume(0f, 0f)
      media.isLooping = true
      media.setOnErrorListener { _, _, _ -> fail(); true }
      media.setOnVideoSizeChangedListener { _, _, _ -> fit() }
      media.setOnPreparedListener {
        if (running && generation == token && player === media) { fit(); media.start() }
      }
      activity.resources.openRawResourceFd(R.raw.startup_ocean_loop).use {
        media.setDataSource(it.fileDescriptor, it.startOffset, it.length)
      }
      media.prepareAsync()
    } catch (_: Exception) { fail() }
  }
  private fun fit() {
    val media = player ?: return
    val view = texture ?: return
    val w = view.width.toFloat(); val h = view.height.toFloat()
    val vw = media.videoWidth.toFloat(); val vh = media.videoHeight.toFloat()
    if (w <= 0 || h <= 0 || vw <= 0 || vh <= 0) return
    val scale = maxOf(w / vw, h / vh)
    view.setTransform(Matrix().apply { setScale(vw * scale / w, vh * scale / h, w / 2, h / 2) })
  }
  private fun fail() { failed = true; releasePlayback() }
  private fun releaseDecoder() {
    try { player?.release() } catch (_: Exception) { }
    player = null
    surface?.release(); surface = null
  }
  private fun releasePlayback() {
    running = false
    generation++
    handler.removeCallbacksAndMessages(null)
    releaseDecoder()
    texture = null
    removeAllViews()
  }
}
