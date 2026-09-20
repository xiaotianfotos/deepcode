package com.dsharnessmobile.shell
import android.os.Handler
import android.os.Looper
/** Shared local audio interruption without stealing the microphone lease. */
internal object SpeechPlayback {
 var cancel:(()->Unit)?=null
 fun stop(){Handler(Looper.getMainLooper()).post{cancel?.invoke()}}
}
