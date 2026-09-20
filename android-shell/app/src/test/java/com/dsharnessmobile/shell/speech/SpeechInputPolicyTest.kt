package com.dsharnessmobile.shell
import org.junit.Assert.*
import org.junit.Test
class SpeechInputPolicyTest {
 @Test fun activityFollowsCaptureAndSettlesWithoutTts(){
  assertEquals("recording",SpeechFeedback.phase("recording",true,true,false))
  assertEquals("transcribing",SpeechFeedback.phase("transcribing",false,false,false))
  assertEquals("working",SpeechFeedback.phase("sent",false,true,false))
  assertEquals("working",SpeechFeedback.phase("sent",true,false,false))
  assertEquals("idle",SpeechFeedback.phase("sent",false,false,false))
  assertEquals("speaking",SpeechFeedback.phase("sent",false,false,true))
  assertEquals("",SpeechFeedback.label("idle"))
 }

 @Test fun keepsOriginalTargetAndOnlyClaimsOnce(){val d=SpeechDelivery("session-A","recording-1");assertEquals("原文\n第二行",d.claim(" 原文\n第二行 ",false));assertEquals("session-A",d.sessionId);assertNull(d.claim("late duplicate",false))}
 @Test fun cancellationAndAutomaticLimitNeverSend(){val a=SpeechDelivery("A","r");assertNull(a.claim("",false));assertNull(a.claim("录音达到上限",true));a.cancel();assertNull(a.claim("late response",false));assertFalse(a.valid())}
 @Test fun vadSilenceSendsOnceButLimitAndEmptyDoNot(){
  val d=SpeechDelivery("original-session","r")
  assertNull(d.claim("",true,true))
  assertEquals("说完自动发",d.claim(" 说完自动发 ",true,true))
  assertEquals("original-session",d.sessionId)
  assertNull(d.claim("duplicate",false))
  val capped=SpeechDelivery("A","r2");assertNull(capped.claim("截断的文本",true,false))
  val canceled=SpeechDelivery("A","r3");canceled.cancel();assertNull(canceled.claim("迟到识别",true,true))
 }
 @Test fun repeatsAndOrphanReleasesDoNotToggle(){val p=SpeechKeyPolicy();assertTrue(p.press(1,100,true,true,true,0));assertFalse(p.press(1,100,true,true,true,1));assertFalse(p.press(1,100,true,true,true,0));assertFalse(p.press(1,100,true,true,false,0));assertTrue(p.press(1,100,true,true,true,0))}
 @Test fun focusDisableAndDisconnectReleasePressOwnership(){val p=SpeechKeyPolicy();assertFalse(p.press(1,100,false,true,true,0));assertFalse(p.press(1,100,true,false,true,0));assertTrue(p.press(1,100,true,true,true,0));p.disconnected(1);assertTrue(p.press(1,100,true,true,true,0));p.reset();assertTrue(p.press(1,100,true,true,true,0))}
}
