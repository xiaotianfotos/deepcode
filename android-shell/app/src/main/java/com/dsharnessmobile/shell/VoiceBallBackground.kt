package com.dsharnessmobile.shell

import android.animation.ValueAnimator
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorFilter
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PixelFormat
import android.graphics.drawable.Drawable

/** Real microphone level behind the whale, clipped to the existing circular touch target. */
internal class VoiceBallBackground : Drawable() {
  private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val clip = Path()
  private var phase="idle"
  fun phase(value:String){if(phase!=value){phase=value;invalidateSelf()}}
  private var fill = 0f
  private var target = 0f
  private var animator: ValueAnimator? = null

  fun update(recording: Boolean, level: Float) {
    // A small steady green base means the microphone is open, even in silence.
    // It does not pulse: only actual captured audio increases the height.
    val next = if (recording) .08f + .84f * (if (level.isFinite()) level.coerceIn(0f, 1f) else 0f) else 0f
    if (!recording) {
      animator?.cancel(); animator = null
      target = 0f; fill = 0f; invalidateSelf()
      return
    }
    if (kotlin.math.abs(next - target) < .005f) return
    animator?.cancel()
    target = next
    animator = ValueAnimator.ofFloat(fill, next).apply {
      duration = if (next > fill) 70L else 140L
      addUpdateListener { fill = it.animatedValue as Float; invalidateSelf() }
      start()
    }
  }

  override fun draw(canvas: Canvas) {
    val cx = bounds.exactCenterX(); val cy = bounds.exactCenterY()
    val radius = minOf(bounds.width(), bounds.height()) / 2f
    paint.color = Color.WHITE
    canvas.drawCircle(cx, cy, radius, paint)
    if(phase in listOf("preparing","transcribing","sending","working","speaking","live","live-paused")){
      paint.style=Paint.Style.STROKE;paint.strokeWidth=radius*.12f
      paint.color=when(phase){"speaking","live"->0xFF63DCA0.toInt();"live-paused"->0xFF929CA9.toInt();else->0xFF6688E8.toInt()}
      canvas.drawCircle(cx,cy,radius*.86f,paint);paint.style=Paint.Style.FILL
    }
    if (fill <= 0f) return
    clip.reset(); clip.addCircle(cx, cy, radius, Path.Direction.CW)
    val save = canvas.save()
    canvas.clipPath(clip)
    paint.color = 0xFF63DCA0.toInt()
    canvas.drawRect(cx - radius, cy + radius - radius * 2 * fill, cx + radius, cy + radius, paint)
    canvas.restoreToCount(save)
  }
  override fun setAlpha(alpha: Int) { paint.alpha = alpha; invalidateSelf() }
  override fun setColorFilter(colorFilter: ColorFilter?) { paint.colorFilter = colorFilter; invalidateSelf() }
  @Deprecated("Deprecated in Android")
  override fun getOpacity(): Int = PixelFormat.TRANSLUCENT
}
