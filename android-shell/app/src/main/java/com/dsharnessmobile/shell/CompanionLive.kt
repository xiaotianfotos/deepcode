package com.dsharnessmobile.shell

/** The Live plugin owns eligibility; native UI never chooses a model or elevates permissions. */
internal object CompanionLive {
 var sessionId=""; private set
 fun update(id:String,eligible:Boolean){
  sessionId=if(eligible&&id.matches(Regex("session-[A-Za-z0-9-]+")))id else ""
  OverlayService.instance?.panel?.refreshLive()
 }
 fun available()=sessionId.isNotBlank()
 fun active()=LiveVoiceService.instance!=null
 fun mine()=active()&&LiveVoiceService.state.optString("sessionId")==sessionId
 fun toggle(svc:OverlayService){
  if(!available())return
  if(active()){
   if(mine())svc.stopService(android.content.Intent(svc,LiveVoiceService::class.java))
   else svc.flashStatus("另一个会话正在使用 GPT Live，请先结束")
   return
  }
  if(VoiceInputController.microphoneInUse()){svc.flashStatus("请先结束当前录音");return}
  // A user-clicked foreground Activity also satisfies Android's microphone start restrictions.
  runCatching{svc.startActivity(android.content.Intent(svc,LiveVoiceActivity::class.java)
   .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
   .putExtra("sessionId",sessionId).putExtra("requestStart",true)
   .putExtra("desktopOrigin",!SpeechSessionFocus.foreground))}
   .onFailure{svc.flashStatus("无法开启 GPT Live，请打开 DeepCode 后再试")}
 }
}
