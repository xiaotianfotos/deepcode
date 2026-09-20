package com.dsharnessmobile.shell

import android.view.View
import android.webkit.WebView
import kotlin.math.roundToInt

/** Retain one wide live canvas while the cover is primary. Its window crops
 * from the conversation origin; the inner receives the unchanged full frame.
 * No second WebView, editor, navigation or engine is created. */
class FoldSharedCanvas(private val web:WebView) {
  private var originalWidth:Int?=null
  private var originalTranslation=0f
  private var generation=0
  private var pending=false
  private val layout=View.OnLayoutChangeListener {_,_,_,_,_,_,_,_,_->refresh()}
  val active get()=originalWidth!=null
  val ready get()=active && web.height>0 && web.width==(web.height*2364f/1672f).roundToInt()
  fun start(){if(active)return;originalWidth=web.layoutParams.width;originalTranslation=web.translationX;generation++;web.addOnLayoutChangeListener(layout);refresh()}
  fun refresh(){
    if(!active || pending || web.height<=0)return
    val width=(web.height*2364f/1672f).roundToInt()
    val id=generation
    pending=true
    // Ask the layout plugin for the planned canvas's sidebar width before
    // changing native geometry. No mobile override reaches the shared DOM.
    web.evaluateJavascript("(()=>{const f=window.__dshNavigationInset;return typeof f==='function'?f($width/devicePixelRatio)*devicePixelRatio:0})()") { result ->
      if(id!=generation || !active)return@evaluateJavascript
      pending=false
      val maxOffset=(width-((web.parent as? View)?.width?:width)).coerceAtLeast(0).toFloat()
      val offset=result.toFloatOrNull()?.takeIf {it.isFinite()}?.coerceIn(0f,maxOffset)?:0f
      web.translationX=-offset
      if(web.layoutParams.width!=width)web.layoutParams=web.layoutParams.apply {this.width=width}
    }
  }
  fun close(){generation++;pending=false;web.removeOnLayoutChangeListener(layout);originalWidth?.let {width->web.translationX=originalTranslation;web.layoutParams=web.layoutParams.apply {this.width=width}};originalWidth=null}
}
