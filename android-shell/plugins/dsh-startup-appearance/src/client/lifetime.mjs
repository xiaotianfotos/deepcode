/** Host settings are authoritative; bridge stores only the next-boot cache. */
export function bindNativeStartup(scope, native) {
  let last
  const sync = () => {
    const snap = scope.getSnapshot()
    if (snap.status !== 'ready') return
    const enabled = snap.value?.enabled === true
    if (last === enabled) return
    last = enabled
    native?.startupConfigure?.(enabled)
  }
  const off = scope.subscribe(sync)
  sync()
  return () => { off(); native?.startupConfigure?.(false) }
}
