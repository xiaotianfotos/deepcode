package com.dsharnessmobile.shell

import android.media.AudioManager
import org.junit.Assert.*
import org.junit.Test

class LiveAudioFocusPolicyTest {
  @Test fun notificationDucksWithoutStoppingAndGainRestores() {
    val p=LiveAudioFocusPolicy()
    assertEquals(LiveAudioFocusPolicy.Mode.DUCKED,p.change(AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK))
    assertFalse(p.paused);assertEquals(0.2,p.gain,0.001)
    assertEquals(LiveAudioFocusPolicy.Mode.ACTIVE,p.change(AudioManager.AUDIOFOCUS_GAIN))
    assertEquals(1.0,p.gain,0.001)
  }
  @Test fun exclusiveTransientFocusPausesUntilActualGain() {
    val p=LiveAudioFocusPolicy()
    p.change(AudioManager.AUDIOFOCUS_LOSS_TRANSIENT)
    assertTrue(p.paused);assertEquals(0.0,p.gain,0.001)
    p.change(AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK)
    assertTrue(p.paused)
    p.change(AudioManager.AUDIOFOCUS_GAIN)
    assertFalse(p.paused)
  }
  @Test fun permanentLossCannotBeRevivedByLateCallback() {
    val p=LiveAudioFocusPolicy()
    p.change(AudioManager.AUDIOFOCUS_LOSS)
    assertEquals(LiveAudioFocusPolicy.Mode.STOPPED,p.change(AudioManager.AUDIOFOCUS_GAIN))
    assertTrue(p.paused)
  }
  @Test fun repeatedOrUnknownEventsDoNotRestartOrUnpause() {
    val p=LiveAudioFocusPolicy()
    repeat(4){p.change(AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK)}
    assertEquals(LiveAudioFocusPolicy.Mode.DUCKED,p.change(999))
    p.change(AudioManager.AUDIOFOCUS_LOSS_TRANSIENT)
    assertEquals(LiveAudioFocusPolicy.Mode.PAUSED,p.change(999))
  }
}
