package com.dsharnessmobile.shell

import android.content.Context
import android.graphics.*
import android.os.Build
import android.os.SystemClock
import android.view.View
import kotlin.math.*

/** One dark translucent surface morphs from a waiting capsule into the reply card. */
internal class ReplySurfaceView(context: Context) : View(context) {
 private val power=context.getSystemService(android.os.PowerManager::class.java)
 private val density=resources.displayMetrics.density
 private val paint=Paint(Paint.ANTI_ALIAS_FLAG)
 private val bounds=RectF()
 private val started=SystemClock.uptimeMillis()
 private var working=false
 private var expansion=0f
 private var scheduled=false
 internal var frames=0L;private set
 internal var shaderActive=false;private set
 private var renderer=if(Build.VERSION.SDK_INT>=33)runCatching{ShaderSurface()}.getOrNull() else null
 private val frame=Runnable{scheduled=false;invalidate()}
 fun state(busy:Boolean,expanded:Float){working=busy;expansion=expanded;invalidate()}
 fun surfaceBounds():RectF {
  val w=min(width.toFloat()-8*density,144*density)+(width-8*density-min(width.toFloat()-8*density,144*density))*expansion
  return RectF((width-w)/2,4*density,(width+w)/2,height-4*density)
 }
 internal fun stop(){removeCallbacks(frame);scheduled=false}
 override fun onDetachedFromWindow(){stop();super.onDetachedFromWindow()}
 override fun onWindowVisibilityChanged(visibility:Int){super.onWindowVisibilityChanged(visibility);if(visibility!=VISIBLE)stop() else invalidate()}
 override fun onDraw(canvas:Canvas){
  super.onDraw(canvas)
  val motion=working&&isShown&&windowVisibility==VISIBLE&&power.isInteractive&&!power.isPowerSaveMode&&DsUi.animationsEnabled(context)
  val time=if(motion)(SystemClock.uptimeMillis()-started)/1000f else 0f
  bounds.set(surfaceBounds());shaderActive=false
  if(renderer!=null&&canvas.isHardwareAccelerated){
   try{renderer!!.draw(canvas,paint,width.toFloat(),height.toFloat(),density,time,expansion,working);shaderActive=true}
   catch(_:RuntimeException){renderer=null;paint.shader=null}
  }
  if(!shaderActive){
   paint.shader=null;paint.color=0xEE101116.toInt();canvas.drawRoundRect(bounds,25*density,25*density,paint)
   paint.style=Paint.Style.STROKE;paint.strokeWidth=density;paint.color=0x448D9AAA;canvas.drawRoundRect(bounds,25*density,25*density,paint);paint.style=Paint.Style.FILL
   if(expansion<1f){
    for(i in 0..4){val a=time*1.5f+i*2f*PI.toFloat()/5;paint.color=Color.argb(((1-expansion)*220).toInt(),225,240,255)
     canvas.drawCircle(bounds.left+26*density+cos(a)*7*density,height/2f+sin(a)*7*density,2.3f*density,paint)}
   }
  }
  frames++
  if(motion&&!scheduled){scheduled=true;postDelayed(frame,33)}else if(!motion)stop()
 }
 @androidx.annotation.RequiresApi(33)
 private class ShaderSurface{
  private val shader=RuntimeShader(SOURCE)
  fun draw(c:Canvas,p:Paint,w:Float,h:Float,d:Float,t:Float,e:Float,busy:Boolean){
   shader.setFloatUniform("size",w,h);shader.setFloatUniform("density",d);shader.setFloatUniform("time",t)
   shader.setFloatUniform("expansion",e);shader.setFloatUniform("busy",if(busy)1f else 0f)
   p.shader=shader;c.drawRect(0f,0f,w,h,p);p.shader=null
  }
 }
 companion object{
  private const val SOURCE="""
   uniform float2 size;
   uniform float density;
   uniform float time;
   uniform float expansion;
   uniform float busy;
   half4 main(float2 p){
    float w=mix(min(size.x-8.0*density,144.0*density),size.x-8.0*density,expansion);
    float h=size.y-8.0*density;
    float radius=min(25.0*density,h*0.5);
    float2 q=abs(p-size*0.5)-float2(w,h)*0.5+radius;
    float dist=(length(max(q,0.0))+min(max(q.x,q.y),0.0)-radius)/density;
    float inside=1.0-smoothstep(-0.6,0.6,dist);
    float y=clamp(p.y/size.y,0.0,1.0);
    float rim=exp(-abs(dist)*1.5);
    float shimmer=0.5+0.5*sin(p.x/size.x*5.0-time*0.7);
    half3 base=mix(half3(0.015,0.019,0.025),half3(0.06,0.07,0.09),y);
    base+=rim*mix(half3(0.18,0.23,0.30),half3(0.40,0.43,0.48),shimmer)*0.5;
    float2 center=float2((size.x-w)*0.5+27.0*density,size.y*0.5);
    float dots=0.0;
    for(int i=0;i<5;i++){
     float a=float(i)*1.256637+time*1.5;
     float2 point=center+float2(cos(a),sin(a))*7.0*density;
     float r=length(p-point)/density;
     dots+=exp(-r*r/5.5)*(0.72+0.28*sin(a-time*0.5));
    }
    base+=half3(0.78,0.88,1.0)*dots*(1.0-smoothstep(0.0,0.55,expansion));
    // Once text arrives, light stays at the edge rather than washing over the letters.
    base+=half3(0.06,0.09,0.13)*rim*busy*expansion*shimmer;
    float alpha=inside*mix(0.98,0.85,y);
    return half4(base*alpha,alpha);
   }
  """
 }
}
