package com.dsharnessmobile.shell

import android.graphics.Typeface
import android.text.TextUtils
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.ComponentActivity

/** Native startup / fallback screen: brand, live status, diagnostics, actions. */
internal class GuideChrome(
  val root: LinearLayout,
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
)

internal class GuideCallbacks(
  val onStartEngine: () -> Unit,
  val onOpenConsole: () -> Unit,
  val onCheckUpdate: () -> Unit,
  val onGrantStorage: () -> Unit,
  val onCopyLog: () -> Unit,
)

internal fun buildGuideChrome(activity: ComponentActivity, callbacks: GuideCallbacks): GuideChrome {
  val res = activity.resources
  fun dp(v: Float) = (v * res.displayMetrics.density).toInt()
  fun dim(id: Int) = res.getDimension(id)
  fun dpix(id: Int) = res.getDimensionPixelSize(id)
  fun color(id: Int) = activity.getColor(id)
  fun typeMedium() = Typeface.create("sans-serif-medium", Typeface.NORMAL)

  val hairline = (res.displayMetrics.density).toInt().coerceAtLeast(1)

  val root = LinearLayout(activity).apply {
    orientation = LinearLayout.VERTICAL
    background = android.graphics.drawable.GradientDrawable(
      android.graphics.drawable.GradientDrawable.Orientation.TOP_BOTTOM,
      intArrayOf(color(R.color.ds_glow), color(R.color.ds_bg), color(R.color.ds_bg)),
    )
    visibility = View.GONE
  }

  val content = LinearLayout(activity).apply {
    orientation = LinearLayout.VERTICAL
  }

  // —— Brand ——
  val iconPlate = FrameLayout(activity).apply {
    layoutParams = LinearLayout.LayoutParams(dpix(R.dimen.ds_logo_shell), dpix(R.dimen.ds_logo_shell))
    background = DsUi.roundRect(
      color(R.color.ds_accent_soft),
      dim(R.dimen.ds_radius_icon),
      color(R.color.ds_accent),
      hairline,
    )
  }
  val iconInner = FrameLayout(activity).apply {
    val size = dpix(R.dimen.ds_logo_size) + dp(6f)
    layoutParams = FrameLayout.LayoutParams(size, size, Gravity.CENTER)
    background = DsUi.roundRect(color(R.color.ds_surface), dim(R.dimen.ds_radius_sm))
  }
  iconInner.addView(ImageView(activity).apply {
    setImageResource(R.mipmap.ic_launcher)
    layoutParams = FrameLayout.LayoutParams(
      dpix(R.dimen.ds_logo_size), dpix(R.dimen.ds_logo_size), Gravity.CENTER,
    )
  })
  iconPlate.addView(iconInner)

  val titleCol = LinearLayout(activity).apply {
    orientation = LinearLayout.VERTICAL
    gravity = Gravity.CENTER_VERTICAL
    setPadding(dpix(R.dimen.ds_space_12), 0, 0, 0)
    layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
  }
  titleCol.addView(TextView(activity).apply {
    text = activity.getString(R.string.app_name)
    setTextSize(TypedValue.COMPLEX_UNIT_SP, 22f)
    setTextColor(color(R.color.ds_text_primary))
    typeface = typeMedium()
    letterSpacing = -0.02f
  })
  titleCol.addView(TextView(activity).apply {
    text = activity.getString(R.string.ds_brand_subtitle)
    setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
    setTextColor(color(R.color.ds_text_secondary))
    setPadding(0, dp(2f), 0, 0)
  })

  val versionLabel = TextView(activity).apply {
    setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
    setTextColor(color(R.color.ds_text_tertiary))
    typeface = typeMedium()
    background = DsUi.roundRect(color(R.color.ds_chip), dim(R.dimen.ds_radius_pill))
    setPadding(dp(10f), dp(5f), dp(10f), dp(5f))
  }

  val brandBlock = LinearLayout(activity).apply {
    orientation = LinearLayout.HORIZONTAL
    gravity = Gravity.CENTER_VERTICAL
    val lp = LinearLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
    )
    lp.bottomMargin = dpix(R.dimen.ds_space_24)
    layoutParams = lp
  }
  brandBlock.addView(iconPlate)
  brandBlock.addView(titleCol)
  brandBlock.addView(versionLabel)
  content.addView(brandBlock)

  // —— Status card (double-bezel) ——
  val shell = LinearLayout(activity).apply {
    orientation = LinearLayout.VERTICAL
    setPadding(dp(2f), dp(2f), dp(2f), dp(2f))
    background = DsUi.roundRect(
      color(R.color.ds_shell),
      dim(R.dimen.ds_radius_shell),
      color(R.color.ds_border),
      hairline,
    )
    val lp = LinearLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
    )
    lp.bottomMargin = dpix(R.dimen.ds_space_16)
    layoutParams = lp
  }
  val card = LinearLayout(activity).apply {
    orientation = LinearLayout.VERTICAL
    setPadding(dpix(R.dimen.ds_space_24), dp(22f), dpix(R.dimen.ds_space_24), dp(22f))
    background = DsUi.roundRect(
      color(R.color.ds_surface),
      dim(R.dimen.ds_radius_card),
      color(R.color.ds_hairline),
      hairline,
    )
  }

  val statusDot = View(activity).apply {
    layoutParams = LinearLayout.LayoutParams(dpix(R.dimen.ds_dot), dpix(R.dimen.ds_dot)).apply {
      gravity = Gravity.CENTER_VERTICAL
      marginEnd = dpix(R.dimen.ds_space_8)
    }
    background = DsUi.oval(color(R.color.ds_text_tertiary))
  }
  val engineStatus = TextView(activity).apply {
    setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
    setTextColor(color(R.color.ds_text_primary))
    typeface = typeMedium()
    setLineSpacing(0f, 1.2f)
    layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
  }
  val statusRow = LinearLayout(activity).apply {
    orientation = LinearLayout.HORIZONTAL
    gravity = Gravity.CENTER_VERTICAL
  }
  statusRow.addView(statusDot)
  statusRow.addView(engineStatus)
  card.addView(statusRow)

  val statusHint = TextView(activity).apply {
    setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
    setTextColor(color(R.color.ds_text_secondary))
    setLineSpacing(0f, 1.35f)
    setPadding(dp(16f), dpix(R.dimen.ds_space_8), 0, 0)
    visibility = View.GONE
  }
  card.addView(statusHint)

  val crashBanner = TextView(activity).apply {
    setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
    setTextColor(color(R.color.ds_danger))
    typeface = typeMedium()
    maxLines = 3
    ellipsize = TextUtils.TruncateAt.END
    visibility = View.GONE
    val lp = LinearLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
    )
    lp.topMargin = dpix(R.dimen.ds_space_16)
    layoutParams = lp
    background = DsUi.roundRect(color(R.color.ds_danger_soft), dim(R.dimen.ds_radius_sm))
    setPadding(dp(12f), dp(8f), dp(12f), dp(8f))
  }
  card.addView(crashBanner)

  val progressBar = ProgressBar(activity, null, android.R.attr.progressBarStyleHorizontal).apply {
    visibility = View.GONE
    max = 100
    progressDrawable = DsUi.progressLayer(
      color(R.color.ds_progress_track),
      color(R.color.ds_accent),
      dim(R.dimen.ds_radius_pill),
    )
    indeterminateTintList = android.content.res.ColorStateList.valueOf(color(R.color.ds_accent))
    val lp = LinearLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT, dpix(R.dimen.ds_progress_height),
    )
    lp.topMargin = dpix(R.dimen.ds_space_20)
    layoutParams = lp
  }
  card.addView(progressBar)

  val progressText = TextView(activity).apply {
    setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
    setTextColor(color(R.color.ds_text_secondary))
    setPadding(0, dpix(R.dimen.ds_space_8), 0, 0)
    visibility = View.GONE
  }
  card.addView(progressText)

  val runtimeChip = chipView(activity, typeMedium())
  val storageChip = chipView(activity, typeMedium()).apply {
    isClickable = true
    isFocusable = true
    DsUi.bindPressScale(this, 0.97f)
    setOnClickListener { callbacks.onGrantStorage() }
  }
  val chipRow = LinearLayout(activity).apply {
    orientation = LinearLayout.HORIZONTAL
    val lp = LinearLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
    )
    lp.topMargin = dpix(R.dimen.ds_space_20)
    layoutParams = lp
  }
  val chipLp = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
  val chipLpEnd = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
    marginStart = dpix(R.dimen.ds_space_8)
  }
  chipRow.addView(runtimeChip, chipLp)
  chipRow.addView(storageChip, chipLpEnd)
  card.addView(chipRow)

  val logHeader = LinearLayout(activity).apply {
    orientation = LinearLayout.HORIZONTAL
    gravity = Gravity.CENTER_VERTICAL
    val lp = LinearLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
    )
    lp.topMargin = dpix(R.dimen.ds_space_16)
    layoutParams = lp
  }
  logHeader.addView(TextView(activity).apply {
    text = activity.getString(R.string.ds_log_title)
    setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
    setTextColor(color(R.color.ds_text_tertiary))
    typeface = typeMedium()
    letterSpacing = 0.04f
    layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
  })
  val copyLog = TextView(activity).apply {
    text = activity.getString(R.string.ds_copy_log)
    setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
    setTextColor(color(R.color.ds_accent))
    typeface = typeMedium()
    setPadding(dp(8f), dp(4f), 0, dp(4f))
    isClickable = true
    isFocusable = true
    setOnClickListener { callbacks.onCopyLog() }
  }
  logHeader.addView(copyLog)

  val logSummary = TextView(activity).apply {
    setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
    setTextColor(color(R.color.ds_text_tertiary))
    typeface = Typeface.MONOSPACE
    setLineSpacing(0f, 1.45f)
    setPadding(0, dpix(R.dimen.ds_space_8), 0, 0)
    maxLines = 8
    ellipsize = TextUtils.TruncateAt.END
  }

  val logSection = LinearLayout(activity).apply {
    orientation = LinearLayout.VERTICAL
    visibility = View.GONE
    val lp = LinearLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
    )
    lp.topMargin = dpix(R.dimen.ds_space_8)
    layoutParams = lp
    addView(View(activity).apply {
      layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, hairline)
      setBackgroundColor(color(R.color.ds_hairline))
    })
    addView(logHeader)
    addView(logSummary)
  }
  card.addView(logSection)
  shell.addView(card)
  content.addView(shell)

  val scroll = ScrollView(activity).apply {
    isFillViewport = true
    overScrollMode = View.OVER_SCROLL_NEVER
    layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f)
    addView(
      content,
      FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT),
    )
  }
  root.addView(scroll)

  // —— Actions (sticky) ——
  fun makePrimary(): Button = Button(activity).apply {
    text = activity.getString(R.string.ds_start_engine)
    isAllCaps = false
    setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
    setTextColor(color(R.color.ds_text_on_accent))
    typeface = typeMedium()
    stateListAnimator = null
    background = DsUi.ripple(
      DsUi.roundRect(color(R.color.ds_accent), dim(R.dimen.ds_radius_pill)),
      color(R.color.ds_accent_pressed),
    )
    layoutParams = LinearLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT, dpix(R.dimen.ds_btn_height),
    )
    DsUi.bindPressScale(this)
    setOnClickListener { callbacks.onStartEngine() }
  }

  fun makeSecondary(label: String, onClick: () -> Unit): Button = Button(activity).apply {
    text = label
    isAllCaps = false
    setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
    setTextColor(color(R.color.ds_text_primary))
    typeface = typeMedium()
    stateListAnimator = null
    background = DsUi.ripple(
      DsUi.roundRect(color(R.color.ds_surface_muted), dim(R.dimen.ds_radius_pill)),
      color(R.color.ds_chip),
    )
    DsUi.bindPressScale(this, 0.97f)
    setOnClickListener { onClick() }
  }

  val primaryButton = makePrimary()
  val consoleButton = makeSecondary(activity.getString(R.string.ds_open_console), callbacks.onOpenConsole)
  val updateButton = makeSecondary(activity.getString(R.string.ds_check_update), callbacks.onCheckUpdate)

  val secondaryRow = LinearLayout(activity).apply {
    orientation = LinearLayout.HORIZONTAL
    val lp = LinearLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT, dpix(R.dimen.ds_btn_secondary_height),
    )
    lp.topMargin = dpix(R.dimen.ds_space_8)
    layoutParams = lp
  }
  val half = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f)
  val halfEnd = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f).apply {
    marginStart = dpix(R.dimen.ds_space_8)
  }
  secondaryRow.addView(consoleButton, half)
  secondaryRow.addView(updateButton, halfEnd)

  val actionBlock = LinearLayout(activity).apply {
    orientation = LinearLayout.VERTICAL
    setPadding(0, dpix(R.dimen.ds_space_12), 0, 0)
    addView(primaryButton)
    addView(secondaryRow)
  }
  root.addView(actionBlock)

  return GuideChrome(
    root = root,
    brandBlock = brandBlock,
    cardBlock = shell,
    actionBlock = actionBlock,
    engineStatus = engineStatus,
    statusHint = statusHint,
    statusDot = statusDot,
    crashBanner = crashBanner,
    progressBar = progressBar,
    progressText = progressText,
    logSummary = logSummary,
    logSection = logSection,
    copyLog = copyLog,
    primaryButton = primaryButton,
    consoleButton = consoleButton,
    updateButton = updateButton,
    runtimeChip = runtimeChip,
    storageChip = storageChip,
    versionLabel = versionLabel,
  )
}

private fun chipView(activity: ComponentActivity, type: android.graphics.Typeface): TextView {
  val res = activity.resources
  return TextView(activity).apply {
    setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
    setTextColor(activity.getColor(R.color.ds_text_secondary))
    typeface = type
    gravity = Gravity.CENTER
    maxLines = 1
    ellipsize = TextUtils.TruncateAt.END
    background = DsUi.roundRect(
      activity.getColor(R.color.ds_chip),
      res.getDimension(R.dimen.ds_radius_pill),
    )
    val padH = (10 * res.displayMetrics.density).toInt()
    val padV = (7 * res.displayMetrics.density).toInt()
    setPadding(padH, padV, padH, padV)
  }
}
