package com.dsharnessmobile.shell

import android.content.Context
import android.net.ConnectivityManager
import java.io.File
import org.json.JSONArray
import org.json.JSONObject

/** Export only active-network DNS addresses for the optional glibc guest. */
object NetworkDns {
  @Synchronized
  fun refresh(context: Context) {
    val addresses = try {
      val manager = context.getSystemService(ConnectivityManager::class.java)
      manager.getLinkProperties(manager.activeNetwork)?.dnsServers
        ?.mapNotNull { it.hostAddress }?.filter { !it.contains('%') } ?: emptyList()
    } catch (_: Exception) { emptyList() }
    val target = File(context.filesDir, "network-dns.json")
    val staging = File(context.filesDir, "network-dns.json.tmp")
    staging.writeText(JSONObject().put("servers", JSONArray(addresses))
      .put("nativeLibraryDir", context.applicationInfo.nativeLibraryDir)
      .put("allFilesAccessRequired", android.os.Build.VERSION.SDK_INT >= 30)
      .put("allFilesAccessGranted", android.os.Build.VERSION.SDK_INT < 30 || android.os.Environment.isExternalStorageManager())
      .toString())
    if (!staging.renameTo(target)) staging.delete()
  }
}
