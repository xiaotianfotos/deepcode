package com.dsharnessmobile.shell;

/** Fixed front-view orthographic baseline. A unit cover span rotated
 * by the hinge angle projects to cos(theta). This is a calibrated view
 * assumption, not eye tracking or a universal perspective reconstruction. */
final class FoldProjection {
  static final float CLOSED_CLEAR_DEGREES=3f;
  static final float OPEN_CLEAR_DEGREES=175f;
  // A finite focus band straddles the projected edge: newly revealed pixels
  // resolve gradually instead of jumping straight to the unfiltered source.
  static final float INNER_FEATHER_BEFORE=.10f;
  static final float INNER_FEATHER_AFTER=.18f;
  private static float smooth(float start,float end,float value){
    float t=FoldBlurProfile.clamp((value-start)/(end-start));
    return t*t*(3-2*t);
  }
  static float innerStrength(float angle){return 1-smooth(145f,OPEN_CLEAR_DEGREES,angle);}
  static float coverStrength(float angle){return smooth(CLOSED_CLEAR_DEGREES,12f,angle);}
  static float boundary(float angle) {
    double theta=Math.toRadians(Math.max(0,Math.min(180,angle)));
    return Math.max(0f,(float)Math.cos(theta));
  }
  static float leftClearMask(float x,float boundary,float feather) {
    if(boundary>=1)return 1;
    float span=Math.max(.0001f,Math.min(feather,1-boundary));
    float t=FoldBlurProfile.clamp((x-boundary)/span);
    return 1-t*t*(3-2*t);
  }
  static float rightBlurMask(float x,float boundary,float feather) { return 1-leftClearMask(x,boundary,feather); }
  /** Project the moving edge onto the unfolded canvas, hinge at x=0.5.
   * A front orthographic view sees the revealed region to its right. Unlike
   * the cover span, this signed cosine continues across the hinge after 90°. */
  static float innerBoundary(float angle){
    double theta=Math.toRadians(Math.max(0,Math.min(180,angle)));
    return .5f+.5f*(float)Math.cos(theta);
  }
  static float movingHalfBlurMask(float x,float angle){
    float edge=innerBoundary(angle);
    return innerStrength(angle)*(1-smooth(edge-INNER_FEATHER_BEFORE,edge+INNER_FEATHER_AFTER,x));
  }
}
