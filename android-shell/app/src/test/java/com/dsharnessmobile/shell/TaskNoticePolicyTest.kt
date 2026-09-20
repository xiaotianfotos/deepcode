package com.dsharnessmobile.shell
import org.junit.Assert.*
import org.junit.Test
class TaskNoticePolicyTest {
 @Test fun visibleConversationSilencesButOtherConversationsAlert(){
  NotificationAttention.updateVisible("[\"a\",\"b\"]")
  assertTrue(NotificationAttention.watching("a",true,true))
  assertFalse(NotificationAttention.watching("c",true,true))
  assertFalse(NotificationAttention.watching("a",false,true))
  assertFalse(NotificationAttention.watching("a",true,false))
  assertTrue(TaskNoticePolicy.silent("report","completed",true,false))
  assertFalse(TaskNoticePolicy.silent("report","completed",false,false))
 }
 @Test fun voiceModeDoesNotHideErrorsOrDecisions(){
  assertTrue(TaskNoticePolicy.silent("report","completed",false,true))
  for(outcome in listOf("error","blocked","unknown","max-tokens"))assertFalse(TaskNoticePolicy.silent("report",outcome,false,true))
  for(kind in listOf("approval","question")){
   assertFalse(TaskNoticePolicy.silent(kind,"",false,true))
   assertTrue(TaskNoticePolicy.silent(kind,"",true,true))
  }
 }
 @Test fun staleBrokenOrLockedCompanionCannotSuppressAnAlert(){
  NotificationAttention.companion=NotificationAttention.Companion("a",1000)
  assertTrue(NotificationAttention.desktop("a",false,true,2000))
  assertFalse(NotificationAttention.desktop("a",false,true,4000))
  assertFalse(NotificationAttention.desktop("a",false,false,2000))
  assertFalse(NotificationAttention.desktop("b",false,true,2000))
  assertFalse(NotificationAttention.desktop("a",true,true,2000))
  NotificationAttention.clearCompanion()
  assertFalse(NotificationAttention.desktop("a",false,true,2000))
 }
 @Test fun captionOnlyForNewReplyExpiresEvenDuringLongTask(){
  assertFalse(TaskNoticePolicy.caption("",1000,1200,0))
  assertTrue(TaskNoticePolicy.caption("answer",1000,60999,0))
  assertFalse(TaskNoticePolicy.caption("answer",1000,61000,0))
  assertFalse(TaskNoticePolicy.caption("answer",1000,2000,1000))
  assertTrue(TaskNoticePolicy.caption("next",2000,2500,1000))
  assertFalse(TaskNoticePolicy.caption("future",3000,2000,0))
 }
 @Test fun concurrentSessionsHaveIndependentProgressSlots(){
  assertNotEquals(NotifyCenter.notificationId(NotifyEntry(kind="todo",sessionId="a"),NotifyCenter.Face.TODO),NotifyCenter.notificationId(NotifyEntry(kind="todo",sessionId="b"),NotifyCenter.Face.TODO))
 }
}
