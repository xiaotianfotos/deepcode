package com.dsharnessmobile.shell;

/** Hysteresis for a transient dual-display lease, independent of motion speed. */
final class FoldDualPolicy {
  private int desired;
  private long candidateAt=-1, endAt=-1;
  int update(float angle,long now,boolean outerPrimary) {
    if(!Float.isFinite(angle)||angle<0||angle>180)return desired;
    if(desired==0){
      if(angle>=8 && angle<=170){
        if(candidateAt<0)candidateAt=now;
        // Enable logical display 1 without requesting a different device state.
        if(now-candidateAt>=100){desired=1;candidateAt=-1;}
      }else candidateAt=-1;
    }else{
      if(angle<=3 || angle>=177){
        if(endAt<0)endAt=now;
        if(now-endAt>=250){desired=0;endAt=-1;}
      }else endAt=-1;
    }
    return desired;
  }
  void reset(){desired=0;candidateAt=endAt=-1;}
}
