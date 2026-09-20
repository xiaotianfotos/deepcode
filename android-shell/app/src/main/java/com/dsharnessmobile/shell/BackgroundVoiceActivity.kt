package com.dsharnessmobile.shell

import android.Manifest
import android.app.Activity
import android.app.NotificationManager
import android.content.Intent
import android.content.pm.PackageManager
import android.os.*
import android.view.View
import android.widget.*
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.Executors

/** Experimental native control surface; opening it never starts capture or sends a prompt. */
class BackgroundVoiceActivity : Activity() {
  private val main = Handler(Looper.getMainLooper())
  private val worker = Executors.newSingleThreadExecutor()
  private lateinit var status: TextView
  private lateinit var agentStatus: TextView
  private lateinit var draft: EditText
  private lateinit var picker: Spinner
  private lateinit var start: Button
  private lateinit var send: Button
  private lateinit var cancelAgent: Button
  private var sessions = emptyList<JSONObject>()
  private var selected = ""
  private var delivered = ""
  private var draftTarget = ""
  private var promptKey = ""
  private var promptId = ""
  private var busy = false
  private var visible = false
  private var renderedVoiceState = ""
  private var lastPoll = 0L
  private var refreshing = false
  private val rpc by lazy { VoiceAgentRpc(applicationContext) }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    selected = savedInstanceState?.getString("selected") ?: intent.getStringExtra("sessionId").orEmpty()
    promptKey = savedInstanceState?.getString("promptKey").orEmpty()
    promptId = savedInstanceState?.getString("promptId").orEmpty()
    delivered = savedInstanceState?.getString("delivered").orEmpty()
    draftTarget = savedInstanceState?.getString("draftTarget").orEmpty()
    val pad = (20 * resources.displayMetrics.density).toInt()
    val layout = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(pad, pad, pad, pad)
    }
    fun text(value: String, size: Float = 16f) = TextView(this).apply {
      text = value; textSize = size; setPadding(0, 10, 0, 10); layout.addView(this)
    }
    fun button(value: String, action: () -> Unit) = Button(this).apply {
      text = value; isAllCaps = false; setOnClickListener { action() }; layout.addView(this)
    }
    text("语音输入", 26f)
    text("选择会话，开启收音后可以切到其他 App。每段最长 60 秒，静音约 5 秒结束；转写使用默认语音服务，确认后才发送。")
    picker = Spinner(this).also { layout.addView(it) }
    picker.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
      override fun onNothingSelected(parent: AdapterView<*>?) {}
      override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) {
        sessions.getOrNull(position)?.let { selected = it.optString("sessionId") }
        showAgent()
      }
    }
    agentStatus = text("正在连接 DeepCode 引擎…")
    button("刷新会话") { refreshSessions() }
    status = text("未开启收音")
    start = button("开始后台收音") { requestCapture() }
    button("完成录音并转写") {
      if (BackgroundVoiceService.instance != null) startService(Intent(this, BackgroundVoiceService::class.java).setAction(BackgroundVoiceService.FINISH))
    }
    button("取消收音") { stopService(Intent(this, BackgroundVoiceService::class.java)) }
    draft = EditText(this).apply {
      hint = "识别结果会出现在这里，也可以手动修改"
      minLines = 2; maxLines = 6; textSize = 16f
      setText(savedInstanceState?.getString("draft").orEmpty())
      layout.addView(this)
    }
    send = button("发送给选定 Agent") { sendDraft() }
    cancelAgent = button("停止选定 Agent 任务") { cancelTask() }
    button("返回 DeepCode") { startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)) }
    setContentView(ScrollView(this).apply { addView(layout) })
    refreshSessions()
  }

  override fun onResume() {
    super.onResume(); visible = true
    getSystemService(NotificationManager::class.java).cancel(413)
    main.post(tick)
  }
  override fun onPause() { visible = false; main.removeCallbacks(tick); super.onPause() }
  override fun onDestroy() { main.removeCallbacksAndMessages(null); worker.shutdown(); super.onDestroy() }
  override fun onSaveInstanceState(out: Bundle) {
    out.putString("promptKey", promptKey); out.putString("promptId", promptId)
    out.putString("selected", selected); out.putString("delivered", delivered)
    out.putString("draftTarget", draftTarget); out.putString("draft", draft.text.toString())
    super.onSaveInstanceState(out)
  }

  private fun requestCapture() {
    if (draft.text.isNotBlank()) { status.text = "请先发送或清空当前草稿，再开始下一段"; return }
    if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
      requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 410); return
    }
    if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
      requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 411); return
    }
    try {
      startForegroundService(Intent(this, BackgroundVoiceService::class.java)
        .setAction(BackgroundVoiceService.START).putExtra("sessionId", selected).putExtra("direct", intent.getBooleanExtra("direct",false)))
    } catch (e: Exception) { status.text = e.message ?: "无法开启语音" }
  }
  override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, results: IntArray) {
    super.onRequestPermissionsResult(requestCode, permissions, results)
    if (requestCode in listOf(410, 411)) {
      // Permission grant is not an implicit recording trigger; require another explicit tap.
      status.text = if (results.firstOrNull() == PackageManager.PERMISSION_GRANTED) "权限已授予，点击开始收音" else "未获得所需权限"
    }
  }

  private val tick = object : Runnable {
    override fun run() {
      if (!visible) return
      val s = BackgroundVoiceService.snapshot
      val voiceState = s.optString("id") + BackgroundVoiceService.label(s)
      if (voiceState != renderedVoiceState) { renderedVoiceState = voiceState; status.text = BackgroundVoiceService.label(s) }
      if (s.optString("phase") in listOf("done","send-error") && s.optString("id") != delivered) {
        delivered = s.optString("id"); draftTarget = s.optString("sessionId")
        val current = draft.text.toString()
        draft.setText(listOf(current, s.optString("text")).filter { it.isNotBlank() }.joinToString("\n"))
        if (draftTarget.isNotEmpty()) selectSession(draftTarget)
      }
      val active = BackgroundVoiceService.instance != null
      if (!active && !busy && draft.text.isBlank()) draftTarget = ""
      start.isEnabled = !active && !busy
      picker.isEnabled = !active && !busy && draft.text.isBlank()
      send.isEnabled = !active && !busy && selected.isNotBlank()
      cancelAgent.isEnabled = !busy && selected.isNotBlank()
      if (SystemClock.elapsedRealtime() - lastPoll > 4000 && !busy) refreshSessions()
      main.postDelayed(this, 350)
    }
  }

  private fun selectSession(id: String) {
    val index = sessions.indexOfFirst { it.optString("sessionId") == id }
    if (index >= 0) { selected = id; picker.setSelection(index) }
  }
  private fun sessionTitle(item: JSONObject): String =
    item.optJSONObject("projections")?.optJSONObject("values")?.optString("title")
      ?.takeIf { it.isNotBlank() && it != "null" } ?: item.optString("sessionId").take(12)
  private fun showAgent() {
    val item = sessions.firstOrNull { it.optString("sessionId") == selected }
    agentStatus.text = if (item == null) "无可用会话，请先在 DeepCode 创建会话" else
      "${sessionTitle(item)} · ${if (item.optBoolean("running")) "执行中" else "空闲"}"
  }
  private fun refreshSessions() {
    if (refreshing || isDestroyed) return
    refreshing = true; lastPoll = SystemClock.elapsedRealtime()
    worker.execute {
      val result = runCatching { rpc.call("session/list", JSONObject().put("_request", JSONObject())) as JSONObject }
      main.post {
        refreshing = false
        if (isDestroyed) return@post
        result.onSuccess { value ->
          val items = value.optJSONArray("items") ?: JSONArray()
          val next = (0 until items.length()).map { items.getJSONObject(it) }
          val changed = next.map { it.optString("sessionId") to sessionTitle(it) } != sessions.map { it.optString("sessionId") to sessionTitle(it) }
          sessions = next
          if (changed) {
            picker.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item,
              sessions.map { sessionTitle(it) })
            selectSession(selected)
          }
          showAgent()
        }.onFailure { agentStatus.text = "引擎未连接，请先打开 DeepCode" }
      }
    }
  }
  private fun sendDraft() {
    val text = draft.text.toString().trim()
    val sid = selected
    if (text.isEmpty() || sid.isEmpty() || busy) return
    if (draftTarget.isNotEmpty() && draftTarget != sid) { agentStatus.text = "录音目标会话已变化，请恢复原会话后发送"; return }
    val running = sessions.firstOrNull { it.optString("sessionId") == sid }?.optBoolean("running") == true
    val key = "$sid\n$text"
    if (key != promptKey || promptId.isEmpty()) { promptKey = key; promptId = "voice-" + UUID.randomUUID() }
    val request = JSONObject().put("sessionId", sid).put("requestId", promptId)
      .put("mode", if (running) "steer" else "queue")
      .put("content", JSONArray().put(JSONObject().put("type", "text").put("text", text)))
    operate("session/prompt", request) {
      check((it as? JSONObject)?.optBoolean("accepted") == true) { "Agent 未确认接收，草稿已保留" }
      if (draft.text.toString().trim() == text) draft.setText("")
      BackgroundVoiceService.acknowledge(delivered)
      draftTarget = ""; promptKey = ""; promptId = ""; agentStatus.text = if (running) "已向原任务补充指令" else "Agent 已接收任务"
    }
  }
  private fun cancelTask() {
    if (selected.isEmpty() || busy) return
    operate("session/cancel", JSONObject().put("sessionId", selected)) {
      agentStatus.text = "已提交停止请求，请以会话状态为准"
    }
  }
  private fun operate(method: String, request: JSONObject, success: (Any?) -> Unit) {
    busy = true; send.isEnabled = false; picker.isEnabled = false; draft.isEnabled = false
    worker.execute {
      val result = runCatching { rpc.call(method, JSONObject().put("request", request)) }
      main.post {
        busy = false
        if (isDestroyed) return@post
        draft.isEnabled = true
        result.onSuccess { value -> runCatching { success(value) }.onFailure { agentStatus.text = it.message } }
          .onFailure { agentStatus.text = it.message ?: "请求失败，草稿已保留" }
        lastPoll = 0
      }
    }
  }
}
