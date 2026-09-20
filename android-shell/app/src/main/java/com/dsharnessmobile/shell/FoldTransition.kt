package com.dsharnessmobile.shell

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.app.KeyguardManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.content.Context
import android.app.Activity
import android.os.Build
import android.view.View
import android.view.animation.DecelerateInterpolator
import android.webkit.WebView
import android.widget.FrameLayout
import org.json.JSONObject

/** Owns only transient pixels, never the WebView, editor, or engine lifecycle. */
class FoldTransition(private val activity: MainActivity, private val root: FrameLayout, private val web: WebView) {
  private val gradient = FoldGradientBlur(activity.resources.displayMetrics.density)
  private val dual = FoldDualDisplay(activity,web) { dualChanged() }
  private var amount = 0f
  private var previewAngle=0f
  private var previewInner=false
  private var animator: ValueAnimator? = null
  private val sensors = activity.getSystemService(Context.SENSOR_SERVICE) as SensorManager
  private val keyguard = activity.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
  private val hinge = if (Build.VERSION.SDK_INT >= 30) sensors.getDefaultSensor(Sensor.TYPE_HINGE_ANGLE) else null
  private val motion = FoldHingeMotion()
  private var foreground = false
  private var listening = false
  private var pendingResume = false
  private var hingeDegrees = -1f
  private var hingeEvents = 0
  private var hingeTransitions = 0
  private var animationAmountStart = 0f
  private var blurRadius = 0f
  private var trigger = "layout"
  private val closedIdle = Runnable {
    if (phase == "hinge" && hingeDegrees <= 5f) { trigger = "closed-idle"; begin(root.width, root.height) }
  }
  private val sensorListener = object: SensorEventListener {
    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
    override fun onSensorChanged(event: SensorEvent) {
      val angle = event.values.firstOrNull() ?: return
      hingeDegrees = angle; hingeEvents++
      if (!enabled || !foreground || keyguard.isKeyguardLocked || !web.isShown) return
      dual.angle(angle)
      if (phase.startsWith("preview")) return
      if (dual.supported) { if(dual.active)renderDual() else finish();return }
      motion.update(angle) ?: run { publish(); return }
      if (phase == "waiting" || phase == "animating") { publish(); return }
      if (angle >= 170f) { pendingResume = false; finish(); return }
      if (phase != "hinge") { prepare(); hingeTransitions++ }
      root.removeCallbacks(timeout)
      phase = "hinge"; trigger = "hinge"; pendingResume = true
      applyAmount(FoldBlurProfile.amountForAngle(angle))
      // A partial fold keeps its spatial profile. Only a fully closed display
      // without a window handoff needs a fallback to readable content.
      root.removeCallbacks(closedIdle)
      if (angle <= 5f) root.postDelayed(closedIdle, 350)
      publish()
    }
  }
  private var enabled = false
  private var generation = 0
  private var transitions = 0
  private var completed = 0
  private var animationStart = 0L
  private var animationMs = 0L
  private var animationFrames = 0
  private var usedSnapshot = false
  private var lastWidth = 0
  private var lastHeight = 0
  private var lastPanel = ""
  private var oldWidth = 0
  private var oldHeight = 0
  private var phase = "idle"
  @Volatile private var snapshot = "{}"
  private val timeout = Runnable { finish() }
  private val startTimeout = Runnable { animate(generation) }
  private val layout = View.OnLayoutChangeListener { _, l, t, rr, b, _, _, _, _ ->
    val w = rr-l; val h = b-t
    val panel = panelSignature()
    val panelChanged = lastPanel.isNotEmpty() && panel.isNotEmpty() && panel != lastPanel
    // Rotation, IME and split-window resizing do not identify a fold. A physical
    // display-mode size change does; refresh-rate mode IDs deliberately do not.
    if (lastWidth > 0 && w > 0 && panelChanged) {
      if (enabled && !foreground) pendingResume = true
      trigger = "layout"
      oldWidth = lastWidth; oldHeight = lastHeight
      begin(w, h)
    }
    lastWidth = w; lastHeight = h
    if (panel.isNotEmpty()) lastPanel = panel
  }
  private fun panelSignature(): String {
    val mode = web.display?.mode ?: return ""
    return "${minOf(mode.physicalWidth,mode.physicalHeight)}x${maxOf(mode.physicalWidth,mode.physicalHeight)}"
  }
  init {
    root.addOnLayoutChangeListener(layout)
    publish()
  }
  fun hostPreview(cover:Boolean){dual.previewHost(cover)}
  fun status(): String = snapshot
  fun configure(value: Boolean) {
    enabled = value
    dual.configure(value)
    if (enabled) gradient.warmUp()
    updateSensor()
    if (!enabled) { pendingResume = false; motion.reset(); finish() }
    publish()
  }
  /** Do not keep chat pixels across lock/background. Remember only a handoff flag. */
  fun foreground(value: Boolean) {
    foreground = value
    dual.foreground(value)
    if (!value) {
      pendingResume = pendingResume || phase == "hinge" || phase == "waiting" || phase == "animating"
      motion.reset(); finish()
    }
    updateSensor()
    if (value) root.post { resumeIfReady() }
    publish()
  }
  fun focusChanged(focused: Boolean) { if (focused) resumeIfReady() }
  private fun resumeIfReady() {
    if (pendingResume && enabled && foreground && web.hasWindowFocus() && web.isShown && !keyguard.isKeyguardLocked) {
      trigger = "resume"; pendingResume = false; motion.settle(); begin(root.width, root.height)
    }
  }
  private fun updateSensor() {
    if (enabled && foreground && hinge != null && !listening) {
      listening = sensors.registerListener(sensorListener, hinge, SensorManager.SENSOR_DELAY_GAME)
    } else if ((!enabled || !foreground) && listening) {
      sensors.unregisterListener(sensorListener); listening = false
    }
  }
  /** Keep the live view mounted. Aspect-ratio changes must never overlay a fitted
   * screenshot: its text would no longer line up with the newly laid out editor. */
  fun prepare() {
    if (phase == "hinge") return
    if (!enabled || !foreground || keyguard.isKeyguardLocked || !web.isShown) return
    finish(); phase = "prepared"
    root.postDelayed(timeout, 700); publish()
  }
  private fun applyAmount(value: Float) {
    amount = FoldBlurProfile.clamp(value)
    blurRadius = gradient.maxSigma * amount
    gradient.apply(web, amount)
  }
  /** Debug builds only; bounded preview uses the production renderer. */
  fun preview(value: Float) {
    if (!BuildConfig.DEBUG || !enabled || !foreground || keyguard.isKeyguardLocked || !value.isFinite()) return
    finish(); phase = "preview"; trigger = "preview"
    applyAmount(value); publish(); root.postDelayed(timeout, 4000)
  }
  fun projectionPreview(angle:Float,inner:Boolean){
    if(!BuildConfig.DEBUG || !foreground || keyguard.isKeyguardLocked || !angle.isFinite() || angle !in 0f..180f)return
    finish();phase="preview-projection";trigger="preview-projection"
    previewAngle=angle;previewInner=inner
    amount=if(inner)FoldProjection.innerBoundary(angle) else 0f
    blurRadius=if(inner)gradient.maxSigma*(if(dual.primaryCover)FoldProjection.coverStrength(angle) else FoldProjection.innerStrength(angle)) else 0f
    if(inner){
      if(dual.primaryCover)gradient.applyCoverProjection(web,angle,(web.parent as? View)?.width?:web.width,-web.translationX)
      else gradient.applyMovingInnerHalf(web,angle)
    }else gradient.apply(web,0f)
    publish();root.postDelayed(timeout,4000)
  }
  private fun begin(w: Int, h: Int) {
    if (dual.supported) { if(dual.active)renderDual() else finish();return }
    if (!enabled || !foreground || keyguard.isKeyguardLocked || !web.isShown) { finish(); return }
    animationAmountStart = if (phase == "hinge" && w == lastWidth) amount else .85f
    motion.settle(); root.removeCallbacks(closedIdle)
    animator?.removeAllListeners(); animator?.cancel(); animator = null
    root.removeCallbacks(timeout); root.removeCallbacks(startTimeout)
    generation++; transitions++; phase = "waiting"
    pendingResume = false
    usedSnapshot = false
    applyAmount(animationAmountStart)
    publish()
    val detail = JSONObject().put("generation",generation).put("width",w).put("height",h)
    web.evaluateJavascript("window.dispatchEvent(new CustomEvent('dsh-fold-transition',{detail:$detail}))",null)
    // A missing/disposed plugin must never leave a permanent blurred screen.
    root.postDelayed(startTimeout, 160)
    root.postDelayed(timeout, 650)
  }
  fun ready(id: Int) {
    if (id != generation || phase != "waiting") return
    web.postVisualStateCallback(id.toLong(), object: WebView.VisualStateCallback() {
      override fun onComplete(requestId: Long) { animate(requestId.toInt()) }
    })
  }
  private fun animate(id: Int) {
    if (id != generation || phase != "waiting") return
    root.removeCallbacks(startTimeout)
    animationStart = android.os.SystemClock.uptimeMillis(); animationFrames = 0
    phase = "animating"; publish()
    animator = ValueAnimator.ofFloat(0f,1f).apply {
      duration = 300
      interpolator = DecelerateInterpolator()
      addUpdateListener {
        animationFrames++
        val p = it.animatedValue as Float
        applyAmount(animationAmountStart*(1f-p))
        publish()
      }
      addListener(object: AnimatorListenerAdapter() {
        override fun onAnimationEnd(animation: Animator) { if(id == generation) { animationMs = android.os.SystemClock.uptimeMillis()-animationStart; completed++; finish() } }
      })
      start()
    }
  }
  private fun publish() {
    val movingHalf=(dual.active && dual.clearSourceReady && !dual.handingOff && phase=="hinge") || (phase=="preview-projection" && previewInner)
    val angle=if(phase=="preview-projection")previewAngle else hingeDegrees
    val coverProjection=movingHalf && dual.primaryCover
    fun sigma(x:Float)=if(coverProjection)gradient.maxSigma*FoldProjection.coverStrength(angle)*FoldProjection.rightBlurMask(x,FoldProjection.boundary(angle),.24f) else if(movingHalf)gradient.maxSigma*FoldProjection.movingHalfBlurMask(x,angle) else FoldBlurProfile.sigma(x,amount,gradient.maxSigma)
    snapshot = JSONObject().put("enabled",enabled).put("phase",phase).put("generation",generation)
      .put("animationMs",animationMs).put("animationFrames",animationFrames).put("usedSnapshot",usedSnapshot)
      .put("hingeAvailable",hinge != null).put("hingeListening",listening).put("hingeDegrees",hingeDegrees)
      .put("hingeEvents",hingeEvents).put("hingeTransitions",hingeTransitions).put("blurRadius",blurRadius)
      .put("trigger",trigger).put("foreground",foreground).put("pendingResume",pendingResume)
      .put("transitions",transitions).put("completed",completed).put("blurSupported",gradient.supported)
      .put("blurMode",if(coverProjection)"cover-projection" else if(movingHalf)"inner-projection" else if(dual.active || phase=="preview-projection")"inner-clear-cover-projection" else "horizontal-gradient").put("blurAmount",amount).put("blurExtent",if(movingHalf)amount else FoldBlurProfile.extent(amount))
      .put("sigmaLeftPx",sigma(0f)).put("sigmaCenterPx",sigma(.5f))
      .put("sigmaRightPx",sigma(1f)).put("shaderError",gradient.error ?: JSONObject.NULL)
      .put("oldWidth",oldWidth).put("oldHeight",oldHeight)
      .put("panel",lastPanel).put("width",root.width).put("height",root.height).put("dual",dual.status()).toString()
  }
  private fun dualChanged() {
    if (phase.startsWith("preview")) { publish();return }
    if (!dual.active) { if(dual.supported)finish();return }
    renderDual()
    publish()
  }
  private fun renderDual(){
    if(hingeDegrees<0f)return
    root.removeCallbacks(timeout);root.removeCallbacks(startTimeout);root.removeCallbacks(closedIdle)
    phase="hinge";trigger="dual-hinge";pendingResume=false
    val inner=dual.clearSourceReady && !dual.handingOff
    amount=if(inner)FoldProjection.innerBoundary(hingeDegrees) else 0f
    blurRadius=if(inner)gradient.maxSigma*(if(dual.primaryCover)FoldProjection.coverStrength(hingeDegrees) else FoldProjection.innerStrength(hingeDegrees)) else 0f
    if(inner){
      if(dual.primaryCover)gradient.applyCoverProjection(web,hingeDegrees,(web.parent as? View)?.width?:web.width,-web.translationX)
      else gradient.applyMovingInnerHalf(web,hingeDegrees)
    }else gradient.apply(web,0f)
    publish()
  }
  fun finish() {
    root.removeCallbacks(timeout); root.removeCallbacks(startTimeout); root.removeCallbacks(closedIdle)
    applyAmount(0f)
    val old = animator; animator = null; old?.removeAllListeners(); old?.cancel()
    phase = "idle"; publish()
  }
  fun close() { dual.close(); sensors.unregisterListener(sensorListener); listening = false; finish(); root.removeOnLayoutChangeListener(layout) }
}
