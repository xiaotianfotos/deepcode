package com.dsharnessmobile.shell;
import org.junit.Test;
import static org.junit.Assert.*;
public class FoldProjectionTest {
 @Test public void projectedCoverSpanMovesRightToLeftWithOpening(){
  assertEquals(1,FoldProjection.boundary(0),1e-6);
  assertEquals(Math.sqrt(.5),FoldProjection.boundary(45),1e-6);
  assertEquals(0,FoldProjection.boundary(90),1e-6);
  assertEquals(0,FoldProjection.boundary(180),1e-6);
  for(int a=1;a<=180;a++)assertTrue(FoldProjection.boundary(a)<=FoldProjection.boundary(a-1));
 }
 @Test public void openingMovesCoverBlurRightToLeftAtEveryPixel(){
  for(int x=0;x<=100;x++){
   float lastInner=1,lastOuter=0;
   for(int a=0;a<=180;a++){
    float b=FoldProjection.boundary(a),inner=FoldProjection.leftClearMask(x/100f,b,.24f),outer=FoldProjection.rightBlurMask(x/100f,b,.24f);
    assertEquals(1,inner+outer,1e-5);assertTrue(inner<=lastInner+1e-6);assertTrue(outer>=lastOuter-1e-6);
    lastInner=inner;lastOuter=outer;
   }
   if(x>=24){assertEquals(0,lastInner,1e-5);assertEquals(1,lastOuter,1e-5);}
   if(x==0)assertEquals(0,lastOuter,1e-5);
  }
 }
 @Test public void oneFrameHasOppositeSpatialMasks(){
  float b=FoldProjection.boundary(120);
  assertTrue(FoldProjection.leftClearMask(.1f,b,.24f)>FoldProjection.leftClearMask(.9f,b,.24f));
  assertTrue(FoldProjection.rightBlurMask(.1f,b,.24f)<FoldProjection.rightBlurMask(.9f,b,.24f));
 }
 @Test public void newlyRevealedPixelsResolveAcrossTheProjectedEdge(){
  assertEquals(1,FoldProjection.innerBoundary(0),1e-6);
  assertEquals(.75f,FoldProjection.innerBoundary(60),1e-6);
  assertEquals(.5f,FoldProjection.innerBoundary(90),1e-6);
  assertEquals(.25f,FoldProjection.innerBoundary(120),1e-6);
  assertEquals(0,FoldProjection.innerBoundary(180),1e-6);
  // The fixed half must not become unconditionally clear while occluded.
  assertTrue(FoldProjection.movingHalfBlurMask(.6f,30)>.9f);
  assertEquals(0,FoldProjection.movingHalfBlurMask(.95f,60),0);
  assertTrue(FoldProjection.movingHalfBlurMask(.95f,45)>.1f);
  assertTrue(FoldProjection.movingHalfBlurMask(.75f,60)>.5f);
  assertEquals(0,FoldProjection.movingHalfBlurMask(.95f,90),0);
  for(int x=0;x<=100;x++){
   float previous=1;
   for(int angle=0;angle<=180;angle++){
    float blur=FoldProjection.movingHalfBlurMask(x/100f,angle);
    assertTrue(blur<=previous+1e-6);previous=blur;
    if(x/100f>=FoldProjection.innerBoundary(angle)+FoldProjection.INNER_FEATHER_AFTER)assertEquals(0,blur,0);
   }
   assertEquals(0,previous,0);
  }
 }
 @Test public void sensorEndpointsHaveNoResidualEffect(){
  for(int a=175;a<=180;a++)for(int x=0;x<=100;x++)assertEquals(0,FoldProjection.movingHalfBlurMask(x/100f,a),0);
  for(int a=0;a<=3;a++)assertEquals(0,FoldProjection.coverStrength(a),0);
  assertTrue(FoldProjection.innerStrength(170)<.1f);
  assertTrue(FoldProjection.innerStrength(174)<.004f);
  assertEquals(1,FoldProjection.innerStrength(145),0);
 }
}
