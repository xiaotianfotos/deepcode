package com.dsharnessmobile.shell

import android.app.Activity
import android.app.KeyguardManager
import android.app.Presentation
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Rect
import android.graphics.Matrix
import android.hardware.display.DisplayManager
import android.os.Handler
import android.os.Looper
import android.view.WindowManager
import android.view.PixelCopy
import android.webkit.WebView
import android.widget.ImageView
import android.widget.FrameLayout
import android.view.View
import android.view.ViewGroup
import android.view.KeyEvent

/** Read-only cover renderer. A hardware recording supplies the same WebView
 * before its window effect, letting both screens blur independently. PixelCopy
 * is a fallback while the primary filter is disabled; no second editor.
 * Crops from the left at a common height, matching a cover over the left panel.
 */
class FoldMirror(private val activity:Activity,private val web:WebView) {
  private val handler=Handler(Looper.getMainLooper())
  private var epoch=0
  private var running=false
  private var copying=false
  var frozen=false;private set
  private var presentation:Presentation?=null
  private var image:ImageView?=null
  private var targetInner=false
  private var hostParent:ViewGroup?=null
  private var hostParams:ViewGroup.LayoutParams?=null
  private var hostIndex=0
  private var hostBackdrop:ImageView?=null
  private var hostGeneration=0
  var hosting=false;private set
  var hostReady=true;private set
  private var lastFrame:Bitmap?=null
  private var coverInsetPx=0f
  var innerRotationDegrees=270
  private var buffers:Array<Bitmap>?=null
  private var index=0
  private val gradient=FoldGradientBlur(activity.resources.displayMetrics.density)
  private var clearFrame:FoldClearFrame?=null
  private var clearFrameFailed=false
  var clearSourceReady=false;private set
  var blurAmount=0f
  var projectionAngle:Float?=null
  var captureMs=0L;private set
  var frames=0;private set
  var error:String?=null;private set
  val showing get()=presentation?.isShowing==true
  private val next=Runnable { capture() }
  fun start() { if(running || hosting || !hostReady)return;frozen=false;running=true;frames=0;error=null;refreshInset {handler.post(next)} }
  private fun refreshInset(ready:()->Unit={}){
    val id=epoch
    web.evaluateJavascript("(()=>{const f=window.__dshNavigationInset;return typeof f==='function'?f(innerWidth)*devicePixelRatio:0})()") {value->
      if(id!=epoch || !running)return@evaluateJavascript
      coverInsetPx=value.toFloatOrNull()?.takeIf {it.isFinite()}?.coerceIn(0f,web.width*.5f)?:0f
      ready()
    }
  }
  private fun capture() {
    if(!running||copying)return
    if((activity.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager).isKeyguardLocked){close();return}
    try {
      val display=(activity.getSystemService(Context.DISPLAY_SERVICE) as DisplayManager).displays
        .firstOrNull { it.displayId != web.display?.displayId && it.state==android.view.Display.STATE_ON }
      if(display==null){handler.postDelayed(next,80);return}
      if(presentation==null){
        val p=object:Presentation(activity,display){
          override fun dispatchKeyEvent(event:KeyEvent):Boolean {
            if(hosting && activity.dispatchKeyEvent(event))return true
            return super.dispatchKeyEvent(event)
          }
        }
        image=ImageView(p.context).apply { scaleType=ImageView.ScaleType.MATRIX;setBackgroundColor(android.graphics.Color.BLACK) }
        targetInner=minOf(display.mode.physicalWidth,display.mode.physicalHeight)==1672
        val container=FrameLayout(p.context)
        container.addView(image!!,FrameLayout.LayoutParams(-1,-1))
        container.addOnLayoutChangeListener {_,_,_,_,_,_,_,_,_->
          val turn=if(targetInner)(innerRotationDegrees-display.rotation*90+360)%360 else 0
          val swap=turn==90 || turn==270
          image?.let {view->
            val w=if(swap)container.height else container.width
            val h=if(swap)container.width else container.height
            if(view.layoutParams.width!=w || view.layoutParams.height!=h)view.layoutParams=FrameLayout.LayoutParams(w,h)
            // Preserve the last real inner-screen direction instead of forcing
            // every device posture into the same clockwise quarter turn.
            view.pivotX=0f;view.pivotY=0f;view.rotation=turn.toFloat()
            view.translationX=if(turn==90 || turn==180)container.width.toFloat() else 0f
            view.translationY=if(turn==180 || turn==270)container.height.toFloat() else 0f
          }
        }
        p.setContentView(container)
        container.setOnApplyWindowInsetsListener { _,insets ->
          if(hosting && android.os.Build.VERSION.SDK_INT>=30){
            val system=insets.getInsets(android.view.WindowInsets.Type.systemBars()).bottom
            val gestures=insets.getInsets(android.view.WindowInsets.Type.mandatorySystemGestures()).bottom
            val ime=insets.getInsets(android.view.WindowInsets.Type.ime()).bottom
            (activity as? MainActivity)?.setFoldWindowInsets(maxOf(system,gestures),ime,p.context.resources.displayMetrics.density)
          }
          insets
        }
        p.window?.addFlags(WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        p.window?.setWindowAnimations(0)
        p.show()
        p.setOnDismissListener { if(presentation===p){presentation=null;image=null} }
        p.window?.let { window ->
          window.setBackgroundDrawableResource(android.R.color.black)
          window.statusBarColor=android.graphics.Color.BLACK
          window.navigationBarColor=android.graphics.Color.BLACK
          window.navigationBarDividerColor=android.graphics.Color.BLACK
          if(android.os.Build.VERSION.SDK_INT>=30){
            window.setDecorFitsSystemWindows(false)
            window.insetsController?.hide(android.view.WindowInsets.Type.systemBars())
          }
        }
        presentation=p
      }
      val w=web.width;val h=web.height
      if(w<=0||h<=0){handler.postDelayed(next,80);return}
      if(!clearFrameFailed && android.os.Build.VERSION.SDK_INT>=29){
        val started=android.os.SystemClock.uptimeMillis()
        try {
          val source=clearFrame ?: FoldClearFrame().also {clearFrame=it}
          val frame=source.draw(web)
          if(frame!=null){
            clearSourceReady=true;captureMs=android.os.SystemClock.uptimeMillis()-started
            present(frame,w,h);handler.postDelayed(next,40);return
          }
        }catch(_:Exception){clearFrameFailed=true;clearFrame?.close();clearFrame=null;clearSourceReady=false}
      }
      clearSourceReady=false
      if(buffers?.first()?.let { it.width!=w||it.height!=h }!=false){
        buffers=Array(2){Bitmap.createBitmap(w,h,Bitmap.Config.ARGB_8888)}
      }
      val frame=buffers!![index];index=1-index
      val started=android.os.SystemClock.uptimeMillis()
      val location=IntArray(2);web.getLocationInWindow(location)
      val generation=epoch;copying=true
      PixelCopy.request(activity.window,Rect(location[0],location[1],location[0]+w,location[1]+h),frame,{result ->
        if(generation==epoch){
          copying=false;captureMs=android.os.SystemClock.uptimeMillis()-started
          if(running && result==PixelCopy.SUCCESS){
            present(frame,w,h)
          }else if(result!=PixelCopy.SUCCESS)error="PixelCopy:$result"
          if(gradient.error!=null)error=gradient.error
          if(running)handler.postDelayed(next,40)
        }
      },handler)
    }catch(e:Exception){error=e.javaClass.simpleName;close()}
  }
  private fun present(frame:Bitmap,w:Int,h:Int){
    lastFrame=frame
    if(!targetInner && frames%10==0)refreshInset()
    image?.let { view ->
      view.imageMatrix=Matrix().apply { val scale=view.height.toFloat()/h;setScale(scale,scale);if(!targetInner)postTranslate(-coverInsetPx*scale,0f) }
      view.setImageBitmap(frame)
      projectionAngle?.let { if(targetInner)gradient.applyMovingInnerHalf(view,it) else gradient.applyCoverProjection(view,it) } ?: gradient.apply(view,blurAmount)
      if(gradient.error!=null)error=gradient.error
      view.invalidate();frames++
    }
  }
  /** Keep both physical windows alive; move the one live editor at endpoints.
   * The already painted ImageView remains underneath until Chromium confirms
   * the resized document is drawable. Never reloads or duplicates the page. */
  fun hostOnCover():Boolean {
    if(hosting)return true
    if(!hostReady || targetInner || !showing || image?.width==0)return false
    val parent=web.parent as? ViewGroup ?: return false
    val container=image?.parent as? FrameLayout ?: return false
    val frame=lastFrame ?: return false
    hostParent=parent;hostParams=web.layoutParams;hostIndex=parent.indexOfChild(web)
    hostBackdrop=ImageView(activity).apply {
      scaleType=ImageView.ScaleType.FIT_XY
      setImageBitmap(frame)
      setBackgroundColor(android.graphics.Color.BLACK)
    }.also { parent.addView(it,hostIndex,ViewGroup.LayoutParams(web.width,web.height)) }
    running=false;epoch++;copying=false;handler.removeCallbacks(next)
    hosting=true;hostReady=false;web.setRenderEffect(null);web.alpha=0f
    parent.removeView(web);container.addView(web,FrameLayout.LayoutParams(-1,-1))
    presentation?.window?.apply {
      clearFlags(WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE)
      setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING)
    }
    web.requestApplyInsets();waitForHostFrame()
    return true
  }
  fun hostOnInner(){
    if(!hosting)return
    val parent=hostParent ?: return
    hosting=false;hostReady=false;web.setRenderEffect(null);web.alpha=0f
    (web.parent as? ViewGroup)?.removeView(web)
    parent.addView(web,hostIndex.coerceAtMost(parent.childCount),hostParams)
    presentation?.window?.addFlags(WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE)
    parent.requestApplyInsets();waitForHostFrame()
  }
  private fun waitForHostFrame(){
    val id=++hostGeneration
    // A fixed delay can commit the resized viewport before Deck's right lane.
    // Wait for destination dimensions AND its React/scroll ownership, then ask
    // Chromium to commit those pixels. Keep the previous mirror underneath.
    fun reveal(){
      if(id!=hostGeneration)return
      web.alpha=1f;hostReady=true
      if(!hosting){hostBackdrop?.let {(it.parent as? ViewGroup)?.removeView(it)};hostBackdrop=null;hostParent=null;hostParams=null;start()}
    }
    fun checkLayout(){
      if(id!=hostGeneration || hostReady)return
      val width=web.width
      web.evaluateJavascript("(()=>{if(Math.abs(innerWidth*devicePixelRatio-$width)>3)return false;const f=window.__dshFoldDeckReady;return typeof f!=='function'||f($hosting)===true})()") {ready->
        if(id!=hostGeneration || hostReady)return@evaluateJavascript
        if(ready=="true")web.postVisualStateCallback(id.toLong(),object:WebView.VisualStateCallback(){
          override fun onComplete(requestId:Long){reveal()}
        }) else handler.postDelayed({checkLayout()},16)
      }
    }
    // Let the new parent assign native bounds before comparing CSS dimensions.
    handler.postDelayed({checkLayout()},32)
    handler.postDelayed({if(id==hostGeneration && !hostReady){error="host-frame-timeout";reveal()}},1500)
  }
  private fun restoreHost(){
    hostGeneration++
    hostParent?.let { parent ->
      if(web.parent!==parent){(web.parent as? ViewGroup)?.removeView(web);parent.addView(web,hostIndex.coerceAtMost(parent.childCount),hostParams)}
    }
    hostBackdrop?.let {(it.parent as? ViewGroup)?.removeView(it)}
    hostParent=null;hostParams=null;hostBackdrop=null;hosting=false;hostReady=true;web.alpha=1f
  }
  /** Stop sampling before the primary display changes dimensions. Keep only
   * the last stable image until the system removes the secondary display. */
  fun freezeForHandoff(){
    frozen=true;running=false;epoch++;copying=false;handler.removeCallbacks(next)
    if((projectionAngle?:180f)<=3f)image?.let {gradient.applyCoverProjection(it,0f);it.invalidate()}
  }
  fun close(){restoreHost();lastFrame=null;frozen=false;running=false;epoch++;copying=false;handler.removeCallbacks(next);image?.setImageDrawable(null);image=null;presentation?.dismiss();presentation=null;buffers=null;clearFrame?.close();clearFrame=null;clearSourceReady=false;clearFrameFailed=false}
}
