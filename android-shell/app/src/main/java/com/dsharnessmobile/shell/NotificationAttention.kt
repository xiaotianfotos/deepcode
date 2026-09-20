package com.dsharnessmobile.shell

import org.json.JSONArray

/** Immutable snapshots shared by WebView, overlay main thread and the notification watcher. */
internal object NotificationAttention {
 @Volatile var visible:Set<String> = emptySet(); private set
 data class Companion(val id:String="",val checkedAt:Long=0)
 @Volatile var companion=Companion()
 fun updateVisible(json:String){
  visible=runCatching{val a=JSONArray(json.take(12000));(0 until minOf(a.length(),16)).map{a.optString(it).take(160)}.filter{it.isNotBlank()}.toSet()}.getOrDefault(emptySet())
 }
 fun watching(id:String,foreground:Boolean,interactive:Boolean)=interactive&&foreground&&id.isNotBlank()&&id in visible
 fun desktop(id:String,foreground:Boolean,interactive:Boolean,now:Long):Boolean {
  val state=companion
  return interactive&&!foreground&&id.isNotBlank()&&state.id==id&&now-state.checkedAt in 0..2500
 }
 fun clearCompanion(){companion=Companion()}
}

/** Safety requests and failures keep an actionable notification, even while a chat is visible. */
internal object TaskNoticePolicy {
 fun silent(kind:String,outcome:String,watching:Boolean,desktop:Boolean):Boolean = when(kind){
  "report" -> watching || (desktop && outcome=="completed")
  "question","approval" -> watching
  else -> false
 }
 fun caption(text:String,textAt:Long,now:Long,dismissedThrough:Long)=text.isNotBlank()&&textAt>dismissedThrough&&now-textAt in 0 until 60_000
}
