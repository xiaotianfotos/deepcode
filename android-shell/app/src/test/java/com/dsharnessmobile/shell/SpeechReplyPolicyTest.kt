package com.dsharnessmobile.shell

import org.junit.Assert.*
import org.junit.Test

class SpeechReplyPolicyTest {
 @Test fun blankViewKeepsSubmittedReplyButSwitchAndDisableDoNot(){
  val p=SpeechReplyPolicy();p.focus("session-a",1000);p.submission("voice",1100)
  assertEquals("session-a",p.focus("",1200))
  assertEquals(SpeechReplyPolicy.Display("",true),p.display(listOf("voice"),1,"working","",0,1300))
  p.focus("session-a",1400)
  assertEquals(SpeechReplyPolicy.Display("answer",false),p.display(listOf("voice"),1,"done","answer",1500,1500))
  p.focus("session-b",1600)
  assertNull(p.display(listOf("voice"),1,"done","answer",1500,1700))
  p.clear(1800);assertEquals("",p.focus("",1900))
 }
 @Test fun ordinaryChatAndHistoricalSpeechStayHidden(){
  val p=SpeechReplyPolicy();p.reset(1000)
  assertNull(p.display(listOf("typed"),1,"working","hello",1100,1100))
  p.submission("old",900)
  assertNull(p.display(listOf("old"),1,"done","old answer",900,1200))
 }
 @Test fun queuedSpeechCannotConsumeAnOlderTurn(){
  val p=SpeechReplyPolicy();p.reset(1000);p.submission("voice",1100)
  assertEquals(SpeechReplyPolicy.Display("",true),p.display(listOf("typed"),1,"done","wrong",1200,1200))
  assertEquals(SpeechReplyPolicy.Display("",true),p.display(emptyList(),2,"working","",0,1300))
  assertEquals(SpeechReplyPolicy.Display("first",true),p.display(listOf("voice"),2,"working","first",1400,1400))
  assertEquals(SpeechReplyPolicy.Display("first",true),p.display(listOf("voice"),2,"working","",0,1500))
  assertEquals(SpeechReplyPolicy.Display("result",false),p.display(listOf("voice"),2,"done","result",1600,1600))
  assertEquals(SpeechReplyPolicy.Display("result",false),p.display(listOf("typed-next"),3,"working","wrong next",1700,1700))
  p.submission("voice",1100) // A retained native snapshot must not restart the timer.
  assertNull(p.display(listOf("typed-next"),3,"working","wrong next",62000,62000))
 }
 @Test fun resetHidesAndNewCaptureCanStartAgain(){
  val p=SpeechReplyPolicy();p.reset(1000);p.submission("voice",1100)
  p.reset(1200);p.submission("voice",1100)
  assertNull(p.display(listOf("voice"),1,"working","stale",1300,1300))
  p.submission("new",1400)
  assertEquals(SpeechReplyPolicy.Display("",true),p.display(emptyList(),1,"idle","",0,1500))
  assertNull(p.display(emptyList(),1,"idle","",0,1801500))
 }
}
