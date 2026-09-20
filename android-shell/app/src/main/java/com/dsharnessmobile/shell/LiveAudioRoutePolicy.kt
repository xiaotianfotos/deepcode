package com.dsharnessmobile.shell

import android.media.AudioDeviceInfo as A

/** Prefer the user's current headset; use the loudspeaker rather than the earpiece otherwise. */
internal object LiveAudioRoutePolicy {
 data class Device(val id:Int,val type:Int)
 fun external(type:Int)=type in listOf(A.TYPE_WIRED_HEADSET,A.TYPE_WIRED_HEADPHONES,A.TYPE_USB_HEADSET,A.TYPE_USB_DEVICE,A.TYPE_BLE_HEADSET,A.TYPE_BLUETOOTH_SCO)
 fun choose(devices:List<Device>,current:Int?):Int? =
  devices.firstOrNull{it.id==current&&external(it.type)}?.id
   ?:devices.firstOrNull{external(it.type)}?.id
   ?:devices.firstOrNull{it.type==A.TYPE_BUILTIN_SPEAKER}?.id
}
