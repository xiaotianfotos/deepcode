package com.dsharnessmobile.shell

import android.content.Context
import android.hardware.input.InputManager
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.InputDevice
import android.view.KeyEvent
import org.json.JSONArray
import org.json.JSONObject

/** Platform button events only. All session/record/delete semantics belong to TS plugins. */
class GamepadInput(context: Context, private val emit: (String) -> Unit) : InputManager.InputDeviceListener {
  private val manager = context.getSystemService(InputManager::class.java)
  private val handler = Handler(Looper.getMainLooper())
  private var epoch = 0
  private var seq = 0L
  private var until = 0L
  private var device: Int? = null
  private val down = mutableSetOf<Int>()
  private val buttons = mapOf(97 to "east", 104 to "l2", 102 to "l1", 103 to "r1", 100 to "north", 99 to "west")

  init { manager.registerInputDeviceListener(this, handler) }

  fun lease(nextEpoch: Int, enabled: Boolean) {
    if (!enabled || epoch != nextEpoch) reset()
    epoch = nextEpoch
    until = if (enabled) SystemClock.uptimeMillis() + 2500 else 0
  }

  fun reset() {
    until = 0
    down.clear()
    device = null
    emit(JSONObject().put("kind", "reset").put("epoch", epoch).put("seq", ++seq).toString())
  }

  fun handle(event: KeyEvent): Boolean {
    val button = buttons[event.keyCode] ?: return false
    if (!event.isFromSource(InputDevice.SOURCE_GAMEPAD)) return false
    if (SystemClock.uptimeMillis() >= until) {
      if (until != 0L) reset()
      return false
    }
    if (device != null && device != event.deviceId) return false
    if (event.action != KeyEvent.ACTION_DOWN && event.action != KeyEvent.ACTION_UP) return false
    device = event.deviceId
    val pressed = event.action == KeyEvent.ACTION_DOWN
    if (pressed) down.add(event.keyCode) else down.remove(event.keyCode)
    emit(JSONObject().put("kind", "button").put("source", "android")
      .put("deviceId", event.deviceId.toString()).put("epoch", epoch).put("seq", ++seq)
      .put("button", button).put("pressed", pressed).put("repeat", event.repeatCount > 0)
      .put("timestampMs", event.eventTime).toString())
    return true
  }

  fun status(): String {
    val devices = JSONArray()
    for (id in InputDevice.getDeviceIds()) {
      val d = InputDevice.getDevice(id) ?: continue
      if (d.supportsSource(InputDevice.SOURCE_GAMEPAD)) devices.put(JSONObject().put("id", id).put("name", d.name))
    }
    return JSONObject().put("available", true).put("devices", devices).toString()
  }

  override fun onInputDeviceAdded(deviceId: Int) = Unit
  override fun onInputDeviceChanged(deviceId: Int) = Unit
  override fun onInputDeviceRemoved(deviceId: Int) { if (device == deviceId) reset() }
  fun close() { reset(); manager.unregisterInputDeviceListener(this) }
}
