package com.dsharnessmobile.shell

import android.content.Context

/** 主题协作类：系统明暗判定（isDarkTheme）与展开态色板（themeColors），悬浮球配色唯一来源。 */
class OverlayTheme(private val ctx: Context) {

  /** 系统明暗（0.13.2 悬浮球明暗适配：展开态颜色跟随 uiMode）。 */
  fun isDarkTheme(): Boolean =
    (ctx.resources.configuration.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK) ==
      android.content.res.Configuration.UI_MODE_NIGHT_YES

  /** 主题色板（随 isDarkTheme() 取用）。 */
  data class ThemeColors(
    val unitBg: Int, val unitStroke: Int,
    val idleText: Int, val offText: Int, val clockText: Int,
    val inputBg: Int, val inputStroke: Int, val inputText: Int, val inputHint: Int,
    val divider: Int, val chevron: Int,
  )

  fun themeColors(): ThemeColors = if (isDarkTheme()) {
    ThemeColors(
      unitBg = 0xF21E1F24.toInt(), unitStroke = 0xFF3A3D45.toInt(),
      idleText = 0xFF8A8F98.toInt(), offText = 0xFFE04848.toInt(), clockText = 0xFF81858C.toInt(),
      inputBg = 0xFF2A2D33.toInt(), inputStroke = 0xFF3A3D45.toInt(),
      inputText = 0xFFE8EAED.toInt(), inputHint = 0xFF9AA0A6.toInt(),
      divider = 0xFF2A2D33.toInt(), chevron = 0xFF8AB4F8.toInt(),
    )
  } else {
    ThemeColors(
      unitBg = 0xF2F8F9FA.toInt(), unitStroke = 0xFFDADCE0.toInt(),
      idleText = 0xFF5F6368.toInt(), offText = 0xFFC5221F.toInt(), clockText = 0xFF5F6368.toInt(),
      inputBg = 0xFFFFFFFF.toInt(), inputStroke = 0xFFDADCE0.toInt(),
      inputText = 0xFF202124.toInt(), inputHint = 0xFF80868B.toInt(),
      divider = 0xFFE8EAED.toInt(), chevron = 0xFF5F6368.toInt(),
    )
  }
}
