package com.dsharnessmobile.shell;
import org.junit.Test;
import static org.junit.Assert.*;
public class FoldPerspectiveTest {
 @Test public void normalFacesAreIdentityAndInnerFixedHalfNeverMoves(){
  for(int i=0;i<=100;i++){
   double x=i/100.0;
   assertArrayEquals(new double[]{x,.2},FoldPerspective.sample(x,.2,1.4,180,true),1e-6);
   assertArrayEquals(new double[]{x,.2},FoldPerspective.sample(x,.2,.68,0,false),1e-6);
   for(int a=0;a<=180;a++)if(x>=.5)
    assertArrayEquals(new double[]{x,.2},FoldPerspective.sample(x,.2,1.4,a,true),0);
  }
 }
 @Test public void hingeIsAnchoredAndVerticalPerspectiveIsSymmetric(){
  for(boolean inner:new boolean[]{false,true})for(int a=0;a<=180;a++){
   double h=inner?.5:0;
   assertArrayEquals(new double[]{h,.13},FoldPerspective.sample(h,.13,1.4,a,inner),1e-6);
   double x=inner?.1:.9;
   double[] top=FoldPerspective.sample(x,.1,1.4,a,inner),bottom=FoldPerspective.sample(x,.9,1.4,a,inner);
   assertEquals(1,top[1]+bottom[1],1e-6);
  }
 }
 @Test public void rayProjectionMatchesKnownGeometry(){
  // 60 degrees, cover x=.8 and aspect=1: physical point (.4,.1,z=.8*sin60).
  double scale=2.4/(2.4-.8*Math.sin(Math.PI/3));
  assertArrayEquals(new double[]{.4*scale,.5+.1*scale},FoldPerspective.project(.8,.6,1,60,false),1e-6);
  assertEquals(.5,FoldPerspective.project(.1,.5,1,90,true)[0],1e-6);
  assertTrue(FoldPerspective.project(.1,.5,1,45,true)[0]>.5);
  assertTrue(FoldPerspective.project(.1,.5,1,135,true)[0]<.5);
 }
 @Test public void allAnglesStayFiniteWithoutPerspectiveSingularity(){
  for(boolean inner:new boolean[]{false,true})for(double ar:new double[]{.4,.7,1,1.5,3})
   for(int a=0;a<=180;a++)for(int i=0;i<=100;i++){
    double[] uv=FoldPerspective.sample(i/100.0,.2,ar,a,inner);
    assertTrue(Double.isFinite(uv[0])&&Double.isFinite(uv[1]));
   }
 }
 @Test public void equalPhysicalPanelsUseTheSameEyeDistance(){
  // Same height, full inner width = two cover panels. Equal distances from
  // the hinge must give equal depth magnification, independent of canvas size.
  for(int a=1;a<90;a++){
   double[] inner=FoldPerspective.sample(.1,.2,1.42,180-a,true);
   double[] cover=FoldPerspective.sample(.8,.2,.71,a,false);
   assertEquals(inner[1],cover[1],1e-6);
  }
 }
 @Test public void liveTextWarpStaysWithinAPhysicalPanelBudget(){
  for(boolean inner:new boolean[]{false,true})for(int a=0;a<=180;a++)for(int i=0;i<=100;i++){
   double x=i/100.0;
   for(double y:new double[]{0,.1,.5,.9,1}){
    double[] uv=FoldPerspective.sample(x,y,1.42,a,inner);
    assertTrue(Math.abs(uv[0]-x)<=(inner?.0225:.045)+1e-8);
    assertTrue(Math.abs(uv[1]-y)<=.02000001);
    if(a==0 || a==180)assertArrayEquals(new double[]{x,y},uv,1e-6);
   }
  }
 }
}
