package com.dsharnessmobile.shell

import android.content.Context
import android.graphics.*
import android.view.View

/** Small, density-independent outline icons; no font-glyph fallback. */
internal class CompanionButton(context:Context,var symbol:String):View(context){
 var active=false;set(value){field=value;invalidate()}
 private var motion=""
 private var targets=FloatArray(5)
 private var levels=FloatArray(5)
 fun feedback(phase:String,bars:FloatArray=FloatArray(5)){
  motion=phase;targets=bars.copyOf(5);invalidate()
 }
 private val paint=Paint(Paint.ANTI_ALIAS_FLAG)
 init {isClickable=true;isFocusable=true}
 override fun onDraw(c:Canvas){
  super.onDraw(c);val d=resources.displayMetrics.density
  if(active){paint.style=Paint.Style.FILL;paint.color=0xFF4D6BFE.toInt();c.drawCircle(width/2f,height/2f,20*d,paint)}
  c.save();c.translate(width/2f-12*d,height/2f-12*d);c.scale(d,d)
  paint.color=if(active)Color.WHITE else 0xFF263447.toInt();paint.strokeWidth=1.8f;paint.style=Paint.Style.STROKE;paint.strokeCap=Paint.Cap.ROUND;paint.strokeJoin=Paint.Join.ROUND
  val spinning=motion in listOf("preparing","transcribing","sending","working")
  if(spinning){
   paint.color=0xFF4D6BFE.toInt();paint.strokeWidth=1.6f
   val angle=(android.os.SystemClock.uptimeMillis()%1200)*.3f
   c.drawArc(-8f,-8f,32f,32f,angle,85f,false,paint)
   paint.color=if(active)Color.WHITE else 0xFF263447.toInt();paint.strokeWidth=1.8f
  }
  fun path(vararg xy:Float){val p=Path();p.moveTo(xy[0],xy[1]);for(i in 2 until xy.size step 2)p.lineTo(xy[i],xy[i+1]);c.drawPath(p,paint)}
  when(symbol){
   "edit"->{path(9f,5f,5f,5f,4f,6f,4f,19f,5f,20f,18f,20f,19f,19f,19f,15f);path(9f,15f,10f,11f,18f,3f,21f,6f,13f,14f,9f,15f)}
   "microphone"->{c.drawRoundRect(9f,3f,15f,15f,3f,3f,paint);path(5f,11f,5f,12f);c.drawArc(5f,5f,19f,19f,0f,180f,false,paint);path(19f,12f,19f,11f);path(12f,19f,12f,22f);path(8f,22f,16f,22f)}
   "live"->{for(i in 0..4){val h=floatArrayOf(4f,12f,18f,12f,4f)[i];c.drawLine(3f+i*4.5f,12f-h/2,3f+i*4.5f,12f+h/2,paint)}}
   "collapse"->path(6f,9f,12f,15f,18f,9f)
   "send"->{path(6f,10f,12f,4f,18f,10f);path(12f,4f,12f,20f)}
   "stop"->{paint.style=Paint.Style.FILL;c.drawRoundRect(6f,6f,18f,18f,2f,2f,paint)}
   "meter"->{
    paint.strokeWidth=2.6f
    for(i in 0..4){levels[i]+=(targets[i]-levels[i])*.3f;val half=1.4f+levels[i].coerceIn(0f,1f)*8f;val x=4f+i*4f;c.drawLine(x,12-half,x,12+half,paint)}
   }
  }
  c.restore()
  if(isShown&&(symbol=="meter"||spinning))postInvalidateDelayed(33)
 }
}
