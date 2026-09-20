package com.dsharnessmobile.shell

import android.os.Process
import android.os.SystemClock
import org.json.JSONObject
import java.io.File

/** Read-only memory/GPU sampling. Missing driver counters never become 0% GPU. */
class PerformanceSampler {
  private var previousAt = 0L
  private var cached = "{}"

  @Synchronized fun reset() { previousAt = 0; cached = "{}" }

  @Synchronized fun sample(): String {
    val now = SystemClock.elapsedRealtime()
    if (previousAt != 0L && now - previousAt < 800) return cached
    return try {
      val proc = ProcessBuilder("/system/bin/ps", "-A", "-o", "PID,UID").start()
      val rows = proc.inputStream.bufferedReader().use { it.readText() }
      proc.waitFor()
      val uid = Process.myUid().toString()
      var rssKiB = 0L
      rows.lineSequence().forEach { row ->
        val fields = row.trim().split(Regex("\\s+"))
        if (fields.size == 2 && fields[1] == uid && fields[0].all { it.isDigit() }) {
          try {
            val rss = File("/proc/${fields[0]}/status").useLines { lines ->
              lines.firstOrNull { it.startsWith("VmRSS:") }?.substringAfter(':')?.trim()?.substringBefore(' ')?.toLongOrNull() ?: 0L
            }
            rssKiB += rss
          } catch (_: Exception) { /* Exited process or inaccessible process; never inspect another UID. */ }
        }
      }
      previousAt = now
      cached = JSONObject().put("ok", true).put("sampledAtMs", now).put("rssMiB", rssKiB / 1024.0)
        .put("gpu", gpu()).toString()
      cached
    } catch (e: Exception) {
      JSONObject().put("ok", false).put("error", "性能采样暂不可用").toString()
    }
  }

  private fun gpu(): JSONObject {
    // Only accept counters with known percent semantics. Frequencies are not utilization.
    val paths = listOf("/sys/class/kgsl/kgsl-3d0/gpu_busy_percentage", "/sys/class/misc/mali0/device/utilization")
    for (path in paths) {
      try {
        val raw = File(path).readText().trim()
        val percent = raw.removeSuffix("%").trim().toDoubleOrNull()
        if (percent != null && percent in 0.0..100.0) return JSONObject().put("percent", percent).put("scope", "device").put("source", path)
      } catch (_: Exception) { }
    }
    return JSONObject().put("percent", JSONObject.NULL).put("scope", "device").put("reason", "系统未开放 GPU 利用率")
  }

}
