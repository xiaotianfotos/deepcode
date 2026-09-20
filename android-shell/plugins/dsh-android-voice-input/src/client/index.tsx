import { useEffect, useState, useSyncExternalStore, useId } from 'react'
import { buildVoiceWavePath } from './waveform.ts'
import { insertion, type InputState, type TextInsertion } from './draft.ts'

interface NativeVoice {
  voiceStart(id: string): string; voiceStatus(): string; voiceStop(id: string): void
  voiceCancel(id: string): void; voiceAcknowledge(id: string): void; voiceRelease(): void
}
interface VoiceState {
  ok: boolean; id: string; phase: string; text?: string; error?: string
  elapsedMs?: number; level?: number; waveform?: number[]; waveformSamples?: number[]; silenceMs?: number; speechDetected?: boolean
}
interface Scoped { bail(subject: Scoped, event: 'slash/input-insert-text', request: TextInsertion): boolean | undefined }
interface Context {
  settingsScope: { bind(options: {namespace: string}): any }
  provide(name: string, service: unknown): void
  slots: { inject(slot: string, register: () => (() => void)): void; register(options: Record<string, unknown>, component: unknown): () => void }
  effect(setup: () => (() => void), label?: string): void
  sessions: { scope(id: string): Scoped | undefined; acquireStage?(id: string): () => void }
  conversation: { input: { for(scope: Scoped): { state: { getSnapshot(): InputState } } } }
}
function bridge(): NativeVoice | undefined { return (window as unknown as { androidBridge?: NativeVoice }).androidBridge }
const enabledEvent = 'dsh-voice-toggle'
let hostEnabled = false
function readEnabled(): boolean { return hostEnabled }
function setEnabled(value: boolean): void {
  hostEnabled = value
  if (!value) bridge()?.voiceRelease()
  window.dispatchEvent(new CustomEvent(enabledEvent, { detail: value }))
}
function useEnabled(): boolean {
  const [enabled, set] = useState(readEnabled)
  useEffect(() => { const update = (e: Event) => set((e as CustomEvent<boolean>).detail); window.addEventListener(enabledEvent, update); return () => window.removeEventListener(enabledEvent, update) }, [])
  return enabled
}
const busy = (phase: string) => ['permission', 'preparing', 'recording', 'transcribing'].includes(phase)
const idle = (): VoiceState => ({ ok: true, id: '', phase: 'idle' })

