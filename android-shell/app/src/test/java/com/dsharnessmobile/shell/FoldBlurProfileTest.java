package com.dsharnessmobile.shell;
import org.junit.Test;
import static org.junit.Assert.*;

public class FoldBlurProfileTest {
  @Test public void sameFrameHasMonotonicSpatialSigmaAndClearRightEdge() {
    for (float amount : new float[]{.2f,.5f,1f}) {
      float previous=Float.MAX_VALUE;
      for (int x=0;x<=100;x++) {
        float sigma=FoldBlurProfile.sigma(x/100f,amount,30f);
        assertTrue(sigma>=0 && sigma<=previous); previous=sigma;
      }
      assertTrue(FoldBlurProfile.sigma(0,amount,30)>0);
      assertEquals(0,FoldBlurProfile.sigma(.99f,amount,30),0);
    }
  }
  @Test public void openScreenIsClearAndPartialFoldIsIndependentOfMotionHistory() {
    assertEquals(0,FoldBlurProfile.amountForAngle(180),0);
    assertEquals(0,FoldBlurProfile.amountForAngle(170),0);
    assertEquals(1,FoldBlurProfile.amountForAngle(0),0);
    assertTrue(FoldBlurProfile.amountForAngle(90)>FoldBlurProfile.amountForAngle(140));
    assertEquals(0,FoldBlurProfile.sigma(0,0,30),0);
  }
  @Test public void coverBecomesClearerAsHingeClosesWhileInnerDoesTheOpposite() {
    float outer=1f,inner=0f;
    for(int angle=180;angle>=0;angle--){
      float nextOuter=FoldBlurProfile.outerAmountForAngle(angle),nextInner=FoldBlurProfile.amountForAngle(angle);
      assertTrue(nextOuter<=outer);assertTrue(nextInner>=inner);outer=nextOuter;inner=nextInner;
    }
    assertEquals(0,outer,0);assertEquals(1,inner,0);
  }
}
