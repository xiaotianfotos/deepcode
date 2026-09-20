package com.dsharnessmobile.shell

/** Bounded, one-key learning. Pure policy so cancellation/held-key behavior can be tested. */
internal class RemoteKeyCapture(private val clock: () -> Long) {
  var id = ""; private set
  var phase = "idle"; private set
  var code = 0; private set
  var warning = ""; private set
  private var deadline = 0L
  private val held = mutableSetOf<Pair<Int, Int>>()
  fun begin(token: String) { id=token;phase="waiting";code=0;warning="";deadline=clock()+15000 }
  fun cancel(token: String = id) { if(token!=id)return;id="";phase="idle";code=0;warning="" }
  fun reset() { cancel();held.clear() }
  fun refresh() { if(phase=="waiting"&&clock()>=deadline)phase="timeout" }
  fun handle(device: Int, key: Int, down: Boolean, repeat: Int, canceled: Boolean, matches: Boolean, allowed: Boolean): Boolean {
    val pair=device to key
    if(pair in held){if(!down||canceled)held.remove(pair);return true}
    refresh()
    if(phase!="waiting"||!matches)return false
    if(!allowed){if(down)warning="此按键由系统处理，请换一个按键";return false}
    if(!down||repeat>0||canceled)return true
    held.add(pair);code=key;phase="captured";warning="";return true
  }
}
