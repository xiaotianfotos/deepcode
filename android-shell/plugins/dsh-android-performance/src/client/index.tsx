import { useEffect, useState } from 'react'
import { percentage } from './format.ts'
interface NativePerformance { performanceSample(): string; performanceReset(): void }
interface Sample { ok: boolean; gpu?: { percent: number | null; reason?: string }; rssMiB?: number }
interface Context {
  slots: { inject(slot: string, fn: () => (() => void)): void; register(options: Record<string, unknown>, component: unknown): () => void }
  effect(fn: () => (() => void), label?: string): void
}
const key = 'dsh.android.performance.enabled'
const event = 'dsh-performance-toggle'
function bridge(): NativePerformance | undefined { return (window as unknown as { androidBridge?: NativePerformance }).androidBridge }
function read(): boolean { try { return localStorage.getItem(key) === 'true' } catch { return false } }
function toggle(enabled: boolean): void { try { localStorage.setItem(key, String(enabled)) } catch { } window.dispatchEvent(new CustomEvent(event, { detail: enabled })) }
function useEnabled(): boolean {
  const [enabled, set] = useState(read)
  useEffect(() => { const update = (e: Event) => set((e as CustomEvent<boolean>).detail); window.addEventListener(event, update); return () => window.removeEventListener(event, update) }, [])
  return enabled
}
function Overlay() {
  const enabled = useEnabled()
  const [sample, set] = useState<Sample | null>(null)
  useEffect(() => {
    if (!enabled) { set(null); return }
    const native = bridge()
    const poll = () => { try { set(native?.performanceSample ? JSON.parse(native.performanceSample()) as Sample : { ok: false }) } catch { set({ ok: false }) } }
    native?.performanceReset(); poll()
    const timer = window.setInterval(() => { if (!document.hidden) poll() }, 1000)
    return () => { clearInterval(timer); native?.performanceReset() }
  }, [enabled])
  if (!enabled) return null
  return <aside className="dsh-performance-overlay" data-plugin="android-performance" aria-label="性能调试浮层">
    <div><span>GPU</span><strong>{percentage(sample?.gpu?.percent)}</strong></div>
    {sample?.gpu?.percent == null && <small className="dsh-performance-note">{sample?.gpu?.reason ?? '等待可用指标'}</small>}
    {typeof sample?.rssMiB === 'number' && <div><span>内存</span><span>{Math.round(sample.rssMiB)} MB</span></div>}
    <button type="button" aria-label="关闭性能浮层" onClick={() => toggle(false)}>×</button>
  </aside>
}
function Settings() {
  const enabled = useEnabled()
  return <section className="dsh-performance-settings" data-plugin="performance-settings"><h2>性能调试</h2>
    <label><input type="checkbox" checked={enabled} onChange={e => toggle(e.target.checked)} /> 显示性能浮层</label>
    <p>在右上角显示实时指标。关闭后停止采样。</p>
    <p>内存为本应用可读取的同 UID 进程 RSS 总和。</p>
    <p>GPU 仅显示系统实际提供的利用率。系统未开放时显示“不可用”，不会用频率或动画帧率代替。</p>
  </section>
}
export const inject = ['slots']
export function apply(ctx: Context): void {
  ctx.effect(() => {
    const style = document.createElement('style'); style.dataset.plugin = 'android-performance'
    style.textContent = `.dsh-performance-overlay{position:fixed;top:calc(env(safe-area-inset-top,0px) + 60px);right:12px;z-index:45;min-width:154px;padding:12px 28px 12px 12px;background:#171b22ed;color:#e6edf6;border:1px solid #ffffff25;border-radius:12px;box-shadow:0 4px 16px #0003;font:12px/1.65 system-ui;pointer-events:none;font-variant-numeric:tabular-nums}.dsh-performance-overlay>div{display:flex;justify-content:space-between;gap:14px}.dsh-performance-overlay small{opacity:.65;font-size:10px}.dsh-performance-overlay button{position:absolute;right:4px;top:4px;border:0;background:transparent;color:inherit;cursor:pointer;pointer-events:auto;font-size:17px}.dsh-performance-note{display:block;max-width:170px}.dsh-performance-settings{padding:18px;line-height:1.65}.dsh-performance-settings p{opacity:.7}.dsh-performance-settings input{margin-right:8px}`
    document.head.append(style); return () => { style.remove(); bridge()?.performanceReset() }
  }, 'performance plugin lifecycle')
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'android-performance', order: 90 }, Overlay))
  ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'android-performance', order: 86, label: () => '性能调试' }, Settings))
}
