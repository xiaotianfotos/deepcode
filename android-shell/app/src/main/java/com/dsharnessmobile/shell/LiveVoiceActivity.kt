package com.dsharnessmobile.shell

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.*
import android.provider.Settings
import android.widget.*

/** Session details; permission requests continue only the explicit input-icon gesture. */
class LiveVoiceActivity:Activity(){
  private val main=Handler(Looper.getMainLooper())
  private lateinit var identity:TextView
  private lateinit var status:TextView
  private lateinit var start:Button
  private lateinit var mute:Button
  private var target=""
  private var autoStart=false
  private var requesting=false
  private var overlayRequested=false
  override fun onCreate(savedInstanceState:Bundle?){
    super.onCreate(savedInstanceState);target=intent.getStringExtra("sessionId").orEmpty()
    autoStart= savedInstanceState?.getBoolean("autoStart") ?: intent.getBooleanExtra("requestStart",false)
    val layout=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(48,48,48,48)}
    fun text(value:String,size:Float=18f)=TextView(this).apply{text=value;textSize=size;setPadding(0,18,0,18);layout.addView(this)}
    fun button(value:String,action:()->Unit)=Button(this).apply{text=value;isAllCaps=false;setOnClickListener{action()};layout.addView(this)}
    text("GPT Live",32f)
    text("与当前 Codex 会话实时对话。开启后，麦克风声音会持续发送给 GPT Live，回答通过扬声器播放。可以返回桌面或切换 App，悬浮图标和通知会显示语音状态。")
    text("请使用耳机或保持适当音量。静音暂停发送声音；结束会关闭语音并请求停止这次语音启动的任务。")
    identity=text("DeepCode 会话：$target",14f).apply{setTextIsSelectable(true)}
    status=text("")
    start=button("开启 GPT Live"){autoStart=true;startFlow()}
    mute=button("静音 / 继续收音"){if(LiveVoiceService.instance!=null)startService(Intent(this,LiveVoiceService::class.java).setAction(LiveVoiceService.MUTE))}
    button("结束语音和当前任务"){stopService(Intent(this,LiveVoiceService::class.java))}
    button("返回桌面，继续对话"){startActivity(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME))}
    button("返回 DeepCode"){startActivity(Intent(this,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT));finish()}
    setContentView(ScrollView(this).apply{addView(layout)})
  }
  private val tick=object:Runnable{override fun run(){
    val s=LiveVoiceService.state;val message=s.optString("audioMessage",if(s.optBoolean("muted"))"GPT Live 已静音" else s.optString("message"))+"\n"+s.optString("adbMessage", "开启时检查本机 ADB 连接")
    if(status.text.toString()!=message)status.text=message
    if(s.optString("sessionId")==target || LiveVoiceService.instance!=null){val label="关联会话：${s.optString("sessionTitle",target)}\nDeepCode session：${s.optString("sessionId",target)}\nCodex 语音 thread：${s.optString("codexThreadId","连接后显示")}\nLive 连接 ID：${s.optString("realtimeSessionId","连接后显示")}\n当前模式：语音绑定此聊天的 Codex thread"
      if(identity.text.toString()!=label)identity.text=label
    }
    start.isEnabled=LiveVoiceService.instance==null&&target.isNotBlank();mute.isEnabled=LiveVoiceService.instance!=null
    main.postDelayed(this,400)
  }}
  private fun startFlow(){
    if(requesting||!autoStart||isFinishing)return
    when {
      checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED->{requesting=true;requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO),430)}
      Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED->{requesting=true;requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS),431)}
      !Settings.canDrawOverlays(this)->{
        if(overlayRequested){autoStart=false;status.text="需要允许悬浮标识，才能提示后台语音状态";return}
        overlayRequested=true;startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,Uri.parse("package:$packageName")))
      }
      else->{
        autoStart=false
        startForegroundService(Intent(this,LiveVoiceService::class.java).setAction(LiveVoiceService.START).putExtra("sessionId",target))
        if(intent.getBooleanExtra("desktopOrigin",false))startActivity(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME))
        finish()
      }
    }
  }
  override fun onRequestPermissionsResult(code:Int, permissions:Array<out String>, results:IntArray){
    super.onRequestPermissionsResult(code,permissions,results);requesting=false
    if(results.isNotEmpty()&&results.all{it==PackageManager.PERMISSION_GRANTED})startFlow()
    else {autoStart=false;Toast.makeText(this,"未授予语音所需权限，尚未开始收音",Toast.LENGTH_LONG).show();finish()}
  }
  override fun onSaveInstanceState(outState:Bundle){outState.putBoolean("autoStart",autoStart);super.onSaveInstanceState(outState)}
  override fun onResume(){super.onResume();main.post(tick);main.postDelayed({startFlow()},200)}
  override fun onPause(){main.removeCallbacksAndMessages(null);super.onPause()}
}
