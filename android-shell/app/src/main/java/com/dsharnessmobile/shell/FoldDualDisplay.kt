package com.dsharnessmobile.shell

import android.app.KeyguardManager
import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.Process
import android.os.SystemClock
import android.webkit.WebView
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.Executors

/** One foreground state-5 lease, never reapplied/released at a hinge boundary.
 * The physical panels keep their identity. Only the live WebView changes host
 * window at endpoints; its previous pixels bridge the compositor handshake. */
class FoldDualDisplay(private val activity:MainActivity,private val web:WebView,private val changed:()->Unit){
  private val handler=Handler(Looper.getMainLooper())
  private val worker=Executors.newSingleThreadExecutor()
  private val mirror=FoldMirror(activity,web)
  private val keyguard=activity.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
  private var enabled=false
  private var foreground=false
  private var disposed=false
  private var angle=-1f
  private var desired=0
  private var leased=0
  private var token:String?=null
  private var working=false
  private var lastHeartbeat=0L
  private var retryAt=0L
  private var error:String?=null
  private var previousOrientation:Int?=null
  private var endpointAt=0L
  private var previewHostUntil=0L
  private var previewCover=false
  private var innerOrientation=android.content.res.Configuration.ORIENTATION_LANDSCAPE
  val supported get()=Build.DEVICE=="lhasa"
  val active get()=leased==5 && mirror.showing && foreground && !keyguard.isKeyguardLocked
  val clearSourceReady get()=mirror.clearSourceReady && mirror.hostReady
  val primaryCover get()=mirror.hosting
  val handingOff get()=leased!=0 && desired==0
  private val tick=object:Runnable {override fun run(){
    if(disposed)return
    val now=SystemClock.uptimeMillis()
    desired=if(enabled && foreground && supported && !keyguard.isKeyguardLocked && AdbState.authorized(activity))5 else 0
    if(leased==5 && desired==5){
      updateOrientation()
      mirror.projectionAngle=angle.takeIf {it>=0}
      mirror.blurAmount=FoldBlurProfile.outerAmountForAngle(angle)
      if(BuildConfig.DEBUG && now<previewHostUntil){
        if(previewCover)mirror.hostOnCover() else mirror.hostOnInner()
      }else if(angle in 0f..3f){
        if(endpointAt==0L)endpointAt=now
        if(now-endpointAt>=150)mirror.hostOnCover()
      }else{
        endpointAt=0L
        if(angle>=10f && mirror.hosting)mirror.hostOnInner()
      }
      if(!mirror.hosting && mirror.hostReady)mirror.start()
    }
    reconcile(now);changed()
    if(enabled && foreground || leased!=0 || working)handler.postDelayed(this,100)
  }}
  fun previewHost(cover:Boolean){if(BuildConfig.DEBUG){previewCover=cover;previewHostUntil=SystemClock.uptimeMillis()+15000;wake()}}
  fun configure(value:Boolean){enabled=value;wake()}
  fun foreground(value:Boolean){foreground=value;wake()}
  fun angle(value:Float){angle=value;wake()}
  private fun wake(){if(disposed)return;handler.removeCallbacks(tick);handler.post(tick)}
  private fun execute(command:String):String{
    val r=JSONObject(AdbState.adbShellExecute(activity,activity.engineManager,command))
    return if(r.optBoolean("ok"))r.optString("stdout") else ""
  }
  private fun reconcile(now:Long){
    if(working)return
    if(leased!=0 && desired!=leased){
      mirror.close();restoreOrientation()
      val old=token!!;working=true
      worker.execute{
        runCatching{execute(FoldDualCommands.release(Process.myUid(),old))}
        handler.post{leased=0;token=null;working=false;changed();if(disposed)worker.shutdown() else wake()}
      };return
    }
    if(desired==5 && leased==0 && now>=retryAt){
      val next=UUID.randomUUID().toString().replace("-","");working=true
      worker.execute{
        val granted=runCatching{execute(FoldDualCommands.acquire(5,Process.myUid(),Process.myPid(),next)).contains("DSH_FOLD_GRANTED")}.getOrDefault(false)
        handler.post{
          working=false
          if(granted){
            leased=5;token=next;lastHeartbeat=SystemClock.uptimeMillis();error=null
            if(!disposed && foreground && desired==5){
              updateOrientation()
              mirror.start()
            }
          }else{error="dual-request-unavailable";retryAt=SystemClock.uptimeMillis()+5000}
          changed();if(disposed){desired=0;reconcile(SystemClock.uptimeMillis());if(!working)worker.shutdown()}else wake()
        }
      };return
    }
    if(leased!=0 && now-lastHeartbeat>=3000){
      working=true;val own=token!!
      worker.execute{
        val alive=runCatching{execute(FoldDualCommands.heartbeat(Process.myUid(),own)).contains("DSH_FOLD_ALIVE")}.getOrDefault(false)
        handler.post{
          working=false;lastHeartbeat=SystemClock.uptimeMillis()
          if(!alive){error="dual-lease-lost";desired=0;mirror.close();retryAt=lastHeartbeat+15000;reconcile(lastHeartbeat)}
          changed();if(disposed){desired=0;reconcile(lastHeartbeat)}else wake()
        }
      }
    }
  }
  fun status():JSONObject=JSONObject().put("supported",supported).put("authorized",AdbState.authorized(activity))
    .put("mode","stable-presentation").put("desiredState",desired).put("leasedState",leased).put("working",working)
    .put("active",active).put("mirrorFrozen",mirror.frozen).put("mirrorShowing",mirror.showing)
    .put("mirrorFrames",mirror.frames).put("mirrorError",mirror.error?:JSONObject.NULL).put("error",error?:JSONObject.NULL)
    .put("outerBlurAmount",mirror.blurAmount).put("captureMs",mirror.captureMs).put("primaryCover",primaryCover)
    .put("sharedCanvas",false).put("coverContentOffsetPx",0).put("innerRotationDegrees",mirror.innerRotationDegrees)
    .put("innerOrientation",innerOrientation).put("projectionBoundary",FoldProjection.boundary(angle)).put("clearSourceReady",clearSourceReady)
    .put("hostReady",mirror.hostReady)
  private fun restoreOrientation(){previousOrientation?.let{activity.requestedOrientation=it};previousOrientation=null}
  private fun updateOrientation(){
    // Freeze only the moving hinge. A foreground-long LOCKED request disabled
    // ordinary portrait/landscape rotation even with the device fully open.
    if(angle>=175f){
      restoreOrientation()
      innerOrientation=activity.resources.configuration.orientation
      mirror.innerRotationDegrees=(activity.windowManager.defaultDisplay.rotation*90)
    }else if(angle>=0f && angle<170f && previousOrientation==null){
      previousOrientation=activity.requestedOrientation
      innerOrientation=activity.resources.configuration.orientation
      mirror.innerRotationDegrees=(activity.windowManager.defaultDisplay.rotation*90)
      activity.requestedOrientation=android.content.pm.ActivityInfo.SCREEN_ORIENTATION_LOCKED
    }
  }
  fun close(){disposed=true;enabled=false;foreground=false;desired=0;mirror.close();restoreOrientation();handler.removeCallbacks(tick)
    if(!working){reconcile(SystemClock.uptimeMillis());if(!working)worker.shutdown()}}
}
