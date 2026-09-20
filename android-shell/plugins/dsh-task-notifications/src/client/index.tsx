import {useState,useSyncExternalStore} from 'react'
import {bindSurface} from './surface.mjs'
export const inject=['slots','settingsScope']
export function apply(ctx:any){
 const scope=ctx.settingsScope.bind({namespace:'task-notifications'})
 ctx.effect(()=>bindSurface(scope,(window as any).androidBridge),'visible notification sessions')
 function Settings(){
  const snap:any=useSyncExternalStore((f:any)=>scope.subscribe(f),()=>scope.getSnapshot())
  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  const set=async(key:string,value:boolean)=>{setBusy(true);setError('');try{await scope.set(key,value)}catch(e:any){setError(e.message)}finally{setBusy(false)}}
  return <section data-plugin="task-notifications-settings" style={{padding:'20px 0',maxWidth:680}}>
   <h2 style={{fontSize:18}}>任务通知</h2>
   <p style={{opacity:.65,fontSize:13,lineHeight:1.7}}>离开聊天时显示任务进度和结果。</p>
   {([['enabled','启用任务通知'],['progress','显示后台进度'],['quietWhenVisible','正在查看时不重复提醒']] as const).map(([key,label])=><label key={key} style={{display:'flex',alignItems:'center',gap:12,minHeight:48}}>
    <input type="checkbox" aria-label={label} checked={snap.value?.[key]===true} disabled={busy||snap.status!=='ready'||!snap.writable||(key!=='enabled'&&!snap.value?.enabled)} onChange={e=>void set(key,e.target.checked)}/>{label}
   </label>)}
   {error&&<p role="alert">{error}</p>}
  </section>
 }
 ctx.slots.inject('settings.plugin.item',()=>ctx.slots.register({name:'settings.plugin.item',key:'task-notifications',order:92},Settings))
}
