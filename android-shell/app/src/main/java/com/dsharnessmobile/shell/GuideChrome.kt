package com.dsharnessmobile.shell

import android.app.AlertDialog
import android.content.Context
import android.content.res.ColorStateList
import android.graphics.*
import android.graphics.drawable.Drawable
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.*
import androidx.activity.ComponentActivity

/** Artwork is decorative; every label, progress state and recovery action stays native. */
internal class GuideChrome(
  val root: FrameLayout,
  val brandBlock: View,
  val cardBlock: View,
  val actionBlock: View,
  val engineStatus: TextView,
  val statusHint: TextView,
  val statusDot: View,
  val crashBanner: TextView,
  val progressBar: ProgressBar,
  val progressText: TextView,
  val logSummary: TextView,
  val logSection: View,
  val copyLog: TextView,
  val primaryButton: Button,
  val consoleButton: Button,
  val updateButton: Button,
  val runtimeChip: TextView,
  val storageChip: TextView,
  val versionLabel: TextView,
  val summary: TextView,
  val supportingText: TextView,
  val dismissDetails: () -> Unit,
  val ocean: Boolean = true,
)

internal class GuideCallbacks(
  val onStartEngine: () -> Unit,
  val onOpenConsole: () -> Unit,
  val onCheckUpdate: () -> Unit,
  val onGrantStorage: () -> Unit,
  val onCopyLog: () -> Unit,
)

/** Center-crop at the same origin as the artwork, including behind system insets. */
private class OceanBackdrop(context: Context) : Drawable() {
  private val bitmap = BitmapFactory.decodeResource(context.resources, R.drawable.startup_ocean)
  private val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
  override fun draw(canvas: Canvas) {
    val scale = maxOf(bounds.width().toFloat() / bitmap.width, bounds.height().toFloat() / bitmap.height)
    val w = bitmap.width * scale
    val h = bitmap.height * scale
    val x = bounds.exactCenterX() - w / 2
    val y = bounds.exactCenterY() - h / 2
    canvas.drawBitmap(bitmap, null, RectF(x, y, x + w, y + h), paint)
  }
  override fun setAlpha(alpha: Int) { paint.alpha = alpha; invalidateSelf() }
  override fun setColorFilter(filter: ColorFilter?) { paint.colorFilter = filter; invalidateSelf() }
  @Deprecated("Drawable contract") override fun getOpacity() = PixelFormat.OPAQUE
}

/** Keep the wordmark below the whale in either orientation, with scrollable large-text recovery. */
private class OceanGuide(context: Context) : FrameLayout(context) {
  lateinit var pane: ScrollView
  lateinit var details: TextView
  lateinit var video: StartupOceanVideo
  private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()
  override fun onMeasure(widthSpec: Int, heightSpec: Int) {
    val w = MeasureSpec.getSize(widthSpec)
    val h = MeasureSpec.getSize(heightSpec)
    val usableWidth = (w - paddingLeft - paddingRight).coerceAtLeast(1)
    video.measure(MeasureSpec.makeMeasureSpec(w, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(h, MeasureSpec.EXACTLY))
    details.measure(MeasureSpec.makeMeasureSpec(usableWidth, MeasureSpec.AT_MOST),
      MeasureSpec.makeMeasureSpec(dp(48), MeasureSpec.EXACTLY))
    pane.measure(MeasureSpec.makeMeasureSpec(minOf(usableWidth, dp(400)), MeasureSpec.EXACTLY),
      MeasureSpec.makeMeasureSpec((h - paddingTop - paddingBottom - details.measuredHeight).coerceAtLeast(1), MeasureSpec.AT_MOST))
    setMeasuredDimension(w, h)
  }
  override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
    video.layout(0, 0, width, height)
    val footerY = height - paddingBottom - details.measuredHeight
    // The 16:9 video leaves its lower area clear for native labels.
    val imageHeight = maxOf(height.toFloat(), width / (16f / 9f))
    val idealTop = ((height - imageHeight) / 2 + imageHeight * .60f).toInt()
    val y = minOf(idealTop, footerY - pane.measuredHeight).coerceAtLeast(paddingTop)
    val x = (width - pane.measuredWidth) / 2
    pane.layout(x, y, x + pane.measuredWidth, y + pane.measuredHeight)
    val dx = (width - details.measuredWidth) / 2
    details.layout(dx, footerY, dx + details.measuredWidth, footerY + details.measuredHeight)
  }
}

