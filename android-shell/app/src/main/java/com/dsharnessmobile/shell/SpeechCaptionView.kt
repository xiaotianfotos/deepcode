package com.dsharnessmobile.shell

import android.animation.ValueAnimator
import android.content.Context
import android.view.View
import android.view.animation.DecelerateInterpolator
import android.widget.FrameLayout
import android.widget.ScrollView
import android.widget.TextView

/** Stable text width while the same surface expands below it. */
internal class SpeechCaptionView(context:Context):FrameLayout(context){
 private val dp=resources.displayMetrics.density
 internal val surface=ReplySurfaceView(context)
 private val inset=(20*dp).toInt()
 private val body=TextView(context).apply{textSize=15f;setTextColor(0xFFF5F5F7.toInt());setLineSpacing(3*dp,1f);includeFontPadding=false;setPadding((22*dp).toInt(),0,(22*dp).toInt(),0)}
 private val viewport=object:ScrollView(context){
  override fun onMeasure(w:Int,h:Int){super.onMeasure(w,MeasureSpec.makeMeasureSpec(body.lineHeight*3+body.compoundPaddingTop+body.compoundPaddingBottom,MeasureSpec.AT_MOST))}
 }.apply{isVerticalScrollBarEnabled=false;overScrollMode=View.OVER_SCROLL_NEVER;isFocusable=false;isClickable=false;addView(body)}
 private var expansion=0f
 private var animator:ValueAnimator?=null
 private var hasReply=false
 internal var textLength=0;private set
 internal var busy=false;private set
 private val follow=Runnable{viewport.scrollTo(0,(body.height-viewport.height).coerceAtLeast(0))}
 init{
  addView(surface,LayoutParams(-1,-1));addView(viewport,LayoutParams(-1,-2).apply{topMargin=inset;bottomMargin=inset})
  viewport.setOnTouchListener{_,event->onTouchEvent(event)}
  body.addOnLayoutChangeListener{_,_,_,_,_,_,_,_,_->followLatest()}
  viewport.addOnLayoutChangeListener{_,_,_,_,_,_,_,_,_->followLatest()}
 }
 override fun onMeasure(w:Int,h:Int){
  val width=MeasureSpec.getSize(w)
  viewport.measure(MeasureSpec.makeMeasureSpec(width,MeasureSpec.EXACTLY),h)
  val closed=54*dp;val opened=maxOf(76*dp,viewport.measuredHeight.toFloat()+2*inset)
  val height=(closed+(opened-closed)*expansion).toInt()
  setMeasuredDimension(width,height)
  surface.measure(MeasureSpec.makeMeasureSpec(width,MeasureSpec.EXACTLY),MeasureSpec.makeMeasureSpec(height,MeasureSpec.EXACTLY))
 }
 private fun followLatest(){removeCallbacks(follow);post(follow)}
 private fun progress(value:Float){expansion=value;viewport.alpha=((value-.25f)/.75f).coerceIn(0f,1f);surface.state(busy,value);requestLayout()}
 fun show(value:String,working:Boolean=false){
  val text=value.trim();val expanded=text.isNotEmpty()
  if(body.text.toString()==text&&busy==working)return
  busy=working;textLength=text.length
  if(body.text.toString()!=text){body.text=text;followLatest()}
  if(expanded!=hasReply){
   hasReply=expanded;animator?.cancel()
   val end=if(expanded)1f else 0f
   if(isAttachedToWindow&&DsUi.animationsEnabled(context)){
    animator=ValueAnimator.ofFloat(expansion,end).apply{duration=360;interpolator=DecelerateInterpolator(1.5f);addUpdateListener{progress(it.animatedValue as Float)};start()}
   }else progress(end)
  }
  surface.state(busy,expansion)
  contentDescription=if(expanded)"Agent 回复，点按查看对话记录" else "Agent 正在思考，点按查看对话记录"
 }
 override fun onDetachedFromWindow(){removeCallbacks(follow);animator?.cancel();surface.stop();super.onDetachedFromWindow()}
}
