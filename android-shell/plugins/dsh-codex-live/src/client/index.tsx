import {useEffect,useState,useSyncExternalStore} from 'react'
import {progressComponent,isCodex} from './progress'
import {followLiveOverlay} from './overlay-focus.mjs'

const namespace='codex-live'
const bridge=()=> (window as any).androidBridge
const idle={phase:'idle',message:''}
export const inject=['slots','sessions','settingsScope']

export function apply(ctx:any){
 const settings=ctx.settingsScope.bind({namespace})
 ctx.effect(()=>followLiveOverlay(ctx,settings,isCodex),'GPT Live desktop entry')
 const configSubscribe=(fn:()=>void)=>settings.subscribe(fn),configSnapshot=()=>settings.getSnapshot()
 const listSubscribe=(fn:()=>void)=>ctx.sessions.list.subscribe(fn),listSnapshot=()=>ctx.sessions.list.getSnapshot()
 let state:any=idle,timer:ReturnType<typeof setInterval>|undefined,dead=false
 const listeners=new Set<()=>void>()
 const publish=(value:any)=>{state=value;listeners.forEach(fn=>fn())}
 const store={getSnapshot:()=>state,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>listeners.delete(fn)}}
 const stopPolling=()=>{if(timer!==undefined)clearInterval(timer);timer=undefined}
 const poll=()=>{
  if(dead)return
  try{publish(JSON.parse(bridge()?.liveVoiceStatus?.()??'{}'))}catch{}
  if(!['connecting','listening','working'].includes(state.phase))stopPolling()
 }
 const watchNative=()=>{if(dead||timer!==undefined)return;poll();if(['connecting','listening','working'].includes(state.phase))timer=setInterval(poll,600)}
 const refresh=()=>{if(settings.getSnapshot().value?.enabled===false){stopPolling();return};watchNative()}
 ctx.effect(()=>{
  const dispose=settings.subscribe(refresh)
  const visible=()=>{if(document.visibilityState==='visible')refresh()}
  document.addEventListener('visibilitychange',visible);window.addEventListener('focus',refresh)
  refresh()
  return()=>{dead=true;dispose();stopPolling();listeners.clear();document.removeEventListener('visibilitychange',visible);window.removeEventListener('focus',refresh);bridge()?.liveVoiceRelease?.()}
 },'GPT Live UI lifetime')
 // Migrate the previous shared voice switch only when Host has no user value.
 ctx.effect(()=>{
  let canceled=false,migrating=false
  const migrate=async()=>{
   const s=settings.getSnapshot();if(canceled||migrating||localStorage.getItem('dsh.codex-live.migrated')==='1'||s.status!=='ready'||!s.writable)return
   if(Object.prototype.hasOwnProperty.call(s.user??{},'enabled'))return
   const old=localStorage.getItem('dsh.android.voice.enabled');if(old===null)return
   migrating=true
   try{await settings.set('enabled',old!=='false');if(!canceled&&settings.getSnapshot().value?.enabled===(old!=='false'))localStorage.setItem('dsh.codex-live.migrated','1')}finally{migrating=false}
  }
  const off=settings.subscribe(()=>{void migrate().catch(()=>{})});void migrate().catch(()=>{})
  return()=>{canceled=true;off()}
 },'GPT Live preference migration')
 function Entry({sessionId}:{sessionId:string}){
  const config=useSyncExternalStore(configSubscribe,configSnapshot)
  const list=useSyncExternalStore(listSubscribe,listSnapshot) as any
  const live=useSyncExternalStore(store.subscribe,store.getSnapshot)
  const [error,setError]=useState('')
  const session=list.byId[sessionId],selection=session?.projectionValues?.modelSelection
  const codex=isCodex(session)
  useEffect(()=>{
   if(config.status!=='ready'||!config.value?.enabled||!codex)return
   let disposed=false,pending=false
   const sync=async()=>{
    if(pending||disposed)return;pending=true
    try{
     const info=await fetch('/api/android/codex/live').then(r=>r.json())
     if(disposed)return
     if(!info.enabled||!info.available)return
     const response=await fetch('/api/android/codex/live',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'history',sessionId,csrf:info.csrf})})
     const result=await response.json();if(!response.ok||result.error)throw Error(result.error??'语音记录同步失败')
    }catch(e){if(!disposed)setError((e as Error).message)}finally{pending=false}
   }
   const visible=()=>{if(document.visibilityState==='visible')void sync()}
   void sync();document.addEventListener('visibilitychange',visible)
   return()=>{disposed=true;document.removeEventListener('visibilitychange',visible)}
  },[sessionId,config.status,config.value?.enabled,codex,live.phase==='closed'])
  if(config.status!=='ready'||!config.value?.enabled||!codex||!bridge()?.liveVoiceStart)return null
  const active=['connecting','listening','working'].includes(live.phase),mine=active&&live.sessionId===sessionId
  const toggle=()=>{
   setError('')
   if(active){if(mine){bridge().liveVoiceStop();poll()}else setError('另一个会话正在使用 GPT Live，请先结束。');return}
   try{const result=JSON.parse(bridge().liveVoiceStart(sessionId));if(!result.ok)throw Error(result.error??'无法开启 GPT Live');publish({phase:'connecting',sessionId,message:'正在开启 GPT Live'});if(timer===undefined)timer=setInterval(poll,600)}catch(e){setError(String((e as Error).message))}
  }
  return <span data-plugin="codex-live-voice" style={{display:'inline-flex',alignItems:'center',gap:6}}>
   <button type="button" aria-label={mine?'结束 GPT Live':'开启 GPT Live'} title={mine?'结束 GPT Live 和当前语音任务':'GPT Live · 实时语音'} onClick={toggle} style={{border:0,background:mine?'rgba(62,225,199,.16)':'transparent',color:mine?'#22aa92':'inherit',borderRadius:12,padding:7,cursor:'pointer'}}>
    <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M3 10v4M7.5 6v12M12 3v18M16.5 6v12M21 10v4"/></svg>
   </button>
   {mine&&<button type="button" aria-label="GPT Live 会话详情" title={`${live.sessionTitle??'GPT Live'} · ${live.codexThreadId??'连接中'}`} onClick={()=>bridge()?.liveVoiceOpen?.(sessionId)} style={{fontSize:12,border:0,background:'transparent',color:'inherit',cursor:'pointer'}}>Live · 会话</button>}
   {(error||(live.sessionId===sessionId&&(live.historyError||(live.phase==='error'&&live.message))))&&<span role="alert" style={{fontSize:12}}>{error||live.historyError||live.message}</span>}
  </span>
 }
 function Settings(){
  const config=useSyncExternalStore(configSubscribe,configSnapshot)
  const live=useSyncExternalStore(store.subscribe,store.getSnapshot)
  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  const enabled=config.value?.enabled===true
  async function toggle(value:boolean,key='enabled'){setBusy(true);setError('');try{await settings.set(key,value)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
  return <section data-plugin="codex-live-settings" style={{padding:20,maxWidth:640}}><h2>GPT Live</h2>
   <label><input type="checkbox" checked={enabled} disabled={busy||config.status!=='ready'||!config.writable} onChange={e=>void toggle(e.target.checked)}/> 启用 GPT Live</label>
   <div style={{marginTop:20,borderTop:'1px solid color-mix(in srgb,currentColor 12%,transparent)',paddingTop:12}}>
    <h3 style={{fontSize:14}}>任务进度</h3>
    <label style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 0'}}>显示进度<input aria-label="显示 Codex 进度" type="checkbox" checked={config.value?.showCommentary!==false} disabled={!enabled||busy||!config.writable} onChange={e=>void toggle(e.target.checked,'showCommentary')}/></label>
    <label style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 0'}}>朗读进度<input aria-label="朗读 Codex 进度" type="checkbox" checked={config.value?.speakCommentary===true} disabled={!enabled||busy||!config.writable} onChange={e=>void toggle(e.target.checked,'speakCommentary')}/></label>
    <p style={{fontSize:12,opacity:.6}}>普通语音输入也适用。前台使用默认 TTS，桌面由 say 播报。</p>
   </div>
   {['connecting','listening','working'].includes(live.phase)&&<button onClick={()=>{bridge()?.liveVoiceStop?.();poll()}}>结束当前语音和任务</button>}
   {error&&<p role="alert">{error}</p>}
  </section>
 }
 const Progress=progressComponent(ctx,settings)
 ctx.slots.inject('conversation.input.dock',()=>ctx.slots.register({name:'conversation.input.dock',id:'codex-progress',order:88,inject:(sessionId:string)=>({sessionId})},Progress))
 ctx.slots.inject('conversation.input.right',()=>ctx.slots.register({name:'conversation.input.right',id:'codex-live-voice',order:89,inject:(sessionId:string)=>({sessionId})},Entry))
 ctx.slots.inject('settings.plugin.item',()=>ctx.slots.register({name:'settings.plugin.item',key:namespace,order:86},Settings))
}