internal fun buildGuideChrome(activity: ComponentActivity, callbacks: GuideCallbacks): GuideChrome {
  if (!StartupAppearance.enabled(activity)) return buildStandardGuideChrome(activity, callbacks)
  fun dp(v: Int) = (v * activity.resources.displayMetrics.density).toInt()
  val white = Color.rgb(235, 245, 255)
  val muted = Color.rgb(161, 185, 205)
  val accent = Color.rgb(133, 222, 255)
  fun label(size: Float, tint: Int = white) = TextView(activity).apply {
    textSize = size
    setTextColor(tint)
    gravity = Gravity.CENTER
    setLineSpacing(0f, 1.15f)
  }
  fun column() = LinearLayout(activity).apply { orientation = LinearLayout.VERTICAL }
  fun button(title: String, onClick: () -> Unit) = Button(activity).apply {
    text = title
    isAllCaps = false
    textSize = 14f
    setTextColor(white)
    background = DsUi.ripple(DsUi.roundRect(Color.rgb(17, 47, 69), dp(24).toFloat()), 0x334AB5DE)
    stateListAnimator = null
    minHeight = dp(48)
    setPadding(dp(16), 0, dp(16), 0)
    setOnClickListener { onClick() }
  }
  val root = OceanGuide(activity).apply {
    clipToPadding = false
    background = OceanBackdrop(activity)
    visibility = View.GONE
  }
  root.video = StartupOceanVideo(activity)
  root.addView(root.video)
  val column = column().apply { gravity = Gravity.CENTER_HORIZONTAL }
  val brand = label(38f).apply {
    text = "DeepCode"
    typeface = Typeface.create("sans-serif-light", Typeface.NORMAL)
    letterSpacing = -.025f
    setPadding(0, 0, 0, dp(18))
    androidx.core.view.ViewCompat.setAccessibilityHeading(this, true)
  }
  column.addView(brand)
  val progress = ProgressBar(activity, null, android.R.attr.progressBarStyleHorizontal).apply {
    max = 100
    isIndeterminate = true
    indeterminateTintList = ColorStateList.valueOf(accent)
    progressDrawable = DsUi.progressLayer(0xFF122C42.toInt(), accent, dp(3).toFloat())
    visibility = View.GONE
  }
  column.addView(progress, LinearLayout.LayoutParams(dp(112), dp(4)).apply { bottomMargin = dp(16) })
  val summary = label(14f, muted).apply {
    text = "正在准备…"
    accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE
  }
  column.addView(summary)
  val supporting = label(12f, muted).apply { setPadding(0, dp(8), 0, 0); visibility = View.GONE }
  column.addView(supporting)
  val primary = button("进入 DeepCode", callbacks.onStartEngine).apply { visibility = View.GONE }
  val actions = column().apply {
    gravity = Gravity.CENTER_HORIZONTAL
    addView(primary, LinearLayout.LayoutParams(dp(192), dp(48)).apply { topMargin = dp(16) })
  }
  column.addView(actions)
  val scroll = ScrollView(activity).apply {
    overScrollMode = View.OVER_SCROLL_NEVER
    isVerticalScrollBarEnabled = false
    addView(column, FrameLayout.LayoutParams(-1, -2))
  }
  root.pane = scroll
  root.addView(scroll)

  // Diagnostics remain live but are detached from the normal loading canvas.
  val diagnostics = column().apply { setPadding(dp(24), dp(16), dp(24), dp(16)) }
  val engineStatus = label(16f)
  val hint = label(13f, muted)
  val crash = label(12f, Color.rgb(255, 169, 163)).apply { visibility = View.GONE }
  val progressText = label(12f, muted).apply { visibility = View.GONE }
  val runtime = label(12f, muted)
  val storage = button("存储权限", callbacks.onGrantStorage)
  val version = label(11f, muted)
  val log = label(11f, muted).apply {
    typeface = Typeface.MONOSPACE
    gravity = Gravity.START
    setTextIsSelectable(true)
    setPadding(0, dp(16), 0, dp(8))
  }
  val copy = button("复制日志", callbacks.onCopyLog)
  val logSection = column().apply { addView(log); addView(copy); visibility = View.GONE }
  val console = button("打开控制台", callbacks.onOpenConsole)
  val update = button("检查更新", callbacks.onCheckUpdate)
  listOf(engineStatus, hint, crash, progressText, runtime, storage, version, logSection, console, update).forEach {
    diagnostics.addView(it, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(8) })
  }
  val diagnosticScroll = ScrollView(activity).apply { addView(diagnostics) }
  var dialog: AlertDialog? = null
  val details = label(12f, muted).apply {
    text = "启动详情"
    setPadding(dp(16), 0, dp(16), 0)
    isClickable = true
    isFocusable = true
    setOnClickListener {
      if (dialog?.isShowing == true) return@setOnClickListener
      (diagnosticScroll.parent as? ViewGroup)?.removeView(diagnosticScroll)
      dialog = AlertDialog.Builder(activity, android.R.style.Theme_Material_Dialog_Alert)
        .setTitle("启动详情").setView(diagnosticScroll).setPositiveButton("收起", null).create()
      dialog?.show()
      dialog?.window?.setBackgroundDrawable(DsUi.roundRect(Color.rgb(8, 25, 42), dp(24).toFloat()))
    }
  }
  root.details = details
  root.addView(details)
  return GuideChrome(root, brand, summary, actions, engineStatus, hint, View(activity), crash,
    progress, progressText, log, logSection, copy, primary, console, update, runtime, storage, version,
    summary, supporting, { dialog?.dismiss(); dialog = null })
}
