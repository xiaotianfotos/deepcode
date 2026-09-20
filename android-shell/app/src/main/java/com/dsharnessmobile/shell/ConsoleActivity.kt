package com.dsharnessmobile.shell

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.graphics.Color
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebSettings
import android.webkit.WebView
import androidx.activity.ComponentActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

/**
 * Built-in console: a WebView loads assets/console.html (terminal-style UI) while
 * ConsoleSession spawns the snapshot bash (env matching the engine) → commands via the stdin pipe,
 * output returned to the UI through the consoleBridge JS interface. Works even when the engine is
 * down (diagnostics scenarios).
 */
class ConsoleActivity : ComponentActivity() {

  private lateinit var webView: WebView
  private val session = ConsoleSession(this)
  private val handler = android.os.Handler(android.os.Looper.getMainLooper())
  private var sessionStarted = false
  private var pageReady = false
  private var pendingTopInset = 0f
  private var pendingBottomInset = 0f
  private var pendingImeInset = 0f

  /** Last status text (re-pushed on onPageFinished; replays status lost before page load). */
  private var lastStatus: String? = null

  private val sessionListener = object : ConsoleSession.Listener {
    override fun onOutput(text: String) {
      handler.post {
        webView.evaluateJavascript("window.__consoleAppend(" + jsString(text) + ")", null)
      }
    }

    override fun onStatus(text: String) {
      lastStatus = text
      handler.post { pushStatus(text) }
    }

    override fun onExit(code: Int) {
      lastStatus = "bash 已退出（code $code）"
      handler.post { pushStatus(lastStatus!!) }
    }
  }

  /** Push status (main thread only). */
  private fun pushStatus(text: String) {
    webView.evaluateJavascript("window.__consoleStatus(" + jsString(text) + ")", null)
  }

  private fun pushInsets() {
    if (!pageReady || !::webView.isInitialized) return
    webView.evaluateJavascript(
      "window.__consoleInsets && window.__consoleInsets($pendingTopInset,$pendingBottomInset,$pendingImeInset)",
      null,
    )
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    WindowCompat.setDecorFitsSystemWindows(window, false)
    window.statusBarColor = Color.parseColor("#080A09")
    window.navigationBarColor = Color.parseColor("#080A09")
    WindowInsetsControllerCompat(window, window.decorView).apply {
      isAppearanceLightStatusBars = false
      isAppearanceLightNavigationBars = false
    }
    webView = WebView(this).apply {
      id = View.generateViewId()
      setBackgroundColor(Color.parseColor("#080A09"))
      layoutParams = ViewGroup.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT,
      )
    }
    webView.settings.apply {
      javaScriptEnabled = true
      domStorageEnabled = true
      allowFileAccess = false
      if (android.os.Build.VERSION.SDK_INT >= 29) {
        @Suppress("DEPRECATION")
        forceDark = WebSettings.FORCE_DARK_AUTO
      }
    }
    // Re-push status after page load: bash may be ready in onStart while console.html's
    // JS bridge is defined later — early evaluateJavascript calls are silently dropped.
    webView.webViewClient = object : android.webkit.WebViewClient() {
      override fun onPageFinished(view: android.webkit.WebView, url: String) {
        super.onPageFinished(view, url)
        pageReady = true
        lastStatus?.let { pushStatus(it) }
        pushInsets()
      }
    }
    webView.addJavascriptInterface(ConsoleBridge(), "consoleBridge")
    setContentView(webView)
    ViewCompat.setOnApplyWindowInsetsListener(webView) { _, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
      val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
      val density = resources.displayMetrics.density
      pendingTopInset = bars.top / density
      pendingBottomInset = bars.bottom / density
      pendingImeInset = ime.bottom / density
      pushInsets()
      insets
    }
    webView.loadUrl("file:///android_asset/console.html")
  }

  override fun onStart() {
    super.onStart()
    if (sessionStarted) return
    sessionStarted = session.start(sessionListener)
  }

  override fun onDestroy() {
    session.destroy()
    webView.destroy()
    super.onDestroy()
  }

  /** JS bridge: command submission + engine status query. */
  inner class ConsoleBridge {
    @JavascriptInterface
    fun submit(command: String) {
      session.writeCommand(command)
    }

    @JavascriptInterface
    fun engineStatus(): String = EngineProbe.check().toString()

    @JavascriptInterface
    fun close() {
      handler.post { finish() }
    }

    @JavascriptInterface
    fun restart() {
      handler.post {
        sessionStarted = session.restart(sessionListener)
      }
    }

    @JavascriptInterface
    fun copyText(text: String): Boolean {
      return try {
        val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        cm.setPrimaryClip(ClipData.newPlainText("dsh-console", text))
        true
      } catch (_: Exception) {
        false
      }
    }

    @JavascriptInterface
    fun ready(): Boolean = session.isAlive()
  }
}
