package com.dsharnessmobile.shell

import android.app.Service
import android.app.RemoteInput
import android.app.NotificationManager
import android.content.Intent
import android.os.IBinder
import org.json.JSONObject

/** User notification reply keeps Android's pairing dialog open during local SPAKE2. */
class FoldPairingService:Service() {
  private var busy=false
  override fun onBind(intent:Intent?):IBinder?=null
  override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int {
    FoldSetup.channel(this)
    startForeground(FoldSetup.NOTIFICATION,FoldSetup.notification(this,"正在本地配对","请保持无线调试的配对码弹窗打开。",false))
    if(busy)return START_NOT_STICKY
    busy=true
    val code=RemoteInput.getResultsFromIntent(intent?:Intent())?.getCharSequence(FoldSetup.CODE)?.toString()?.trim().orEmpty()
    Thread {
      val result=try {
        require(AdbState.allowSwitch(this) && AdbState.fullAccess()) { "请先在 DeepCode 内允许调试通道" }
        require(code.matches(Regex("\\d{6}"))) { "请输入六位配对码" }
        val engine=EngineManager(this,EngineManager.ensurePickToken())
        val ports=JSONObject(AdbState.discoverPorts(this,engine))
        val pair=ports.optInt("pair",0);val connect=ports.optInt("connect",0)
        require(pair in 1..65535 && connect in 1..65535){"没有找到本机配对端口，请保持配对码弹窗打开后重试"}
        AdbState.pairWithCodeJson(this,engine,code,pair,connect)
      }catch(e:Exception){JSONObject().put("ok",false).put("message",e.message?:"本地配对失败").toString()}
      val status=JSONObject(result);val ok=status.optBoolean("ok")
      getSharedPreferences("fold-setup",MODE_PRIVATE).edit().putString("pair-result",result).apply()
      android.os.Handler(mainLooper).post {
        stopForeground(STOP_FOREGROUND_REMOVE)
        getSystemService(NotificationManager::class.java).notify(FoldSetup.NOTIFICATION,FoldSetup.notification(this,
          if(ok) "DeepCode 配对完成" else "DeepCode 配对未完成",
          if(ok) "点击返回应用，继续验证双屏过渡。" else status.optString("message","请重试"),!ok))
        busy=false;stopSelf()
      }
    }.start()
    return START_NOT_STICKY
  }
}
