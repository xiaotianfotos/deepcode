package com.dsharnessmobile.shell;
import org.junit.Test;
import static org.junit.Assert.*;

public class FoldHingeMotionTest {
 @Test public void restingOpenEndpointDoesNotRetrigger() {
  FoldHingeMotion m=new FoldHingeMotion();m.update(180);
  for(float angle:new float[]{178,180,179,175,178})assertNull(m.update(angle));
  assertTrue(m.update(160)>0);
 }
 @Test public void initialAngleAndNoiseDoNotBlur() {
  FoldHingeMotion m=new FoldHingeMotion();assertNull(m.update(170));assertNull(m.update(169.5f));assertNull(m.update(Float.NaN));assertNull(m.update(190));
 }
 @Test public void closingBlursBeforeTheWindowChanges() {
  FoldHingeMotion m=new FoldHingeMotion();m.update(170);
  float first=m.update(160);assertTrue(first>0 && first<.2f);
  assertTrue(m.update(90)>first);assertEquals(1f,m.update(0),.001f);
 }
 @Test public void handoffStopsRepeatedBlurAndReversingStartsOpening() {
  FoldHingeMotion m=new FoldHingeMotion();m.update(170);m.update(120);m.settle();
  assertNull(m.update(70));assertNull(m.update(0));assertTrue(m.update(10)>0);assertEquals(1f,m.update(40),.001f);
 }
 @Test public void pausingAtHalfFoldCanContinueInTheSameDirection() {
  FoldHingeMotion m=new FoldHingeMotion();m.update(170);m.update(90);m.settle();m.rearm();assertTrue(m.update(80)>0);
 }
 @Test public void resetDoesNotTreatResumeSampleAsMovement() {
  FoldHingeMotion m=new FoldHingeMotion();m.update(170);m.update(90);m.reset();assertNull(m.update(0));
 }
}
