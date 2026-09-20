package com.dsharnessmobile.shell

import android.content.Context
import android.util.Log
import java.io.File

/**
 * Console session: spawns the snapshot bash (env matching the engine: PATH/LD_LIBRARY_PATH/
 * HOME/DSH_HOME/TERMUX_*), writes commands to stdin, reads merged stdout/stderr on a background
 * thread, and streams output back to the UI via a Listener. Works even when the engine is not
 * running (for diagnosing engine startup failures); the process dies with the Activity.
 *
 * Non-PTY interaction (bash -i): no job-control prompts, commands run line by line; full PTY
 * (script -q -c bash) is planned for a later iteration.
 */
class ConsoleSession(private val context: Context) {

  interface Listener {
    /** Output chunk (\r collapsed, bell ignored); callback on any thread. */
    fun onOutput(text: String)
    /** Status text (startup/exit); callback on any thread. */
    fun onStatus(text: String)
    /** bash process exit code. */
    fun onExit(code: Int)
  }

  private var process: Process? = null
  private var closed = false
  private var generation = 0

  /** Start bash; on failure report the reason via listener.onStatus and return false. */
  fun start(listener: Listener): Boolean {
    val engineManager = EngineManager(context, EngineManager.ensurePickToken())
    val bash = File(engineManager.usrDir, "bin/bash")
    if (!bash.exists()) {
      listener.onStatus("快照缺失（usr/bin/bash 不存在），无法打开控制台")
      return false
    }
    // Exec-bit fallback: some devices/filesystems lose the exec bit after extraction (execve → EACCES,
    // "Permission denied"). The tar mode is theoretically preserved; this is an idempotent hardening step.
    try {
      bash.setExecutable(true, false)
    } catch (t: Throwable) {
      Log.w(TAG, "bash setExecutable failed: " + (t.message ?: t.javaClass.simpleName))
    }
    val gen = ++generation
    return try {
      fun build(argv: List<String>): ProcessBuilder =
        ProcessBuilder(argv).also { p ->
          p.environment().putAll(engineManager.shellEnv())
          p.environment()["PS1"] = "dsh:\\w$ "
          p.redirectErrorStream(true)
        }
      val argv = listOf(bash.absolutePath, "-i")
      // Same fallback as the engine: Android 15/16 and some OEM systems (Honor/Huawei, measured)
      // forbid the app domain from exec'ing an app-data ELF directly (EACCES Permission denied);
      // loading via /system/bin/linker64 matches the Android system-lib mechanism and always works.
      val proc = try {
        build(argv).start()
      } catch (e: java.io.IOException) {
        Log.w(TAG, "console: direct exec denied, falling back to linker64: " + e.message)
        build(listOf("/system/bin/linker64") + argv).start()
      }
      process = proc
      val reader = Thread {
        try {
          proc.inputStream.bufferedReader().use { r ->
            val sb = StringBuilder()
            while (true) {
              val c = r.read()
              if (c < 0) break
              // Collapse \r to \n (output carries CR without PTY); ignore bell (avoids UI noise).
              if (c == '\r'.code) {
                sb.append('\n')
              } else if (c != '\u0007'.code) {
                sb.append(c.toChar())
              }
              // Line buffering: small output (echo etc.) must not wait for the 4096 threshold —
              // on-device measurement showed whole-block buffering stalls output until the next chunk/EOF.
              if (c == '\n'.code || sb.length >= 4096) {
                val chunk = sb.toString()
                sb.setLength(0)
                if (generation == gen) listener.onOutput(chunk)
              }
            }
            if (sb.isNotEmpty() && generation == gen) listener.onOutput(sb.toString())
          }
        } catch (t: Throwable) {
          if (!closed) Log.w(TAG, "console reader ended: " + (t.message ?: t.javaClass.simpleName))
        }
        // destroy() race: after bash closes stdout on SIGTERM (read hits EOF) the process may not have
        // fully exited yet — exitValue() then throws IllegalThreadStateException (measured when the app
        // is killed). Report as exited, or mark -1.
        val code = try {
          proc.exitValue()
        } catch (_: IllegalThreadStateException) {
          -1
        }
        if (generation == gen) listener.onExit(code)
      }
      reader.isDaemon = true
      reader.start()
      listener.onStatus("bash 已启动（快照 Termux 环境）")
      true
    } catch (t: Throwable) {
      LogCollector.log(TAG, "console start FAILED: " + (t.message ?: t.javaClass.simpleName))
      listener.onStatus("控制台启动失败：" + (t.message ?: t.javaClass.simpleName))
      false
    }
  }

  /** Write one command (appends \n). */
  fun writeCommand(cmd: String) {
    val proc = process ?: return
    try {
      proc.outputStream.write((cmd + "\n").toByteArray(Charsets.UTF_8))
      proc.outputStream.flush()
    } catch (t: Throwable) {
      Log.w(TAG, "console write failed: " + (t.message ?: t.javaClass.simpleName))
    }
  }

  fun isAlive(): Boolean {
    val proc = process ?: return false
    return try {
      proc.exitValue()
      false
    } catch (_: IllegalThreadStateException) {
      true
    }
  }

  fun restart(listener: Listener): Boolean {
    generation += 1
    destroy()
    closed = false
    return start(listener)
  }

  /** Terminate the session (Activity destroyed). */
  fun destroy() {
    closed = true
    process?.destroy()
    process = null
  }

  companion object {
    private const val TAG = "dsh-console"
  }
}
