package com.dsharnessmobile.shell

/** Process-local projection of the actual visible chat. Never creates or selects a session. */
internal object SpeechSessionFocus {
 var foreground=false
  set(value){field=value;OverlayService.instance?.let{svc->svc.main.post{svc.refreshBallKeyFocus();svc.speech.foregroundChanged()}}}
 @Volatile private var openId=""
 @Volatile private var openAt=0L
 fun requestOpen(id:String){openId=id;openAt=android.os.SystemClock.uptimeMillis()}
 fun pendingOpen():String=if(android.os.SystemClock.uptimeMillis()-openAt<15_000)openId else ""
 fun ackOpen(id:String){if(openId==id)openId=""}
 var id=""; private set
 var title=""; private set
 var enabled=false; private set
 fun update(id:String,title:String,enabled:Boolean){
  this.id=if(enabled)id else "";this.title=if(enabled)title else "";this.enabled=enabled
  OverlayService.instance?.followSpeechSession()
 }
}
