import {useEffect,useState,useSyncExternalStore} from 'react'
import {followCurrentSession} from './focus.mjs'
export const inject=['slots','settingsScope','sessions','uiSession','uiConversation']
const styles=`
.dsh-speech{color:inherit;font-size:14px;padding:20px 0;max-width:760px;--sp-line:color-mix(in srgb,currentColor 12%,transparent);--sp-soft:color-mix(in srgb,currentColor 4%,transparent);--sp-muted:color-mix(in srgb,currentColor 58%,transparent)}
.dsh-speech *{box-sizing:border-box}.dsh-speech h2{font-size:18px;font-weight:600;margin:0}.dsh-speech h3{font-size:14px;font-weight:600;margin:0}.dsh-speech p{margin:5px 0 0;color:var(--sp-muted);font-size:12px;line-height:1.6}
.dsh-speech .sp-head,.dsh-speech .sp-row,.dsh-speech .sp-service{display:flex;align-items:center;justify-content:space-between;gap:18px}.dsh-speech .sp-head{margin-bottom:20px}.dsh-speech fieldset{border:0;padding:0;margin:0;min-width:0}.dsh-speech .sp-card{border:1px solid var(--sp-line);border-radius:14px;overflow:hidden}.dsh-speech .sp-row{padding:16px 18px;min-height:78px}.dsh-speech .sp-row+.sp-row{border-top:1px solid var(--sp-line)}.dsh-speech .sp-controls{display:flex;align-items:center;gap:14px}.dsh-speech .sp-switch{display:inline-flex;position:relative;flex-shrink:0;width:38px;height:24px;cursor:pointer}.dsh-speech .sp-switch input{position:absolute;opacity:0;width:100%;height:100%;margin:0;cursor:inherit}.dsh-speech .sp-switch span{width:38px;height:24px;background:color-mix(in srgb,currentColor 22%,transparent);border-radius:20px;pointer-events:none;transition:background .15s}.dsh-speech .sp-switch span:after{content:'';display:block;width:18px;height:18px;background:white;border-radius:50%;margin:3px;box-shadow:0 1px 3px #0002;transition:transform .15s}.dsh-speech .sp-switch input:checked+span{background:#4d6bfe}.dsh-speech .sp-switch input:checked+span:after{transform:translateX(14px)}.dsh-speech .sp-switch input:focus-visible+span{outline:2px solid #4d6bfe;outline-offset:3px}
.dsh-speech button,.dsh-speech select,.dsh-speech input:not([type=checkbox]){font:inherit;color:inherit;border:1px solid var(--sp-line);background:transparent;border-radius:9px;padding:9px 12px;min-height:38px}.dsh-speech select{max-width:210px;cursor:pointer}.dsh-speech option{color:CanvasText;background:Canvas}.dsh-speech button{cursor:pointer}.dsh-speech button:hover{background:var(--sp-soft)}.dsh-speech button:focus-visible,.dsh-speech select:focus-visible,.dsh-speech input:focus-visible{outline:2px solid #4d6bfe;outline-offset:2px}.dsh-speech button:disabled{opacity:.4;cursor:default}.dsh-speech .sp-primary{background:#4d6bfe;color:white;border-color:transparent}.dsh-speech .sp-primary:hover{background:#4058dc}.dsh-speech .sp-section{margin:24px 0 8px;display:flex;align-items:center;justify-content:space-between}.dsh-speech .sp-link{border:0;color:#4d6bfe;font-size:12px;padding:7px 10px}.dsh-speech .sp-service{padding:13px 0;border-bottom:1px solid var(--sp-line)}.dsh-speech .sp-service strong{font-size:13px;font-weight:500}.dsh-speech .sp-meta{color:var(--sp-muted);font-size:12px;margin-top:4px;overflow-wrap:anywhere}.dsh-speech .sp-note{margin-top:16px}.dsh-speech .sp-edit{margin-top:12px;padding:18px;background:var(--sp-soft);border-radius:12px}.dsh-speech .sp-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:15px}.dsh-speech .sp-grid label{font-size:12px;color:var(--sp-muted);display:grid;gap:7px}.dsh-speech .sp-grid input{width:100%;min-width:0;color:inherit}.dsh-speech .sp-wide{grid-column:1/-1}.dsh-speech .sp-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}.dsh-speech .sp-danger{color:#c64747;margin-right:auto}.dsh-speech .sp-error{color:#c64747;font-size:12px;margin-top:12px}
@media(max-width:600px){.dsh-speech .sp-row{padding:14px 12px;gap:10px;flex-wrap:wrap}.dsh-speech .sp-controls{margin-left:auto}.dsh-speech select{max-width:180px}.dsh-speech .sp-grid{grid-template-columns:1fr}.dsh-speech .sp-head{gap:12px}}
`
function Toggle({label,checked,onChange}:{label:string,checked:boolean,onChange:(v:boolean)=>void}){return <label className="sp-switch"><input type="checkbox" aria-label={label} checked={checked} onChange={e=>onChange(e.target.checked)}/><span/></label>}
export function apply(ctx:any){
 const scope=ctx.settingsScope.bind({namespace:'speech-services'})
 ctx.effect(()=>followCurrentSession(ctx,scope),'current-session desktop companion')
 function Settings(){
  const snap=useSyncExternalStore((f:any)=>scope.subscribe(f),()=>scope.getSnapshot()) as any
  const c=snap.value??{},services=c.services??[]
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[editing,setEditing]=useState<any>(null),[key,setKey]=useState(''),[keySet,setKeySet]=useState<Record<string,boolean>>({})
  useEffect(()=>{let alive=true;fetch('/api/android/speech').then(r=>r.json()).then(x=>{if(alive)setKeySet(x.keySet??{})}).catch(()=>{});return()=>{alive=false}},[])
  const set=async(k:string,v:any)=>{setBusy(true);setError('');try{await scope.set(k,v)}catch(e:any){setError(e.message)}finally{setBusy(false)}}
  const edit=(s:any)=>{setError('');setKey('');setEditing({...s})}
  const save=async()=>{
   setBusy(true);setError('')
   try{
    const item={...editing,name:editing.name.trim()||editing.model.trim(),baseUrl:editing.baseUrl.trim(),model:editing.model.trim()}
    await scope.set('services',services.some((s:any)=>s.id===item.id)?services.map((s:any)=>s.id===item.id?item:s):[...services,item])
    if(key){const config=await fetch('/api/android/speech').then(r=>r.json());const r=await fetch('/api/android/speech',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'key',csrf:config.csrf,id:item.id,key})});const b=await r.json();if(!r.ok)throw Error(b.error);setKeySet(v=>({...v,[item.id]:true}))}
    setKey('');setEditing(null)
   }catch(e:any){setError(e.message)}finally{setBusy(false)}
  }
  const remove=async()=>{setBusy(true);setError('');try{await scope.set('services',services.filter((s:any)=>s.id!==editing.id));setEditing(null)}catch(e:any){setError(e.message)}finally{setBusy(false)}}
  return <section className="dsh-speech" data-plugin="speech-services-settings"><style>{styles}</style>
   <fieldset disabled={busy||snap.status!=='ready'||!snap.writable}>
    <div className="sp-head"><div><h2>语音服务</h2></div><Toggle label="启用语音服务" checked={!!c.enabled} onChange={v=>void set('enabled',v)}/></div>
    <div className="sp-card">
     <div className="sp-row"><div><h3>语音输入</h3></div><div className="sp-controls"><select aria-label="默认 ASR" value={c.asrProvider??'local'} onChange={e=>void set('asrProvider',e.target.value)}><option value="local">本机识别</option>{services.filter((s:any)=>!/^wss?:/.test(s.baseUrl)||s.baseUrl.endsWith('/v1/realtime')).map((s:any)=><option key={s.id} value={s.id}>{s.name}</option>)}</select><Toggle label="语音转文字 ASR" checked={!!c.asrEnabled} onChange={v=>void set('asrEnabled',v)}/></div></div>
     <div className="sp-row"><div><h3>语音回复</h3><p>按需简短播报</p></div><div className="sp-controls"><select aria-label="默认 TTS" value={c.ttsProvider??''} onChange={e=>void set('ttsProvider',e.target.value)}><option value="">选择服务</option>{services.filter((s:any)=>!/^wss?:/.test(s.baseUrl)||s.baseUrl.endsWith('/v1/audio/speech/stream')).map((s:any)=><option key={s.id} value={s.id}>{s.name}</option>)}</select><Toggle label="按需语音回复 TTS" checked={!!c.ttsEnabled} onChange={v=>void set('ttsEnabled',v)}/></div></div>
     <div className="sp-row"><div><h3>手柄快捷操作</h3><p>三角键开始或结束录音</p></div><Toggle label="展开语音面板接收手柄按键" checked={c.overlayGamepad!==false} onChange={v=>void set('overlayGamepad',v)}/></div>
    </div>
    <div className="sp-section"><h3>我的服务</h3><button className="sp-link" onClick={()=>edit({id:'service-'+Date.now(),name:'',baseUrl:'',model:'',voice:'',speed:1})}>＋ 添加服务</button></div>
    <div className="sp-service"><div><strong>本机识别</strong><div className="sp-meta">Qwen3-ASR · 在设备上处理</div></div><span className="sp-meta">内置</span></div>
    {services.map((s:any)=><div className="sp-service" key={s.id}><div><strong>{s.name}</strong><div className="sp-meta">{s.model}{keySet[s.id]?' · 已配置密钥':''}</div></div><button className="sp-link" aria-label={'编辑 '+s.name} onClick={()=>edit(s)}>编辑</button></div>)}
    {editing&&<div className="sp-edit"><h3>{services.some((s:any)=>s.id===editing.id)?'编辑服务':'添加语音服务'}</h3><div className="sp-grid">
     {([['name','名称','例如 MiMo 语音识别'],['model','模型','mimo-v2.5-asr'],['baseUrl','服务地址（HTTP 或 WebSocket）','https://api.xiaomimimo.com'],['voice','声音（朗读）','mimo_default'],['instructions','声音风格（可选）','自然、温和地交流，避免播音腔']] as const).map(([field,label,hint])=><label key={field} className={field==='baseUrl'?'sp-wide':''}>{label}<input aria-label={label} placeholder={hint} value={editing[field]??''} onChange={e=>setEditing({...editing,[field]:e.target.value})}/></label>)}
     <label className="sp-wide">API key<input aria-label="API key" type="password" autoComplete="new-password" value={key} placeholder={keySet[editing.id]?'已保存，留空保持不变':'可选，保存在应用内'} onChange={e=>setKey(e.target.value)}/></label>
    </div><div className="sp-actions">{services.some((s:any)=>s.id===editing.id)&&<button className="sp-danger" disabled={editing.id===c.asrProvider||editing.id===c.ttsProvider} onClick={()=>void remove()}>删除</button>}<button onClick={()=>{setEditing(null);setKey('');setError('')}}>取消</button><button className="sp-primary" onClick={()=>void save()}>保存</button></div></div>}
   </fieldset>{c.asrEnabled&&c.asrProvider!=='local'&&<p className="sp-note">录音将发送至所选语音服务。</p>}{error&&<p role="alert" className="sp-error">{error}</p>}
  </section>
 }
 ctx.slots.inject('settings.plugin.item',()=>ctx.slots.register({name:'settings.plugin.item',key:'speech-services',order:87},Settings))
}
