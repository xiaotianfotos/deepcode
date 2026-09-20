import {useEffect,useRef,useState,useSyncExternalStore} from 'react'
import {bindRemote,defaults,validate} from './policy.mjs'
import {learnKey} from './capture.mjs'
import {styles} from './style.ts'
export const inject=['slots','settingsScope','sessions']
export function apply(ctx:any){
 const scope=ctx.settingsScope.bind({namespace:'xiaomi-remote'}),native=(window as any).androidBridge
 const visible=(el:any)=>!!el?.getClientRects().length
 const lane=()=>[...document.querySelectorAll('[data-deck-lane][data-active="true"]')].find(visible)
 const surface=()=>lane()||document
 const target=()=>lane()?.getAttribute('data-deck-lane')||ctx.sessions.list.getSnapshot().current
 const available=()=>document.visibilityState==='visible'&&document.hasFocus()&&!!target()
  &&![...document.querySelectorAll('[role="dialog"],dialog[open],[aria-modal="true"],[data-slot="settings.close"]')].some(visible)
  &&[...surface().querySelectorAll('[contenteditable="true"]')].some(visible)
 // The standard input adapter is optional. Its removal revokes the native lease.
 ctx.inject(['deckInput'],(child:any)=>child.effect(()=>bindRemote(scope,native,available,(action:string)=>{
  const id=target();if(!id)return
  const editor=child.deckInput.for(id)
  if(editor.composing()||editor.state.getSnapshot().phase!=='plain')return
  const mic=[...surface().querySelectorAll<HTMLButtonElement>('.dsh-voice-mic')].find(visible)
  if(action==='record'){if(mic&&!mic.disabled)mic.click();return}
  if(action==='delete'){if(!surface().contains(document.activeElement)||!(document.activeElement as HTMLElement)?.isContentEditable)editor.focus(true);editor.deleteBackward();return}
  if(mic?.dataset.recording==='true'||mic?.disabled)return
  editor.send()
 },window),'remote input lease'))
 function Settings(){
  const snap:any=useSyncExternalStore((f:any)=>scope.subscribe(f),()=>scope.getSnapshot())
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState<any>({})
  const c={...defaults,...snap.value}
  const [learning,setLearning]=useState(''),[notice,setNotice]=useState('')
  const cancelCapture=useRef<null|(()=>void)>(null)
  const stopLearning=()=>{cancelCapture.current?.();cancelCapture.current=null;setLearning('')}
  useEffect(()=>()=>{cancelCapture.current?.()},[])
  useEffect(()=>{stopLearning()},[c.device,c.enabled,snap.status])
  const record=(key:string,label:string)=>{
   stopLearning();setError('');setNotice('');setLearning(key)
   try{cancelCapture.current=learnKey(native,c.device,async(code:number)=>{
    cancelCapture.current=null;setLearning('')
    const current=scope.getSnapshot()
    if(current.status!=='ready'||!current.writable)return
    const warning=validate({...defaults,...current.value,[key+'Key']:code})
    if(warning){setError(warning==='三个映射不能使用相同键码'?'这个按键已用于另一项，请换一个按键':warning);return}
    setBusy(true)
    try{await scope.set(key+'Key',code);setNotice(label+'已录入')}catch(e:any){setError(e.message)}finally{setBusy(false)}
   },(reason:string)=>{cancelCapture.current=null;setLearning('');if(reason==='timeout')setNotice('没有收到按键，请重新录入');else if(reason==='error')setError('按键录入中断，请重试')},setError,window)}
   catch(e:any){setLearning('');setError(e.message)}
  }
  useEffect(()=>{const update=()=>{try{setStatus(JSON.parse(native?.remoteStatus?.()||'{}'))}catch{}};update();const t=setInterval(update,700);return()=>clearInterval(t)},[])
  async function set(key:string,value:any){const warning=validate({...c,[key]:value});if(warning){setError(warning);return}setBusy(true);setError('');try{await scope.set(key,value)}catch(e:any){setError(e.message)}finally{setBusy(false)}}
  const bindingLabel=(code:number)=>{
   let name='';try{name=native?.remoteKeyName?.(code)||({4:'BACK',66:'ENTER',135:'F5'} as Record<number,string>)[code]||''}catch{}
   return (name?name+' · ':'')+'键码 '+code
  }
  const disabled=busy||snap.status!=='ready'||!snap.writable||!native?.remoteConfigure
  return <section className="dsh-remote" data-plugin="xiaomi-remote-settings"><style>{styles}</style>
   <div className="rm-head"><div><h2>小米遥控器</h2><p>用三个按键完成说话、修改和发送。</p></div>
    <label className="rm-switch"><input type="checkbox" aria-label="启用小米遥控器" disabled={disabled} checked={c.enabled} onChange={e=>void set('enabled',e.target.checked)}/><span/></label>
   </div>
   <div className="rm-card"><div className="rm-device"><div><h3>连接设备</h3><p>{(status.devices||[]).filter((d:any)=>/遥控|remote/i.test(d.name)).map((d:any)=>d.name).join('、')||'未检测到遥控器'}</p></div>
    <select aria-label="遥控器设备" value={c.device} disabled={disabled} onChange={e=>void set('device',e.target.value)}><option value="">自动识别遥控器</option>{(status.devices||[]).map((d:any)=><option key={d.descriptor} value={d.descriptor}>{d.name}</option>)}{c.device&&!(status.devices||[]).some((d:any)=>d.descriptor===c.device)&&<option value={c.device}>已选择的设备（未连接）</option>}</select>
   </div></div>
   <h3 className="rm-section">按键映射</h3>
   <div className="rm-card">{([['voice','语音键'],['back','返回键'],['confirm','确认键']] as const).map(([key,label])=><div className="rm-row" key={key}>
    <strong>{label}</strong><div className="rm-binding"><span className="rm-bound-key" aria-label={label+'已绑定键码'}>{bindingLabel(c[key+'Key'])}</span><button type="button" className={'rm-learn'+(learning===key?' is-learning':'')} aria-label={'录入'+label} aria-pressed={learning===key} disabled={disabled||!native?.remoteCaptureBegin||!!learning&&learning!==key} onClick={()=>learning===key?stopLearning():record(key,label)}>{learning===key?'取消录入':'重新录入'}</button></div>
    <select aria-label={label+'动作'} value={c[key+'Action']} disabled={disabled||!!learning} onChange={e=>void set(key+'Action',e.target.value)}><option value="record">开始 / 结束语音</option><option value="delete">退格删除</option><option value="send">回车发送</option><option value="none">不处理</option></select>
   </div>)}</div>
   <div className="rm-capture-hint" role="status" aria-live="polite">{learning?'请按一下遥控器上的'+({voice:'语音键',back:'返回键',confirm:'确认键'} as any)[learning]+'，15 秒内有效。录入时不会执行该键的动作。':notice||'点击“重新录入”，再按一下遥控器上的对应按键。'}</div>
   <p className="rm-note">聊天中按语音键开始或结束录音，转录后按确认发送。桌面说完停顿 5 秒自动发送，不需要删除或确认。</p>
   <p>桌面展开后再收起小球，仍可按遥控器录音。触摸其他应用后需重新点开、收起小球恢复按键焦点，无需无障碍权限。音量、方向键不映射。</p>
   <details><summary>按键检测与说明</summary><p className="rm-diagnostic">最近按键：{status.lastKey||'请按遥控器按键'}</p><p>按键自动识别，不需要填写键码。长按返回可连续删除，长按语音或确认不会重复触发。</p></details>
   {!native?.remoteConfigure&&<p>需要支持遥控器输入的 Android 版本。</p>}{error&&<p role="alert" className="rm-error">{error}</p>}
  </section>
 }
 ctx.slots.inject('settings.plugin.item',()=>ctx.slots.register({name:'settings.plugin.item',key:'xiaomi-remote',order:86},Settings))
 ctx.effect(()=>()=>{native?.remoteLease?.(false);native?.remoteConfigure?.('{"enabled":false}')},'remote plugin disposal')
}
