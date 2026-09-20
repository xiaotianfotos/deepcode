package com.dsharnessmobile.shell;
import org.junit.Test;
import static org.junit.Assert.*;
public class FoldDualPolicyTest {
 @Test public void opensBothFromEitherPrimaryBeforeWindowSwitch(){
  for(boolean outer:new boolean[]{false,true}){
   FoldDualPolicy p=new FoldDualPolicy();assertEquals(0,p.update(outer?0:180,0,outer));
   assertEquals(0,p.update(outer?10:165,10,outer));assertEquals(1,p.update(outer?10:165,120,outer));
  }
 }
 @Test public void heldHalfFoldStaysDualAndEndpointsNeedDwell(){
  FoldDualPolicy p=new FoldDualPolicy();p.update(90,0,false);assertEquals(1,p.update(90,100,false));
  assertEquals(1,p.update(90,100000,false));assertEquals(1,p.update(178,100010,false));
  assertEquals(1,p.update(175,100100,false));assertEquals(1,p.update(179,100200,false));
  assertEquals(0,p.update(179,100450,false));
 }
 @Test public void singleNoisySampleAndRestingEndpointsNeverAcquire(){
  FoldDualPolicy p=new FoldDualPolicy();assertEquals(0,p.update(180,0,false));assertEquals(0,p.update(168,100,false));
  for(int i=0;i<10;i++)assertEquals(0,p.update(178+i%2,120+i*100,false));
  p.reset();assertEquals(0,p.update(2,3000,true));assertEquals(0,p.update(4,4000,true));
 }
}
