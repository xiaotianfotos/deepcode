package com.dsharnessmobile.shell

import android.os.SystemClock
import android.view.InputDevice
import android.view.KeyEvent
import org.json.JSONArray
import org.json.JSONObject

/** Optional physical remote adapter. No global hooks, system key remaps, or microphone ownership. */
internal object RemoteInput {
  private val capture = RemoteKeyCapture { SystemClock.uptimeMillis() }
  private var captureDescriptor = ""
  private var captureName = ""
  private var config = ""
  private var enabled = false
  private var descriptor = ""
  private var bindings = emptyMap<Int, String>()
  private var until = 0L
  private val pressed = mutableSetOf<Pair<Int, Int>>()
  private var lastKey = ""
  private var seq = 0L
  private val reserved = setOf(3, 24, 25, 26, 164, 187, 19, 20, 21, 22, 219, 231)

  @Synchronized fun configure(raw: String) {
    if (raw == config) return
    config = raw; enabled = false; bindings = emptyMap(); until=0;pressed.clear();capture.cancel()
    runCatching {
      val c = JSONObject(raw)
      descriptor = c.optString("device")
      val next = linkedMapOf<Int, String>()
      for ((slot, fallback) in listOf("voice" to 135, "back" to 4, "confirm" to 66)) {
        val key = c.optInt(slot + "Key", fallback)
        val action = c.optString(slot + "Action", when(slot){"voice"->"record";"back"->"delete";else->"send"})
        require(action in setOf("record", "delete", "send", "none"))
        if (action == "none") continue
        require(key in 1..304 && key !in reserved && key !in next)
        next[key] = action
      }
      bindings = next; enabled = c.optBoolean("enabled", false)
    }
    OverlayService.instance?.let { svc -> svc.main.post { svc.refreshBallKeyFocus() } }
  }
  @Synchronized fun isEnabled(): Boolean = enabled
  @Synchronized fun lease(active: Boolean) { until = if (enabled && active) SystemClock.uptimeMillis() + 2500 else 0; if (!active) pressed.clear() }
  @Synchronized fun reset() { until = 0; pressed.clear(); capture.reset() }
  @Synchronized fun captureBegin(device: String): String {
    until=0;pressed.clear();captureDescriptor=device;captureName=""
    val id=java.util.UUID.randomUUID().toString();capture.begin(id);return id
  }
  @Synchronized fun captureCancel(id: String) { capture.cancel(id) }
  private fun matches(d: InputDevice): Boolean = d.isExternal && !d.isVirtual &&
    (if (descriptor.isNotBlank()) d.descriptor == descriptor else d.name.contains("遥控") || d.name.contains("remote", true))

  @Synchronized fun handle(event: KeyEvent, overlay: Boolean = false, dispatch: (String, Long) -> Unit): Boolean {
    val d = event.device ?: return false
    if (!overlay && event.action in listOf(KeyEvent.ACTION_DOWN, KeyEvent.ACTION_UP)) {
      val candidate=d.isExternal&&!d.isVirtual&&(if(captureDescriptor.isNotBlank())d.descriptor==captureDescriptor else d.name.contains("遥控")||d.name.contains("remote",true))
      if(capture.handle(event.deviceId,event.keyCode,event.action==KeyEvent.ACTION_DOWN,event.repeatCount,event.isCanceled,candidate,event.keyCode in 1..304 && event.keyCode !in reserved)){
        if(capture.phase=="captured")captureName=KeyEvent.keyCodeToString(capture.code)
        return true
      }
    }
    if (!matches(d)) return false
    if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0)
      lastKey = "${d.name}: ${KeyEvent.keyCodeToString(event.keyCode)} (${event.keyCode})"
    if (!enabled || (!overlay && SystemClock.uptimeMillis() >= until)) return false
    val action = bindings[event.keyCode] ?: return false
    if (event.action !in listOf(KeyEvent.ACTION_DOWN, KeyEvent.ACTION_UP)) return false
    val key = event.deviceId to event.keyCode
    if (event.action == KeyEvent.ACTION_UP) { pressed.remove(key); return true }
    if (event.isCanceled) { pressed.remove(key); return true }
    val first = pressed.add(key)
    if ((first && event.repeatCount == 0) || (!first && action == "delete" && event.repeatCount > 0)) dispatch(action, ++seq)
    return true
  }
  @Synchronized fun status(): String {
    val devices = JSONArray()
    for (id in InputDevice.getDeviceIds()) {
      val d = InputDevice.getDevice(id) ?: continue
      if (d.isExternal && !d.isVirtual) devices.put(JSONObject().put("descriptor", d.descriptor).put("name", d.name))
    }
    capture.refresh()
    val learning=JSONObject().put("id",capture.id).put("phase",capture.phase).put("keyCode",capture.code).put("keyName",captureName).put("warning",capture.warning)
    return JSONObject().put("capture",learning).put("available",true).put("enabled",enabled).put("devices", devices).put("lastKey",lastKey).toString()
  }
}
