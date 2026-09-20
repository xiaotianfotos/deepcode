package com.dsharnessmobile.shell

/** One transcript belongs to one recording and one session, even after the UI changes target. */
internal class SpeechDelivery(val sessionId:String,val requestId:String) {
 @Volatile private var closed=false
 private var claimed=false
 @Synchronized fun claim(text:String,automaticStop:Boolean,silenceEnded:Boolean=false):String? {
  if(closed||claimed||(automaticStop&&!silenceEnded)||sessionId.isBlank()||text.isBlank())return null
  claimed=true;return text.trim()
 }
 fun cancel(){closed=true}
 fun valid()=!closed
}

/** A press must begin in the focused panel; repeats and orphan release events never toggle. */
internal class SpeechKeyPolicy {
 private val down=mutableSetOf<Pair<Int,Int>>()
 fun press(device:Int,key:Int,focused:Boolean,enabled:Boolean,isDown:Boolean,repeat:Int):Boolean {
  if(!focused||!enabled){down.clear();return false}
  val pair=device to key
  if(!isDown){down.remove(pair);return false}
  return repeat==0&&down.add(pair)
 }
 fun reset(){down.clear()}
 fun disconnected(device:Int){down.removeAll{it.first==device}}
}

/** Presentation only: a completed/stopped turn must never retain the waiting animation. */
internal object SpeechFeedback {
 fun phase(capture:String,agentWorking:Boolean,awaitingReply:Boolean,playing:Boolean):String = when {
  capture in listOf("preparing","recording","transcribing","sending") -> capture
  agentWorking || awaitingReply -> "working"
  playing -> "speaking"
  else -> "idle"
 }
 fun label(phase:String):String = when(phase){
  "preparing" -> "正在连接麦克风"
  "recording" -> "正在听 · 停顿后自动发送"
  "transcribing" -> "正在识别"
  "sending" -> "正在发送"
  "working" -> "AI 正在回复"
  "speaking" -> "正在朗读"
  else -> ""
 }
}
