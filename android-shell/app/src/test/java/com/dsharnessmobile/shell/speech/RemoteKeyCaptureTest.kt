package com.dsharnessmobile.shell
import org.junit.Assert.*
import org.junit.Test
class RemoteKeyCaptureTest {
 @Test fun oneKeyLearningConsumesDownRepeatsAndReleaseWithoutActions(){
  val p=RemoteKeyCapture { 100L };p.begin("a")
  assertTrue(p.handle(3,4,true,0,false,true,true));assertEquals("captured",p.phase);assertEquals(4,p.code)
  p.cancel("a") // saving/re-rendering must not leak the rest of a held Back key.
  assertTrue(p.handle(3,4,true,1,false,true,true))
  assertTrue(p.handle(3,4,false,0,false,true,true))
  assertFalse(p.handle(3,4,true,0,false,true,true))
 }
 @Test fun rejectsOtherDevicesSystemKeysAndOrphanRepeats(){
  val p=RemoteKeyCapture { 100L };p.begin("a")
  assertFalse(p.handle(8,135,true,0,false,false,true));assertEquals("waiting",p.phase)
  assertFalse(p.handle(3,24,true,0,false,true,false));assertTrue(p.warning.isNotEmpty());assertEquals("waiting",p.phase)
  assertTrue(p.handle(3,135,true,1,false,true,true));assertEquals("waiting",p.phase)
  assertTrue(p.handle(3,135,true,0,false,true,true));assertEquals(135,p.code)
 }
 @Test fun timeoutCancelStaleCleanupAndLifecycleReset(){
  var time=0L;val p=RemoteKeyCapture { time };p.begin("a");time=15000
  assertFalse(p.handle(3,66,true,0,false,true,true));assertEquals("timeout",p.phase)
  p.begin("b");p.cancel("a");assertEquals("waiting",p.phase)
  p.cancel("b");assertFalse(p.handle(3,66,true,0,false,true,true))
  p.begin("c");p.handle(3,66,true,0,false,true,true);p.reset();assertEquals("idle",p.phase)
 }
}
