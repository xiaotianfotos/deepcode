package com.dsharnessmobile.shell;

/** Fixed front observer at the hinge's vertical midpoint, in screen heights.
 * Reference maths for the AGSL pixel back-projection; not viewer tracking.
 * Inner x>=.5 stays on the stationary plane. A cover past edge-on remains
 * edge-on in the preview, since its front face is no longer observer-facing.
 */
final class FoldPerspective {
  static float tilt(float angle, boolean inner) {
    float safe=Float.isFinite(angle)?Math.max(0,Math.min(180,angle)):180;
    return (float)Math.toRadians(inner?180-safe:Math.min(90,safe));
  }
  static double[] project(double x,double y,double aspect,float angle,boolean inner) {
    if(inner && x>=.5)return new double[]{x,y};
    double hinge=inner?.5:0,tilt=tilt(angle,inner);
    double eye=2.4*Math.max(aspect*(inner?.5:1),1);
    double scale=eye/(eye-Math.abs(x-hinge)*aspect*Math.sin(tilt));
    return new double[]{hinge+(x-hinge)*Math.cos(tilt)*scale,.5+(y-.5)*scale};
  }
  static double strength(float angle) {
    if(!Float.isFinite(angle))return 0;
    return .18*Math.sin(Math.toRadians(Math.max(0,Math.min(180,angle))));
  }
  static double limit(double v,double bound){return Math.max(-bound,Math.min(bound,v));}
  static double[] sample(double x,double y,double aspect,float angle,boolean inner){
    double[] projected=project(x,y,aspect,angle,inner);
    double amount=strength(angle),span=inner?.5:1;
    return new double[]{x+limit((projected[0]-x)*amount,.045*span),y+limit((projected[1]-y)*amount,.02)};
  }
}
