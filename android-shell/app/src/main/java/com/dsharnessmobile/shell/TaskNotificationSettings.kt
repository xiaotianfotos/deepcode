package com.dsharnessmobile.shell

import android.app.NotificationManager
import android.content.Context
import org.json.JSONObject
import java.io.File

/** Host plugin owns configuration; native code reads its atomic cache even with the WebView asleep. */
internal object TaskNotificationSettings {
 data class Config(val enabled:Boolean=true,val progress:Boolean=true,val quietWhenVisible:Boolean=true)
 private fun file(c:Context)=File(c.filesDir,"home/.dsh/.task-notifications.json")
 fun read(c:Context):Config=runCatching{val f=file(c);if(!f.isFile)return Config();val j=JSONObject(f.readText());Config(j.optBoolean("enabled",false),j.optBoolean("progress",true),j.optBoolean("quietWhenVisible",true))}.getOrDefault(Config(false))
 fun disable(c:Context){runCatching{file(c).writeText("{\"enabled\":false}")};reconcile(c)}
 fun reconcile(c:Context){
  val config=read(c);val manager=c.getSystemService(NotificationManager::class.java)
  runCatching{for(n in manager.activeNotifications){
   val task=n.notification.extras?.getBoolean("deepcode.task",false)==true
   val progress=n.notification.extras?.getBoolean("deepcode.progress",false)==true
   if(task&&(!config.enabled||(!config.progress&&progress)))manager.cancel(n.id)
  }}
 }
}
