import {useState, useSyncExternalStore} from 'react'
import {bindNativeStartup} from './lifetime.mjs'
export const inject = ['slots', 'settingsScope']
export function apply(ctx: any) {
  const scope = ctx.settingsScope.bind({namespace: 'startup-appearance'})
  const native = (window as any).androidBridge
  ctx.effect(() => bindNativeStartup(scope, native), 'native startup appearance')
  function Settings() {
    const snap: any = useSyncExternalStore((f: any) => scope.subscribe(f), () => scope.getSnapshot())
    const [busy, setBusy] = useState(false), [error, setError] = useState('')
    async function toggle(enabled: boolean) {
      setBusy(true); setError('')
      try { await scope.set('enabled', enabled) }
      catch (e: any) { setError(e.message) }
      finally { setBusy(false) }
    }
    return <section data-plugin="startup-appearance-settings" style={{padding: '20px 0'}}>
      <h2 style={{fontSize: 18}}>启动动画</h2>
      <label style={{display: 'flex', gap: 12, alignItems: 'center', minHeight: 48}}>
        <input type="checkbox" aria-label="启用海底启动动画" checked={snap.value?.enabled === true}
          disabled={busy || snap.status !== 'ready' || !snap.writable || !native?.startupConfigure}
          onChange={e => void toggle(e.target.checked)}/>
        深海微光
      </label>
      <p style={{fontSize: 13, opacity: .65, lineHeight: 1.7}}>启动时播放海底鲸鱼动画，静音循环。准备就绪后直接进入聊天。关闭后恢复默认加载画面。</p>
      {!native?.startupConfigure && <p>需要支持此功能的 Android 版本。</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  }
  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({name: 'settings.plugin.item', key: 'startup-appearance', order: 91}, Settings))
}
