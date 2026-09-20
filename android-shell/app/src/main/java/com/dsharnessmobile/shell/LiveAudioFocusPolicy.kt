package com.dsharnessmobile.shell

import android.media.AudioManager

/** Transient focus events retain the live session; only permanent loss closes media. */
internal class LiveAudioFocusPolicy {
  enum class Mode { ACTIVE, DUCKED, PAUSED, STOPPED }
  var mode = Mode.ACTIVE
    private set
  val paused get() = mode == Mode.PAUSED || mode == Mode.STOPPED
  val gain get() = if (mode == Mode.DUCKED) 0.2 else if (paused) 0.0 else 1.0

  fun change(event: Int): Mode {
    // An abandoned request cannot restart recording through a late GAIN callback.
    if (mode == Mode.STOPPED) return mode
    mode = when (event) {
      AudioManager.AUDIOFOCUS_GAIN -> Mode.ACTIVE
      AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> if (mode == Mode.PAUSED) Mode.PAUSED else Mode.DUCKED
      AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> Mode.PAUSED
      AudioManager.AUDIOFOCUS_LOSS -> Mode.STOPPED
      else -> mode
    }
    return mode
  }
}