/** One scoped store serves both official slots; only this owner consumes the result. */
class VoiceSession {
  private state = idle()
  private listeners = new Set<() => void>()
  private timer: number | undefined
  private active: string | null = null
  private users = 0
  private releaseLease: (() => void) | undefined
  constructor(private insert: (text: string) => boolean, private sessionId: string, private acquire: () => (() => void)) {
    try { const text = localStorage.getItem('dsh.voice.held.' + sessionId); if (text) this.state = {ok:true,id:'',phase:'error',text,error:'有尚未插入的语音文字。'} } catch { }
  }
  retry = () => {
    if (!this.state.text || !this.tryInsert(this.state.text)) return
    this.discard()
  }
  discard = () => {
    try { localStorage.removeItem('dsh.voice.held.' + this.sessionId) } catch { }
    this.finish(); this.publish(idle())
  }
  private tryInsert(text: string) { try { return this.insert(text) } catch { return false } }
  private finish() {
    if (this.active) bridge()?.voiceAcknowledge(this.active)
    this.active = null; this.stopPolling(); this.releaseLease?.(); this.releaseLease = undefined
  }
  snapshot = () => this.state
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private publish(value: VoiceState) { this.state = value; this.listeners.forEach(fn => fn()) }
  private stopPolling() { if (this.timer !== undefined) clearInterval(this.timer); this.timer = undefined }
  attach() { this.users++; return () => { this.users-- } }
  start = () => {
    const native = bridge(); if (!readEnabled() || !native?.voiceStart || this.active || this.state.text) return
    const id = crypto.randomUUID()
    try {
      this.releaseLease = this.acquire()
      const next = JSON.parse(native.voiceStart(id)) as VoiceState
      if (!next.ok) { this.finish(); this.publish({ ...next, id, phase: 'error' }); return }
      this.active = id; this.publish(next); this.timer = window.setInterval(this.poll, 75)
    } catch { native.voiceCancel(id); this.finish(); this.publish({ ok: false, id, phase: 'error', error: '无法启动语音输入' }) }
  }
  stop = () => { if (this.active) bridge()?.voiceStop(this.active) }
  cancel = () => {
    if (this.active) bridge()?.voiceCancel(this.active)
    this.active = null; this.stopPolling(); this.releaseLease?.(); this.releaseLease = undefined; if (this.state.phase !== 'error' || !this.state.text) this.publish(idle())
  }
  private poll = () => {
    const id = this.active; if (!id) return
    try {
      const next = JSON.parse(bridge()!.voiceStatus()) as VoiceState
      if (next.id !== id) { this.cancel(); return }
      if (next.phase === 'done') {
        this.stopPolling()
        const inserted = next.text ? this.tryInsert(next.text) : false
        if (!inserted && next.text) {
          try { localStorage.setItem('dsh.voice.held.' + this.sessionId, next.text) }
          catch { this.active = id; this.publish({...next, phase:'error', error:'文字尚未保存，请先复制。'}); return }
        }
        this.finish()
        this.publish(inserted || !next.text ? idle() : { ...next, phase: 'error', error: '草稿暂不可编辑，转录保留在这里，可复制后使用。' })
      } else if (['error', 'canceled'].includes(next.phase)) {
        this.active = null; this.stopPolling(); this.publish(next.phase === 'canceled' ? idle() : next); this.releaseLease?.(); this.releaseLease = undefined
      } else this.publish(next)
    } catch { this.cancel(); this.publish({ ok: false, id, phase: 'error', error: '语音连接已中断，请重试' }) }
  }
}
const css = `
.dsh-voice-control{display:inline-flex;align-items:center}
.dsh-voice-mic{border:0;background:transparent;color:inherit;width:40px;height:40px;border-radius:50%;display:grid;place-items:center;cursor:pointer}
.dsh-voice-mic:hover{background:color-mix(in srgb,currentColor 10%,transparent)}.dsh-voice-mic:disabled{opacity:.4;cursor:default}.dsh-voice-mic[data-recording=true]{background:#0d948825;color:#2dd4bf}
.dsh-voice-panel{box-sizing:border-box;width:calc(100% - 2 * var(--dsh-composer-side-clearance,16px));max-width:var(--dsh-composer-card-max-width,868px);margin:0 auto;border:1px solid color-mix(in srgb,#4fd8e8 18%,var(--dsw-alias-border-l2));border-radius:16px;background:var(--dsw-specific-input-major,#27272a);color:var(--dsw-alias-label-primary,#e4e4e7);font:12px/1.5 system-ui}
.dsh-voice-strip{display:grid;grid-template-columns:auto minmax(60px,1fr) auto;align-items:center;gap:16px;min-height:52px;padding:0 12px 0 16px}.dsh-voice-status{font-size:11px;font-weight:600;color:#4fd8e8;white-space:nowrap}.dsh-voice-wave{height:40px;min-width:0;opacity:.9}.dsh-voice-wave svg{display:block;width:100%;height:100%;overflow:hidden}.dsh-voice-wave path{fill:none;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke;transition:d 80ms linear,opacity 120ms ease}
.dsh-voice-actions{display:flex;align-items:center;gap:4px}.dsh-voice-actions button{width:36px;height:36px;border:0;border-radius:50%;background:transparent;color:var(--dsw-alias-label-secondary,#a1a1aa);display:grid;place-items:center;cursor:pointer}.dsh-voice-actions button:hover{background:var(--dsw-alias-interactive-bg-hover,#ffffff0d)}.dsh-voice-actions .dsh-voice-finish{color:#4fd8e8}.dsh-voice-timer{min-width:32px;text-align:right;margin-right:6px;font:11px ui-monospace,monospace;color:var(--dsw-alias-label-tertiary,#8c8c93)}
.dsh-voice-error{padding:10px 16px;color:var(--dsw-alias-label-secondary,#a1a1aa)}.dsh-voice-result{white-space:pre-wrap;user-select:text;max-height:150px;overflow:auto;margin-top:8px}.dsh-voice-settings{padding:18px;line-height:1.65}.dsh-voice-settings p{opacity:.75}
@media(max-width:480px){.dsh-voice-strip{gap:8px;padding-left:12px}.dsh-voice-timer{display:none}}

`
interface Props { sessionId: string; voice: VoiceSession; useInput<T>(selector: (s: InputState) => T): T }
function useVoice(voice: VoiceSession) {
  useEffect(() => voice.attach(), [voice])
  return useSyncExternalStore(voice.subscribe, voice.snapshot)
}
function Microphone({ voice, useInput }: Props) {
  const state = useVoice(voice), phase = useInput(s => s.phase), recording = state.phase === 'recording'
  const label = recording ? '停止录音并转成文字' : '语音输入'
  return <div className="dsh-voice-control" data-plugin="android-voice-input"><button type="button" className="dsh-voice-mic" aria-label={label} title={label} data-recording={recording}
    disabled={!bridge()?.voiceStart || (!recording && (busy(state.phase) || phase !== 'plain'))} onClick={recording ? voice.stop : voice.start}>
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 11v1a7 7 0 0 0 14 0v-1M12 19v3M8 22h8" /></svg>
  </button></div>
}
function Panel({ voice }: Props) {
  const state = useVoice(voice), recording = state.phase === 'recording', uid = useId().replace(/:/g, '')
  if (state.phase === 'idle' || state.phase === 'canceled') return null
  const title = state.phase === 'permission' ? '允许麦克风' : state.phase === 'preparing' ? '准备中' : recording ? '正在聆听' : state.phase === 'transcribing' ? '转录中' : '语音输入'
  const remaining = Math.max(0, (5000 - (state.silenceMs ?? 0)) / 1000)
  const source = recording ? state.waveformSamples ?? Array(72).fill(0) : Array(72).fill(0)
  const energy = recording ? Math.max(.05, state.level ?? 0) : .03
  const paths = [[0,1.45,0],[-8,.9,11],[8,.82,23]].map(([offset,scale,shift]) => buildVoiceWavePath(source, energy, offset, scale, shift))
  return <section className="dsh-voice-panel" data-plugin="voice-waveform" aria-label="语音输入波形">
    <div className="dsh-voice-strip"><span className="dsh-voice-status" role="status">{title}</span>
      <div className="dsh-voice-wave" aria-hidden="true"><svg viewBox="0 0 360 76" preserveAspectRatio="none"><defs>
        <linearGradient id={`${uid}-main`}><stop offset="0%" stopColor="#4fd8e8" stopOpacity=".1"/><stop offset="30%" stopColor="#4fd8e8" stopOpacity=".85"/><stop offset="62%" stopColor="#93c5fd" stopOpacity=".75"/><stop offset="100%" stopColor="#a5b4fc" stopOpacity=".12"/></linearGradient>
        <linearGradient id={`${uid}-upper`}><stop offset="0%" stopColor="#93c5fd" stopOpacity=".06"/><stop offset="50%" stopColor="#93c5fd" stopOpacity=".48"/><stop offset="100%" stopColor="#4fd8e8" stopOpacity=".06"/></linearGradient>
        <linearGradient id={`${uid}-lower`}><stop offset="0%" stopColor="#a5b4fc" stopOpacity=".06"/><stop offset="50%" stopColor="#a5b4fc" stopOpacity=".42"/><stop offset="100%" stopColor="#4fd8e8" stopOpacity=".06"/></linearGradient>
      </defs>{paths.map((d,i)=><path key={i} d={d} stroke={`url(#${uid}-${['main','upper','lower'][i]})`} strokeWidth={i===0?1.25:.9} opacity={i===0?.85:.52}/>)}</svg></div>
      <div className="dsh-voice-actions">{recording&&<span className="dsh-voice-timer" title="连续 5 秒无语音自动结束">{remaining.toFixed(1)}s</span>}
        <button type="button" aria-label={busy(state.phase) ? '取消语音输入' : '关闭语音提示'} title="取消" onClick={voice.cancel}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="m6 6 12 12M6 18 18 6"/></svg></button>
        {recording&&<button type="button" className="dsh-voice-finish" aria-label="完成录音" title="完成录音" onClick={voice.stop}><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m5 12 4 4L19 6"/></svg></button>}
      </div>
    </div>
    {state.phase==='error'&&<div className="dsh-voice-error">{state.error}{state.text&&<div className="dsh-voice-result">{state.text}<div><button onClick={voice.retry}>插入草稿</button> <button onClick={voice.discard}>丢弃文字</button></div></div>}</div>}
  </section>
}

function MicrophoneEntry(props: Props) { return useEnabled() ? <Microphone {...props} /> : null }
function PanelEntry(props: Props) { return useEnabled() ? <Panel {...props} /> : null }
export const inject = ['slots', 'sessions', 'conversation', 'settingsScope']
export function apply(ctx: Context): void {
  const sessions = new Map<string, VoiceSession>()
  const settings = ctx.settingsScope.bind({namespace:'speech-services'})
  ctx.effect(() => {
    let dead=false, migrating=false
    const update=()=>{
      const snap=settings.getSnapshot()
      setEnabled(snap.status==='ready' && snap.value?.enabled===true && snap.value?.asrEnabled===true)
      const old=localStorage.getItem('dsh.android.voice.enabled')
      if(!dead&&!migrating&&snap.status==='ready'&&snap.writable&&old!==null&&!Object.prototype.hasOwnProperty.call(snap.user??{},'asrEnabled')){
        migrating=true
        void settings.set('asrEnabled',old!=='false').then(()=>{localStorage.removeItem('dsh.android.voice.enabled')}).catch(()=>{}).finally(()=>{migrating=false})
      }
    }
    const off=settings.subscribe(update);update()
    return()=>{dead=true;off();setEnabled(false)}
  },'Default speech service settings')
  const inject = (sessionId: string) => {
    let voice = sessions.get(sessionId)
    if (!voice) { voice = new VoiceSession(text => {
      const scope = ctx.sessions.scope(sessionId); if (!scope) return false
      const request = insertion(ctx.conversation.input.for(scope).state.getSnapshot(), text)
      return request ? scope.bail(scope, 'slash/input-insert-text', request) === true : false
    }, sessionId, () => ctx.sessions.acquireStage?.(sessionId) ?? (() => {})); sessions.set(sessionId, voice) }
    return { sessionId, voice }
  }
  ctx.provide('androidVoice', {
    for: (id: string) => inject(id).voice,
    enabled: readEnabled,
    leave: (id: string) => { const voice = sessions.get(id); if (!voice) return; const phase = voice.snapshot().phase; if (phase === 'recording') voice.stop(); else if (phase === 'preparing' || phase === 'permission') voice.cancel() },
    busy: () => [...sessions.values()].some(v => busy(v.snapshot().phase)),
    held: () => Object.keys(localStorage).filter(k => k.startsWith('dsh.voice.held.')).map(k => ({sessionId:k.slice('dsh.voice.held.'.length),text:localStorage.getItem(k)}))
  })
  ctx.effect(() => { const s = document.createElement('style'); s.dataset.plugin = 'android-voice-input'; s.textContent = css; document.head.append(s); return () => { sessions.forEach(voice => voice.cancel()); sessions.clear(); s.remove(); bridge()?.voiceRelease() } }, 'voice plugin lifecycle')
  ctx.slots.inject('conversation.input.right', () => ctx.slots.register({ name: 'conversation.input.right', id: 'android-voice-input', order: 90, inject }, MicrophoneEntry))
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({ name: 'conversation.input.dock', id: 'android-voice-waveform', order: 99, inject }, PanelEntry))
}
