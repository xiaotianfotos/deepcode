package com.dsharnessmobile.shell

import android.app.Activity
import android.app.KeyguardManager
import android.app.Presentation
import android.content.Context
import android.graphics.Color
import android.hardware.display.DisplayManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.widget.TextView
import org.json.JSONArray
import org.json.JSONObject
import java.lang.reflect.InvocationTargetException

/** Bounded debug capability probe. Never changes hidden-API policy or uses ADB/root. */
class FoldDualProbe(private val activity: Activity, private val web: android.webkit.WebView) {
  private val handler = Handler(Looper.getMainLooper())
  private var manager: Any? = null
  private var requested = false
  private var observing = false
  private val mirror=FoldMirror(activity,web)
  private val sharedCanvas=FoldSharedCanvas(web)
  val clearSourceReady get()=mirror.clearSourceReady
  private var presentation: Presentation? = null
  private var error: String? = null
  private var phase = "idle"
  private var frames = 0
  private var standard = JSONObject()
  @Volatile private var report = "{}"
  private val stop = Runnable { close() }
  private val refresh = object: Runnable {
    override fun run() {
      if (!requested && !observing) return
      if(sharedCanvas.active){sharedCanvas.refresh();if(sharedCanvas.ready)mirror.start()}
      try {
        val displays = (activity.getSystemService(Context.DISPLAY_SERVICE) as DisplayManager).displays
        val secondary = displays.firstOrNull { it.displayId != activity.display?.displayId }
        if (!observing && secondary != null && presentation == null) {
          presentation = Presentation(activity,secondary).apply {
            val label=TextView(context).apply { setBackgroundColor(Color.rgb(14,35,58));setTextColor(Color.WHITE);textSize=28f;gravity=17;text="DeepCode 双屏验证\n普通应用 Presentation" }
            setContentView(label);window?.addFlags(android.view.WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE);show()
          }
        }
        frames++;publish()
      } catch (e: Exception) { fail(e) }
      if(requested || observing)handler.postDelayed(this,200)
    }
  }
  fun observe() {
    if(!BuildConfig.DEBUG)return
    if(observing){handler.removeCallbacks(stop);handler.postDelayed(stop,15000);return}
    close();if(web.display?.mode?.let {minOf(it.physicalWidth,it.physicalHeight)==1168}==true)sharedCanvas.start();observing=true;phase="observing";error=null;mirror.projectionAngle=null;if(!sharedCanvas.active)mirror.start();handler.post(refresh);handler.postDelayed(stop,15000)
  }
  fun preview(angle:Float){if(BuildConfig.DEBUG && observing && angle.isFinite() && angle in 0f..180f)mirror.projectionAngle=angle}
  fun start() {
    if(!BuildConfig.DEBUG || Build.DEVICE!="lhasa" || activity.isFinishing ||
      (activity.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager).isKeyguardLocked)return
    close();error=null;phase="requesting";frames=0
    try {
      val provider=Class.forName("androidx.window.extensions.WindowExtensionsProvider")
      val extension=provider.getMethod("getWindowExtensions").invoke(null)
      standard.put("vendorApiLevel",extension.javaClass.getMethod("getVendorApiLevel").invoke(extension))
      val area=extension.javaClass.getMethod("getWindowAreaComponent").invoke(extension)
      if(area==null)standard.put("component",false) else {
        standard.put("component",true)
        val consumerClass=Class.forName("androidx.window.extensions.core.util.function.Consumer")
        val consumer=java.lang.reflect.Proxy.newProxyInstance(consumerClass.classLoader,arrayOf(consumerClass)) { _,method,args ->
          when(method.name) {
            "accept" -> { standard.put("callback",args?.firstOrNull()?.toString());publish();null }
            "hashCode" -> 4321
            "equals" -> false
            else -> "FoldDualProbeConsumer"
          }
        }
        try { area.javaClass.getMethod("startRearDisplayPresentationSession",Activity::class.java,consumerClass).invoke(area,activity,consumer)
          standard.put("startAccepted",true)
          area.javaClass.getMethod("endRearDisplayPresentationSession").invoke(area)
        } catch(e:Exception) { val cause=if(e is InvocationTargetException)e.targetException else e
          standard.put("startError",cause.javaClass.simpleName+": "+cause.message) }
      }
    }catch(e:Exception){standard.put("probeError",e.javaClass.simpleName+": "+e.message)}
    try {
      manager=activity.getSystemService("device_state") ?: error("Device state service unavailable")
      val requestClass=Class.forName("android.hardware.devicestate.DeviceStateRequest")
      val builder=requestClass.getMethod("newBuilder",Int::class.javaPrimitiveType).invoke(null,5)
      val flags=requestClass.getField("FLAG_CANCEL_WHEN_BASE_CHANGES").getInt(null)
      builder.javaClass.getMethod("setFlags",Int::class.javaPrimitiveType).invoke(builder,flags)
      val request=builder.javaClass.getMethod("build").invoke(builder)
      manager!!.javaClass.methods.first { it.name=="requestState" && it.parameterCount==3 }.invoke(manager,request,null,null)
      requested=true;phase="requested";handler.post(refresh);handler.postDelayed(stop,15000)
    } catch (e: Exception) { fail(e) }
    publish()
  }
  private fun fail(e: Exception) {
    val cause=if(e is InvocationTargetException)e.targetException else e
    error=cause.javaClass.simpleName+": "+(cause.message?:"").take(500);phase="error";publish()
  }
  private fun publish() {
    val displays=(activity.getSystemService(Context.DISPLAY_SERVICE) as DisplayManager).displays
    report=JSONObject().put("phase",phase).put("requested",requested).put("presentation",presentation?.isShowing==true)
      .put("standardApi",standard).put("frames",frames).put("error",error?:JSONObject.NULL).put("uid",android.os.Process.myUid()).put("mirrorShowing",mirror.showing).put("mirrorFrames",mirror.frames).put("mirrorError",mirror.error?:JSONObject.NULL)
      .put("clearSourceReady",clearSourceReady).put("captureMs",mirror.captureMs).put("coverContentOffsetPx",-web.translationX)
      .put("displays",JSONArray(displays.map { JSONObject().put("id",it.displayId).put("state",it.state).put("name",it.name) })).toString()
  }
  fun status():String=report
  fun close() {
    observing=false;mirror.close();sharedCanvas.close()
    handler.removeCallbacks(stop);handler.removeCallbacks(refresh)
    presentation?.dismiss();presentation=null
    if(requested)try { manager?.javaClass?.getMethod("cancelStateRequest")?.invoke(manager);requested=false }
    catch(e:Exception){fail(e)}
    if(!requested)phase="idle";publish()
  }
}
