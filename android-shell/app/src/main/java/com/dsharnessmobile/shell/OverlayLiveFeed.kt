package com.dsharnessmobile.shell

import org.json.JSONObject
import java.io.File
import java.io.RandomAccessFile

/** live 流消费协作类（会话维）：订阅 NotifyStore 的目录观察器，逐行 drain .live.ndjson
 *  （turn_start/tool_call/tool_result/turn_end）+ android_* 自动化避让（F7）+ debug 合成 pending 注入。 */
class OverlayLiveFeed(private val svc: OverlayService) {

  private var unsubscribe: (() -> Unit)? = null
  private var readOffset = 0L

  /** 只撤销本订阅，通知服务继续持有目录观察器。 */
  fun stopWatcher() {
    unsubscribe?.invoke()
    unsubscribe = null
  }

  private fun liveFile(): File = File(File(svc.filesDir, "home/.dsh"), ".live.ndjson")

  fun startWatcher() {
    val dir = File(svc.filesDir, "home/.dsh")
    if (!dir.exists()) dir.mkdirs()
    readOffset = liveFile().takeIf { it.exists() }?.length() ?: 0L
    stopWatcher()
    unsubscribe = NotifyStore.observeDirectory(svc) { path ->
        if (path == ".live.ndjson") drainLive()
        else if (path == ".overlay-test-pending" &&
          (svc.applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
          // 调试注入（debuggable 包）：run-as 写 question|approval|clear 到该文件 → 合成 pending。
          // am start-service 通道被跨用户 binder 权限拦死，文件通道复用本 watcher 零新权限。
          try {
            val v = File(dir, ".overlay-test-pending").readText().trim()
            svc.main.post {
              val eventId = "test-" + System.currentTimeMillis()
              when (v) {
                // 0.13.3 W3 帧形：合成 $events waterfall 副本（eventId/agentId 字段）
                "approval" -> svc.panel.pendingApprovals[eventId] = PendingApproval(eventId, svc.activeSessionId, "bash", "rm -rf build/ 需要审批（debug 注入）")
                "question" -> {
                  val items = org.json.JSONArray("""[{"id":"q1","header":"简单问题1","question":"现在是白天还是晚上？","options":[{"label":"白天","description":"现在不在晚上"},{"label":"晚上","description":"现在是晚上"}],"multiSelect":false},{"id":"q2","header":"简单问题2","question":"要重试 TLS 同步吗（debug 注入）？","options":[{"label":"立即重试"},{"label":"稍后"}],"multiSelect":false}]""")
                  svc.panel.pendingQuestions[eventId] = PendingQuestion(eventId, svc.activeSessionId, items)
                }
                else -> { svc.panel.pendingApprovals.clear(); svc.panel.pendingQuestions.clear() }
              }
              svc.panel.onPendingChanged()
            }
          } catch (_: Exception) {}
        }
    }
    drainLive()
  }

  private fun drainLive() {
    val f = liveFile()
    if (!f.exists()) return
    val lines = ArrayList<String>()
    try {
      RandomAccessFile(f, "r").use { raf ->
        val len = raf.length()
        if (len < readOffset) readOffset = 0 // 文件被轮转重建
        if (len > readOffset) {
          raf.seek(readOffset)
          val buf = ByteArray((len - readOffset).toInt().coerceAtMost(256 * 1024))
          raf.readFully(buf)
          readOffset = len
          val tail = String(buf, Charsets.UTF_8)
          for (line in tail.split("\n")) {
            val t = line.trim()
            if (t.isNotEmpty()) lines.add(t)
          }
        }
      }
    } catch (_: Exception) {
      return
    }
    if (lines.isEmpty()) return
    svc.main.post {
      var changed = false
      for (line in lines) {
        try {
          val j = JSONObject(line)
          when (j.optString("k")) {
            "turn_start" -> {
              val s = j.optString("s", "")
              // 轮次真正启动（bridge 0.1.3 起在产）：覆盖 WebView 侧发送/提问续跑等壳侧不可见的启动，
              // 并确认乐观忙态。会话感知同 tool_call（#2）。
              if (svc.activeSessionId.isEmpty() || s == svc.activeSessionId) {
                svc.optimisticBusyAt = 0L
                if (!svc.sessionBusy) { svc.sessionBusy = true; svc.turnStartedAt = System.currentTimeMillis() }
                svc.setHalo(Halo.WORKING)
                changed = true
              }
            }
            "tool_call" -> {
              val s = j.optString("s", "")
              // 会话感知：仅当事件属于当前目标会话（或尚无目标）才置忙，
              // 避免其它会话/陈旧行的 tool_call 让 busy 永久卡死（#2）。
              if (svc.activeSessionId.isEmpty() || s == svc.activeSessionId) {
                svc.optimisticBusyAt = 0L
                if (!svc.sessionBusy) { svc.sessionBusy = true; svc.turnStartedAt = System.currentTimeMillis() }
                svc.toolCount++
                // 模板化显示（用户拍板）：live 行自带 name + args（bridge 0.1.1 已在产）——
                // 思考=Deep diving 扫光；调工具=工具类型+概览。
                svc.currentToolName = j.optString("name", "")
                svc.currentToolSummary = toolSummary(j.optString("args", ""))
                // ADB-F7 自动化避让（2026-09-05 真机实测）：android_* 工具（ADB 语义控制）
                // 执行期间面板会挡住被控 App 的坐标命中区（「点列表第2条实点面板」）——
                // 识别到自动化工具调用即自动收起面板；不自动恢复（用户点球重开），
                // 避免恢复动作与下一发自动化点击竞态。
                if (svc.currentToolName.startsWith("android_") && svc.expanded) svc.hidePanel()
                svc.setHalo(Halo.WORKING)
                changed = true
              }
            }
            "tool_result" -> {
              val s = j.optString("s", "")
              // 工具结束 → 回「思考」显示（Deep diving 扫光），概览清空。
              if (svc.activeSessionId.isEmpty() || s == svc.activeSessionId) {
                svc.currentToolName = ""; svc.currentToolSummary = ""
                changed = true
              }
            }
            "turn_end" -> {
              val s = j.optString("s", "")
              // 任何一次 turn/end 都取消忙碌（当前会话 end 或引擎兜底 end）。
              if (svc.activeSessionId.isEmpty() || s == svc.activeSessionId) {
                svc.optimisticBusyAt = 0L
                svc.sessionBusy = false
                svc.toolCount = 0
                svc.currentToolName = ""; svc.currentToolSummary = ""
                svc.setHalo(Halo.IDLE)
                changed = true
              }
            }
            // 注：提问/审批不走 live 文件——rpcId 只存在于引擎 mux WebSocket 下行帧，
            // 由 MuxClient 直连接收（见 OverlayPanel.handleMuxFrame），POST /api/respond 应答。
          }
        } catch (_: Exception) {
        }
      }
      if (changed) svc.renderPanelOnly()
      svc.updateBallOnly()
    }
  }

  /** 工具参数 JSON → 一行概览（bash=命令 / search=查询 / read·edit=路径；兜底取首个字符串值）。 */
  private fun toolSummary(argsJson: String): String {
    if (argsJson.isBlank()) return ""
    return try {
      val o = JSONObject(argsJson)
      val key = listOf("command", "query", "pattern", "file_path", "path", "file", "url", "cmd")
        .firstOrNull { o.has(it) && !o.optString(it).isBlank() }
      val raw = when {
        key != null -> o.optString(key)
        else -> {
          var first = ""
          for (k in o.keys()) { val v = o.opt(k); if (v is String) { first = v; break } }
          if (first.isBlank()) o.toString().take(40) else first
        }
      }
      raw.replace(Regex("\\s+"), " ").trim().take(24)
    } catch (_: Exception) {
      argsJson.replace(Regex("\\s+"), " ").trim().take(24)
    }
  }
}
