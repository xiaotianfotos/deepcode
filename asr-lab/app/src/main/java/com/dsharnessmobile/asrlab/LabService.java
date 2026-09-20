package com.dsharnessmobile.asrlab;
import android.app.*;
import android.content.Intent;
import android.os.IBinder;
/** Keeps user-started inference visible and eligible while another activity is shown. */
public class LabService extends Service {
    @Override public void onCreate(){
        super.onCreate();
        NotificationManager nm=getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel("asr", "本地语音测试", NotificationManager.IMPORTANCE_LOW));
        PendingIntent open=PendingIntent.getActivity(this,0,new Intent(this,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT),PendingIntent.FLAG_IMMUTABLE);
        startForeground(1,new Notification.Builder(this,"asr").setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentTitle("Qwen 本地语音引擎运行中").setContentText("点击返回实验页；可在页面卸载模型以停止服务")
            .setContentIntent(open).setOngoing(true).build());
    }
    @Override public int onStartCommand(Intent i,int flags,int id){return START_NOT_STICKY;}
    @Override public IBinder onBind(Intent i){return null;}
}
