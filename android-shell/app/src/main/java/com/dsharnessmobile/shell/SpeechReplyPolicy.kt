package com.dsharnessmobile.shell

/** A desktop response belongs to an accepted voice request, not general session activity. */
internal class SpeechReplyPolicy {
 data class Display(val text:String, val busy:Boolean)
 private var after=0L
 private var request=""
 private var observed=""
 private var acceptedAt=0L
 private var turn:Long?=null
 private var text=""
 private var textAt=0L
 private var finished=false
 private var session=""

 // A blank/loading/new-chat view does not move an already submitted desktop reply.
 // Recording still requires a currently selected session in SpeechOverlay.
 fun focus(id:String,now:Long):String {
  if(id.isNotBlank()&&id!=session){reset(now);session=id}
  return session
 }
 fun clear(now:Long){session="";reset(now)}

 fun reset(now:Long){after=now;request="";observed="";turn=null;text="";textAt=0;finished=false}
 fun submission(id:String,submittedAt:Long){
  if(id.isBlank()||id==observed||submittedAt<=after)return
  observed=id;request=id;acceptedAt=submittedAt;turn=null;text="";textAt=0;finished=false
 }
 fun display(ids:List<String>,feedTurn:Long,phase:String,value:String,updatedAt:Long,now:Long):Display?{
  if(request.isBlank())return null
  if(request in ids && (turn==null||turn==feedTurn)){
   turn=feedTurn
   if(value.isNotBlank()&&updatedAt>=acceptedAt-1000){text=value;textAt=updatedAt}
   if(phase in listOf("done","error","stopped"))finished=true
  }else if(turn!=null&&turn!=feedTurn){finished=true}
  // Keep the last answer during tools, but don't leave a lost/queued request spinning forever.
  if(now-acceptedAt>30*60_000L){finished=true}
  if(text.isNotEmpty()&&now-textAt<60_000L)return Display(text,!finished)
  if(!finished&&text.isEmpty())return Display("",true)
  return null
 }
}
