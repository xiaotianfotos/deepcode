package com.dsharnessmobile.shell

import android.net.Uri
import android.provider.DocumentsContract
import android.webkit.JavascriptInterface
import org.json.JSONObject

/**
 * JS bridge injected as window.androidBridge (protocol v1, see
 * docs/design.md). All methods are callable from the page; results
 * that arrive asynchronously are delivered back through
 * window.__dshBridge.onDirectoryPicked(callbackId, path) on the main thread.
 */
class AndroidBridge(
  private val onStartupConfigure: (Boolean) -> Unit = {},
  private val onStartupEnabled: () -> Boolean = { false },
  private val onSpeechSession: (String, String, Boolean) -> Unit = { _, _, _ -> },
  private val onLiveVoiceSession: (String,Boolean) -> Unit = { _, _ -> },
  private val onLiveVoiceStop: () -> Unit = {},
  private val onLiveVoiceStart: (String) -> String = { "{\"ok\":false}" },
  private val onLiveVoiceRelease: () -> Unit = {},
  private val onLiveVoiceOpen: (String) -> Unit = {},
  private val onPickRequest: (callbackId: String) -> Unit,
  private val onKeepScreen: (enable: Boolean) -> Unit,
  private val onNotify: (title: String, text: String) -> Unit,
  private val onAllFilesAccessRequest: () -> Unit = {},
  /** 0.13.1 W4：配置导出（私有 settings.yaml -> 共享 exports/config/）。返回 JSON {ok, path?, error?}。 */
  private val onExportConfig: () -> String = { """{"ok":false,"error":"bridge not wired"}""" },
  /** 0.13.1 W4：配置导入（共享 exports/config/settings.yaml -> 私有 DSH_HOME）。返回 JSON 同上。 */
  private val onImportConfig: () -> String = { """{"ok":false,"error":"bridge not wired"}""" },
  private val onGetSystemDark: () -> Boolean = { false },
  /** Absolute path of the Host settings document, or empty when unavailable. */
  private val onSettingsPathRequest: () -> String = { "" },
  /** apk #168：把活动 settings.yaml 导出为公共副本并返回其路径（私有目录不对外开放）。 */
  private val onExportSettingsDocument: () -> String = { "" },
  private val onSetImmersiveRequest: (enable: Boolean) -> Unit = {},
  /** ST-10：沉浸式**读**面（缺它就是三方分裂 #1：壳偏好与页面 localStorage 互不校验）。
   *  默认实现直接读壳侧单一真源（ShellAppContext 由 EngineAuth.initContext 绑定），
   *  因此 MainActivity 无需传参即可返回真实值。 */
  private val onGetImmersiveMode: () -> Boolean = { ImmersiveMode.current() },
  private val onCopyTextRequest: (text: String) -> Boolean = { false },
  private val pickToken: String? = null,
  private val onRestartEngine: () -> Unit = {},
  private val onShutdownToGuide: () -> Unit = {},
  private val onReloadWebUI: () -> Unit = {},
  private val onOpenConsole: () -> Unit = {},
  private val onGetDevLogEnabled: () -> Boolean = { false },
  private val onSetDevLogEnabled: (Boolean) -> Unit = {},
  private val onOpenNativePath: (path: String) -> Boolean = { false },
  /** 0.13.7：系统「打开方式」选择器（MT 管理器 / 系统文件管理…）。返回 JSON {ok, reason?}。 */
  private val onOpenPathChooser: (path: String, mode: String?) -> String =
    { _, _ -> """{"ok":false,"reason":"bridge not wired"}""" },
  /** 0.13.0 F1.7：ADB shell 执行原语（授权时执行；未授权失败关闭返回引导 JSON）。 */
  private val onAdbShell: (cmd: String) -> String = { _ -> "" },
  /** 0.13.0 F1.7：授权状态 JSON（三道人门状态视图，供设置页/授权状态探活）。 */
  private val onGetAdbState: () -> String = { "{}" },
  /** 0.13.0 F1.7：应用内「允许访问」开关（第二道人门；默认关闭；回收即失效）。 */
  private val onSetAdbAllow: (enable: Boolean) -> Unit = {},
  /** 0.13.0 F1.7：门3 配对码（6 位）；仅原生侧可写授权（被提权方自改授权被禁止——Shizuku 对照）。
   *  0.14：真实握手——pairPort/connectPort 取自系统「无线调试」弹窗（码值只进 adb argv，绝不出壳）。
   *  F3（2026-08-27）：返回结构化 JSON 文本 {ok, reason, message}，替代 Boolean。 */
  private val onSetAdbPair: (code: String, pairPort: Int, connectPort: Int) -> String = { _, _, _ -> """{"ok":false,"reason":"unknown","message":null}""" },
  /** 0.13.0 F1.7：回收配对（R6：显式回收 + 审计）。 */
  private val onRevokeAdbPair: () -> Unit = {},
  /** 0.13.0（issue #80；NSD 替换盲扫）：自动发现无线调试端口——返回结构
   *  {\"pair\": <配对端口|null>, \"connect\": <连接端口|null>, \"candidates\": [...] }，
   *  与壳 AdbState.discoverPorts 同形状（桥默认值同为完整结构，不再返回 "[]" 造成两端不一致）。
   *  0.14：Shizuku 探活重设计与豁免升级。 */
  private val onDiscoverAdbPorts: () -> String = { """{"pair":null,"connect":null,"candidates":[]}""" },
  /** 0.13.2 W7：悬浮球开关态（持久化，OverlayController）。 */
  private val onGetOverlayEnabled: () -> Boolean = { false },
  /** 0.13.2 W7：悬浮球开关（未授 overlay 权限时由控制器发起系统授权引导）。返回是否已启动。 */
  private val onSetOverlayEnabled: (Boolean) -> Boolean = { _ -> false },
  private val voice: VoiceInputController? = null,
  private val performance: PerformanceSampler? = null,
  private val onGamepadLease: (Int, Boolean) -> Unit = { _, _ -> },
  private val onFoldConfigure: (Boolean) -> Unit = {},
  private val onFoldReady: (Int) -> Unit = {},
  private val onFoldStatus: () -> String = { "{}" },
  private val onFoldPreview: (Float) -> Unit = {},
  private val onFoldHostPreview: (Boolean) -> Unit = {},
  private val onFoldDualProbe: (Boolean) -> Unit = {},
  private val onFoldDualStatus: () -> String = { "{}" },
  private val onFoldDualObserve: () -> Unit = {},
  private val onFoldSetup: () -> Unit = {},
  private val onFoldProjectionPreview: (Float) -> Unit = {},
  private val onOpenFoldSettings: () -> Unit = {},
  private val onChromeTheme: (String, Boolean) -> Unit = { _, _ -> },
  private val onGamepadStatus: () -> String = { "{}" },
  /** 0.13.5 W4：无障碍控制通道状态 JSON {enabled, label, restrictedHint}。 */
  private val onA11yStatus: () -> String = { """{"enabled":false}""" },
  /** 0.13.5 W4：跳系统无障碍设置页（用户手动开启「DSH 设备控制」）。 */
  private val onOpenA11ySettings: () -> Unit = {},
  /** 0.13.5 W4：一键解锁受限设置（Android 13+ 侧载应用默认禁止开启无障碍）。返回 JSON {ok, message}。 */
  private val onUnlockRestrictedSettings: () -> String = { """{"ok":false,"message":"未接线"}""" },
) {

  @JavascriptInterface fun remoteConfigure(config: String) { RemoteInput.configure(config) }
  @JavascriptInterface fun remoteLease(active: Boolean) { RemoteInput.lease(active) }
  @JavascriptInterface fun remoteKeyName(code: Int): String = android.view.KeyEvent.keyCodeToString(code).removePrefix("KEYCODE_")
  @JavascriptInterface fun desktopVoiceStatus(): String {
    if (!BuildConfig.DEBUG) return "{}"
    val s = BackgroundVoiceService.snapshot
    return JSONObject().put("phase",s.optString("phase")).put("stopReason",s.optString("stopReason"))
      .put("autoStopped",s.optBoolean("autoStopped")).put("capturedMs",s.optInt("capturedMs"))
      .put("inputDevice",s.optString("inputDevice")).put("inputDeviceType",s.optString("inputDeviceType"))
      .put("inputRms",s.optDouble("inputRms",0.0)).put("vadThreshold",s.optDouble("vadThreshold",0.0))
      .put("speechDetected",s.optBoolean("speechDetected")).put("silenceMs",s.optInt("silenceMs"))
      .put("lastSpeechMs",s.optInt("lastSpeechMs")).put("level",s.optDouble("level",0.0))
      .put("textLength",s.optString("text").length).put("error",s.optString("error")).toString()
  }
  @JavascriptInterface fun remoteStatus(): String = RemoteInput.status()
  @JavascriptInterface fun remoteCaptureBegin(device: String): String = RemoteInput.captureBegin(device)
  @JavascriptInterface fun remoteCaptureCancel(id: String) { RemoteInput.captureCancel(id) }

  @JavascriptInterface fun notificationSurface(ids:String) { NotificationAttention.updateVisible(ids) }

  @JavascriptInterface fun speechPlaybackContext(): String = JSONObject()
    .put("foreground",SpeechSessionFocus.foreground)
    .put("companion",OverlayService.instance?.expanded == true)
    .put("microphone",VoiceInputController.microphoneInUse()).toString()

  @JavascriptInterface fun speechOpenRequest(): String = SpeechSessionFocus.pendingOpen()
  @JavascriptInterface fun speechOpenAck(id:String) { SpeechSessionFocus.ackOpen(id) }
  @JavascriptInterface fun speechReplyStatus(): String = if(BuildConfig.DEBUG) OverlayService.instance?.speech?.replyStatus()?.toString()?:"{}" else "{}"

  @JavascriptInterface fun speechSession(id:String,title:String,enabled:Boolean) { onSpeechSession(id.take(160),title.take(120),enabled) }

  @JavascriptInterface fun foldConfigure(enabled: Boolean) { onFoldConfigure(enabled) }
  @JavascriptInterface fun foldReady(generation: Int) { onFoldReady(generation) }
  @JavascriptInterface fun foldStatus(): String = onFoldStatus()
  @JavascriptInterface fun foldHostPreview(cover:Boolean){if(BuildConfig.DEBUG)onFoldHostPreview(cover)}
  @JavascriptInterface fun foldSetup() { onFoldSetup() }
  @JavascriptInterface fun foldProjectionPreview(angle:Double) { if(BuildConfig.DEBUG && angle.isFinite() && angle in 0.0..180.0)onFoldProjectionPreview(angle.toFloat()) }
  @JavascriptInterface fun foldDualObserve() { if(BuildConfig.DEBUG) onFoldDualObserve() }
  @JavascriptInterface fun foldDualProbe(enabled: Boolean) { if(BuildConfig.DEBUG) onFoldDualProbe(enabled) }
  @JavascriptInterface fun foldDualStatus(): String = if(BuildConfig.DEBUG) onFoldDualStatus() else "{}"
  @JavascriptInterface fun foldPreview(amount: Double) {
    if (BuildConfig.DEBUG && amount.isFinite()) onFoldPreview(amount.toFloat())
  }
  @JavascriptInterface fun setChromeTheme(color: String, dark: Boolean) {
    if (color.matches(Regex("#[0-9a-fA-F]{6}"))) onChromeTheme(color, dark)
  }

  @JavascriptInterface fun openFoldSettings() { onOpenFoldSettings() }

  @JavascriptInterface fun gamepadLease(epoch: Int, enabled: Boolean) { onGamepadLease(epoch, enabled) }
  /** Physical alphabetic keyboards only; touch keyboards and gamepads are not keyboards. */
  @JavascriptInterface fun hasHardwareKeyboard(): Boolean = android.view.InputDevice.getDeviceIds().any { id ->
    val device = android.view.InputDevice.getDevice(id)
    device != null && !device.isVirtual &&
      device.keyboardType == android.view.InputDevice.KEYBOARD_TYPE_ALPHABETIC &&
      device.supportsSource(android.view.InputDevice.SOURCE_KEYBOARD)
  }

  @JavascriptInterface fun gamepadStatus(): String = onGamepadStatus()

  @JavascriptInterface fun voiceStart(id: String): String = voice?.start(id) ?: "{\"ok\":false}"
  @JavascriptInterface fun voiceTestSample(id: String, compatibility: Boolean): String =
    if (BuildConfig.DEBUG) voice?.testSample(id, compatibility) ?: "{\"ok\":false}" else "{\"ok\":false}"
  @JavascriptInterface fun voiceTestServiceSample(id: String): String =
    if (BuildConfig.DEBUG) voice?.testServiceSample(id) ?: "{\"ok\":false}" else "{\"ok\":false}"
  @JavascriptInterface fun voiceStatus(): String = voice?.status() ?: "{\"ok\":false}"
  @JavascriptInterface fun voiceStop(id: String) { voice?.stop(id) }
  @JavascriptInterface fun voiceCancel(id: String) { voice?.cancel(id) }
  @JavascriptInterface fun voiceAcknowledge(id: String) { voice?.acknowledge(id) }
  @JavascriptInterface fun voiceRelease() { voice?.release() }
  @JavascriptInterface fun performanceSample(): String = performance?.sample() ?: "{\"ok\":false}"
  @JavascriptInterface fun performanceReset() { performance?.reset() }

  @JavascriptInterface
  fun version(): String = BuildConfig.VERSION_NAME

  /** Synchronous system-dark query (H1: the first-frame theme bridge pulls the real uiMode,
   *  bypassing vendor WebViews whose matchMedia is stuck on light). */
  @JavascriptInterface
  fun getSystemDark(): Boolean = onGetSystemDark()

  @JavascriptInterface
  fun checkEngine(): String = EngineProbe.check().toString()

  @JavascriptInterface
  fun keepScreenOn(enable: Boolean) {
    onKeepScreen(enable)
  }

  @JavascriptInterface
  fun showNotification(title: String, text: String) {
    onNotify(title, text)
  }

  @JavascriptInterface
  fun pickDirectory(callbackId: String) {
    onPickRequest(callbackId)
  }


  /**
   * Absolute path of the Host settings document (`$DSH_HOME/settings.yaml`).
   * The mobile adaptation layer opens it through the shell chooser, because the upstream
   * "open configuration file" action delegates to a desktop native text editor (apk #152).
   */
  @JavascriptInterface
  fun settingsPath(): String = onSettingsPathRequest()

  /** 配置文档副本的公共路径（空串 = 导出失败）。选择器/FileProvider 只放行这个副本。 */
  @JavascriptInterface
  fun exportSettingsDocument(): String = onExportSettingsDocument()
  /** Immersive status bar toggle (true = status bar normally hidden); called by Settings → General. */
  @JavascriptInterface
  fun setImmersiveMode(enable: Boolean) {
    onSetImmersiveRequest(enable)
  }

  /**
   * ST-10（F-APK-06 / F-UI-05 三方分裂 #1）：沉浸式**读**面——页面以壳侧值为唯一初值。
   * 只有 setter 时，用 `adb shell` 直接改壳偏好（绕过页面）后重开设置页显示不一致。
   */
  @JavascriptInterface
  fun getImmersiveMode(): Boolean = onGetImmersiveMode()

  /**
   * Native clipboard write (navigator.clipboard.writeText in WebView is always rejected on Android
   * with NotAllowedError: Write permission denied, so the page falls back to this bridge after
   * writeClipboard fails). Returns whether the write succeeded.
   */
  @JavascriptInterface
  fun copyText(text: String): Boolean = onCopyTextRequest(text)

  /**
   * 0.13.1 W4：配置导出（私有 settings.yaml -> Documents/dshdata/exports/config/settings.yaml）。
   * 引擎 DSH_HOME 在私有域（外部改共享目录副本无效），本桥是安全的手改通道：
   * 导出 -> 文件管理器编辑 -> 导入。返回 JSON {ok, path?, error?}（同步执行，桥线程允许阻塞 IO）。
   */
  @JavascriptInterface
  fun exportConfig(): String = onExportConfig()

  /** 0.13.1 W4：配置导入（exports/config/settings.yaml -> 私有 DSH_HOME；引擎 chokidar 热加载）。返回 JSON 同上。 */
  @JavascriptInterface
  fun importConfig(): String = onImportConfig()

  /** True when the app holds All Files Access (external workspace requirement). */
  @JavascriptInterface
  fun hasAllFilesAccess(): Boolean {
    // isExternalStorageManager exists only on API 30+; older versions have no such permission model.
    if (android.os.Build.VERSION.SDK_INT < 30) return false
    return android.os.Environment.isExternalStorageManager()
  }

  /** 0.13.7：把路径交给系统选择器（MT 管理器 / 系统文件管理…；返回 JSON {ok, reason?}）。 */
  @JavascriptInterface
  fun openPathChooser(path: String, mode: String?): String = onOpenPathChooser(path, mode)

  /** Open the system screen granting All Files Access (special permission). */
  @JavascriptInterface
  fun requestAllFilesAccess() {
    onAllFilesAccessRequest()
  }

  @JavascriptInterface
  fun startupConfigure(enabled: Boolean) { onStartupConfigure(enabled) }
  @JavascriptInterface
  fun startupEnabled(): Boolean = onStartupEnabled()

  /** One-shot session token for the directory-picker bridge (validated by the engine-side pick endpoint; null = disabled). */
  @JavascriptInterface
  fun getPickToken(): String? = pickToken

  /** Restart the engine service process: kill the engine, the EngineService watchdog brings it back. */
  @JavascriptInterface
  fun restartEngine() {
    onRestartEngine()
  }

  /** Shut down the harness: stop the engine and fall back to the init (startup/test) screen (no auto-restart). */
  @JavascriptInterface
  fun shutdownToGuide() {
    onShutdownToGuide()
  }

  /** Refresh the Web UI (reloads the current engine page, issue apk#29 requirement 1). */
  @JavascriptInterface
  fun reloadWebUI() {
    onReloadWebUI()
  }

  /** Open the built-in console (snapshot bash interactive terminal; usable for diagnostics even when the engine is down). */
  @JavascriptInterface
  fun openConsole() {
    onOpenConsole()
  }

  /** Dev debug-log toggle state (default off; persisted via SharedPreferences).
   *  ST-11：返回值 = 偏好 **&&** 采集器在跑——EngineService.onDestroy 无条件停采集器，
   *  此后只回读偏好就是乐观置位（开关显示「开」而日志文件不再增长）。 */
  @JavascriptInterface
  fun getDevLogEnabled(): Boolean = onGetDevLogEnabled() && LogCollector.isRunning()

  /** Set the dev debug-log toggle; when on, logs are written daily under dshdata/log/. */
  @JavascriptInterface
  fun setDevLogEnabled(enabled: Boolean) {
    onSetDevLogEnabled(enabled)
  }

  /**
   * Open a filesystem path with an external reader app (issue #52): the
   * engine's native-path opener only knows mac/win/linux desktops, and on
   * Android the page's file-mention buttons would otherwise fail with
   * "unsupported on android". The shell resolves the path through
   * ACTION_VIEW (content Uri via FileProvider); returns whether a reader
   * took it. Callers fall back to the engine RPC when false (desktop hosts).
   */
  @JavascriptInterface
  fun openNativePath(path: String): Boolean = onOpenNativePath(path)

  /** ADB shell 执行原语（F1.7）：返回 JSON {ok, stdout?, stderr?, guidance?}。
   *  未授权/门控不满足 → fail-closed（绝不静默执行）。 */
  @JavascriptInterface
  fun adbShell(cmd: String): String = onAdbShell(cmd)

  /** 授权状态视图（F1.7/F2.9 授权探活）：JSON {fullAccess, allowSwitch, paired, wirelessDebugOn, message}。 */
  @JavascriptInterface
  fun getAdbState(): String = onGetAdbState()

  /** 应用内「允许访问」开关（第二道人门；默认关闭；关闭即通道失败关闭）。 */
  @JavascriptInterface
  fun setAdbAllow(enable: Boolean) {
    onSetAdbAllow(enable)
  }

  /**
   * 门3 配对码：六位数字 + 无线调试弹窗的「配对端口/连接端口」；
   * AdbState 运行真实 adb pair 握手（码值不入审计，只记长度）。
   * F3 结构化返回（JSON 文本 {ok, reason, message}）：前端按机器可读 reason 分流文案
   * （window-closed/protocol-fault/server-not-ready/handshake-timeout…），不再笼统布尔。
   */
  @JavascriptInterface
  fun setAdbPair(code: String, pairPort: Int, connectPort: Int): String =
    onSetAdbPair(code, pairPort, connectPort)

  /** 回收配对（R6 显式回收；配套审计）。 */
  @JavascriptInterface
  fun revokeAdbPair() {
    onRevokeAdbPair()
  }

  /** 自动发现无线调试端口（issue #80）：返回配对端口候选 JSONArray（顺序端序）。
   *  耗时为原生 TCP 盲扫（毫秒/端口）；无线调试未开时返回 []。 */
  @JavascriptInterface
  fun discoverAdbPorts(): String = onDiscoverAdbPorts()

  @JavascriptInterface
  fun liveVoiceOpen(sessionId: String) { if(sessionId.matches(Regex("session-[A-Za-z0-9-]+"))) onLiveVoiceOpen(sessionId) }
  @JavascriptInterface
  fun liveVoiceStatus(): String = LiveVoiceService.state.toString()
  @JavascriptInterface
  fun liveVoiceStop() = onLiveVoiceStop()
  @JavascriptInterface fun liveVoiceSession(id:String,eligible:Boolean) = onLiveVoiceSession(id.take(160),eligible)
  @JavascriptInterface fun liveVoiceRelease() = onLiveVoiceRelease()
  @JavascriptInterface fun liveVoiceStart(sessionId:String):String = if(sessionId.matches(Regex("session-[A-Za-z0-9-]+"))) onLiveVoiceStart(sessionId) else "{\"ok\":false,\"error\":\"Invalid session\"}"

  /** 悬浮球开关态（持久化；开发者选项 → 悬浮球）。 */
  @JavascriptInterface
  fun getOverlayEnabled(): Boolean = onGetOverlayEnabled()

  /** 悬浮球开关（控制器负责权限引导）；返回当前是否已启动。 */
  @JavascriptInterface
  fun setOverlayEnabled(enable: Boolean): Boolean = onSetOverlayEnabled(enable)


  /** 0.13.5 W4：无障碍控制通道状态（设置页展示 + 引导）。 */
  @JavascriptInterface
  fun a11yStatus(): String = onA11yStatus()

  /** 0.13.5 W4：跳系统无障碍设置页（开启「DSH 设备控制」）。 */
  @JavascriptInterface
  fun openA11ySettings() {
    onOpenA11ySettings()
  }

  /** 0.13.5 W4：一键解锁受限设置（appops set … ACCESS_RESTRICTED_SETTINGS allow，走 ADB 通道）。 */
  @JavascriptInterface
  fun unlockRestrictedSettings(): String = onUnlockRestrictedSettings()

  companion object {
    /**
     * Map an ACTION_OPEN_DOCUMENT_TREE result onto a Termux-visible real path
     * when possible: "primary:rel/path" -> /storage/emulated/0/rel/path.
     * Non-primary volumes fall back to the raw content:// tree URI (the page
     * can still use it as an opaque handle).
     * @param uri the tree URI from the system picker.
     * @returns the mapped real path or the original URI string.
     */
    fun resolvePickedPath(uri: Uri): String {
      return try {
        val docId = DocumentsContract.getTreeDocumentId(uri)
        val idx = docId.indexOf(':')
        val volume = if (idx > 0) docId.substring(0, idx) else ""
        val rel = if (idx > 0) docId.substring(idx + 1) else docId
        // M5: path sanitization — reject `..` segments/absolute paths (escape prevention); empty rel is rejected.
        if (rel.isEmpty() || rel.split("/").any { it == ".." } || rel.startsWith("/")) {
          return uri.toString()
        }
        if (volume == "primary") "/storage/emulated/0/$rel" else uri.toString()
      } catch (_: Exception) {
        uri.toString()
      }
    }
  }
}

/** JSON string literal escaping for evaluateJavascript payloads. */
internal fun jsString(value: String): String = JSONObject.quote(value)
