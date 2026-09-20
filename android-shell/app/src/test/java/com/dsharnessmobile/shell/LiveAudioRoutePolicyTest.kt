package com.dsharnessmobile.shell
import android.media.AudioDeviceInfo as A
import org.junit.Assert.*
import org.junit.Test
class LiveAudioRoutePolicyTest {
 private val ear=LiveAudioRoutePolicy.Device(1,A.TYPE_BUILTIN_EARPIECE)
 private val speaker=LiveAudioRoutePolicy.Device(2,A.TYPE_BUILTIN_SPEAKER)
 private val usb=LiveAudioRoutePolicy.Device(3,A.TYPE_USB_HEADSET)
 private val bt=LiveAudioRoutePolicy.Device(4,A.TYPE_BLUETOOTH_SCO)
 @Test fun defaultsToSpeakerEvenIfSystemDefaultIsEarpiece(){assertEquals(2,LiveAudioRoutePolicy.choose(listOf(ear,speaker),1))}
 @Test fun retainsActiveHeadset(){assertEquals(4,LiveAudioRoutePolicy.choose(listOf(speaker,usb,bt),4))}
 @Test fun plugAndUnplug(){assertEquals(3,LiveAudioRoutePolicy.choose(listOf(ear,speaker,usb),2));assertEquals(2,LiveAudioRoutePolicy.choose(listOf(ear,speaker),3))}
 @Test fun missingRouteDoesNotChooseQuietEarpiece(){assertNull(LiveAudioRoutePolicy.choose(listOf(ear),1));assertNull(LiveAudioRoutePolicy.choose(emptyList(),null))}
}
