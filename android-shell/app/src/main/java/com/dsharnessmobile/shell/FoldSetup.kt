package com.dsharnessmobile.shell

import android.app.Activity
import android.app.AlertDialog
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.RemoteInput
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings

/** Explicit native consent and pairing entry. No grant is inferred from installation. */
object FoldSetup {
  const val CHANNEL="fold-pairing"
  const val NOTIFICATION=4202
  const val CODE="fold-pair-code"
  fun maybeShow(activity:Activity) {
    if(Build.DEVICE!="lhasa" || AdbState.authorized(activity))return
    val prefs=activity.getSharedPreferences("fold-setup",Context.MODE_PRIVATE)
    if(prefs.getBoolean("shown-v1",false))return
    prefs.edit().putBoolean("shown-v1",true).apply()
    show(activity)
  }
  fun show(activity:Activity) {
    if(activity.isFinishing)return
    val access=AdbState.authorized(activity)
    val state=if(access) "DeepCode 调试通道已就绪。" else "电脑的 ADB 配对不会自动授权 DeepCode，应用需要自己的配对。"
    AlertDialog.Builder(activity).setTitle("双屏过渡需要的授权")
      .setMessage("$state\n\n允许后会开放 DeepCode 现有的 ADB 调试通道，权限范围包括设备操作，不仅限于双屏。配对码仅用于手机本地握手。\n\n合盖继续显示应用，还需在系统合盖设置中选择“保持亮屏”。")
      .setPositiveButton(if(access) "检查状态" else "允许并开始配对") { _,_ ->
        if(access){android.widget.Toast.makeText(activity,"应用内 ADB 已授权",0).show();return@setPositiveButton}
        if(!AdbState.fullAccess()){
          activity.startActivity(Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,Uri.parse("package:"+activity.packageName)))
          return@setPositiveButton
        }
        // A user gesture in this native dialog is the authorization write boundary.
        AdbState.setAllowSwitch(activity,true)
        if(Build.VERSION.SDK_INT>=33 && activity.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED){
          activity.requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS),4202)
          android.widget.Toast.makeText(activity,"请允许通知，以便在系统配对弹窗里完成操作",1).show()
        } else armPairing(activity)
      }
      .setNeutralButton("合盖显示设置") { _,_ -> openFoldSettings(activity) }
      .setNegativeButton("稍后",null).show()
  }
  fun openFoldSettings(activity:Activity){
    try { activity.startActivity(Intent().setClassName("com.android.settings","com.android.settings.SubSettings")
      .putExtra(":settings:show_fragment","com.android.settings.display.CloseLidDisplaySettingFragment")) }
    catch(_:Exception){activity.startActivity(Intent(Settings.ACTION_DISPLAY_SETTINGS))}
  }
  fun armPairing(activity:Activity){
    val nm=activity.getSystemService(NotificationManager::class.java)
    if(!nm.areNotificationsEnabled()){
      activity.startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE,activity.packageName));return
    }
    channel(activity)
    nm.notify(NOTIFICATION,notification(activity,"输入无线调试配对码","打开“无线调试 → 使用配对码配对”，保持弹窗打开，从通知里输入六位码。",true))
    activity.startActivity(Intent(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS))
  }
  fun channel(context:Context){context.getSystemService(NotificationManager::class.java).createNotificationChannel(NotificationChannel(CHANNEL,"双屏调试配对",NotificationManager.IMPORTANCE_HIGH))}
  fun notification(context:Context,title:String,text:String,reply:Boolean):Notification {
    val open=PendingIntent.getActivity(context,4202,Intent(context,MainActivity::class.java),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val builder=Notification.Builder(context,CHANNEL).setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
      .setContentTitle(title).setContentText(text).setStyle(Notification.BigTextStyle().bigText(text)).setContentIntent(open)
      .setVisibility(Notification.VISIBILITY_PRIVATE).setAutoCancel(!reply)
    if(reply){
      val request=PendingIntent.getForegroundService(context,4202,Intent(context,FoldPairingService::class.java),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE)
      val input=RemoteInput.Builder(CODE).setLabel("六位配对码").build()
      builder.addAction(Notification.Action.Builder(android.R.drawable.ic_menu_edit,"输入配对码",request).addRemoteInput(input).build())
    }
    return builder.build()
  }
}
