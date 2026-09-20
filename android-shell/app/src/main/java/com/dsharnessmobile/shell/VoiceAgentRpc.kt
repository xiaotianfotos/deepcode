package com.dsharnessmobile.shell

import android.content.Context
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.Proxy
import java.net.URL
import java.util.UUID

/** Native session client. Never exposes the engine cookie to an external application. */
internal class VoiceAgentRpc(private val context: Context) {
  fun call(method: String, args: JSONObject): Any? {
    require(method in setOf("session/list", "session/prompt", "session/cancel"))
    val envelope = JSONObject().put("type", "client-request").put("rpcId", "voice-" + UUID.randomUUID())
      .put("method", method).put("payload", JSONObject().put("args", args))
    for (attempt in 0..1) {
      val conn = URL("http://127.0.0.1:3080/api/$method").openConnection(Proxy.NO_PROXY) as HttpURLConnection
      try {
        conn.requestMethod = "POST"; conn.doOutput = true
        conn.connectTimeout = 3000; conn.readTimeout = 8000
        conn.setRequestProperty("Content-Type", "application/json")
        EngineAuth.attach(context, conn)
        conn.outputStream.use { it.write(envelope.toString().toByteArray(Charsets.UTF_8)) }
        if (conn.responseCode == 401 && attempt == 0) { EngineAuth.handleUnauthorized(context); continue }
        check(conn.responseCode == 200) { "引擎请求失败（HTTP ${conn.responseCode}）" }
        val result = JSONObject(conn.inputStream.bufferedReader().use { it.readText() }).getJSONObject("result")
        check(result.optBoolean("ok")) { result.optJSONObject("error")?.optString("message") ?: "引擎拒绝了请求" }
        return result.opt("value")
      } finally { conn.disconnect() }
    }
    error("引擎认证失败")
  }
}
