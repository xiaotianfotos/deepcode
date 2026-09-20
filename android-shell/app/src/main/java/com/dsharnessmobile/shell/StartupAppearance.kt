package com.dsharnessmobile.shell

import android.content.Context

/** Bootstrap cache of the plugin-owned setting; no product settings UI lives in the shell. */
internal object StartupAppearance {
  private const val PREFS = "dsh_startup_appearance"
  fun enabled(context: Context): Boolean = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean("enabled", true)
  fun configure(context: Context, enabled: Boolean) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean("enabled", enabled).apply()
  }
}
