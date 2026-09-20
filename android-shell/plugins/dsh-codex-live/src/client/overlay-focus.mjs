/** Publish only the visible chat/lane; keep the last selection while the WebView is hidden. */
export function followLiveOverlay(ctx,settings,isCodex,env=globalThis){
 const doc=env.document,bridge=env.window?.androidBridge
 if(!doc||typeof bridge?.liveVoiceSession!=='function')return ()=>{}
 let last='',closed=false,queued=false
 const sync=()=>{
  queued=false;if(closed)return
  const config=settings.getSnapshot()
  if(config.status!=='ready')return
  if(!config.value?.enabled){publish('',false);return}
  if(doc.visibilityState==='hidden')return
  const list=ctx.sessions.list.getSnapshot()
  if(list.phase&&list.phase!=='ready')return
  const lane=[...doc.querySelectorAll('[data-deck-lane][data-active="true"]')].find(e=>e.getClientRects().length)?.getAttribute('data-deck-lane')
  const id=lane&&list.byId?.[lane]?lane:list.current
  publish(id??'',!!id&&isCodex(list.byId?.[id]))
 }
 const publish=(id,eligible)=>{const key=JSON.stringify([id,eligible]);if(last!==key){bridge.liveVoiceSession(id,eligible);last=key}}
 const schedule=()=>{if(!queued&&!closed){queued=true;env.queueMicrotask(sync)}}
 const observer=new env.MutationObserver(schedule)
 observer.observe(doc.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['data-active','data-deck-lane','hidden','style','class']})
 const off=ctx.sessions.list.subscribe(schedule),offSettings=settings.subscribe(schedule)
 doc.addEventListener('visibilitychange',schedule);env.window.addEventListener('focus',schedule);sync()
 return()=>{closed=true;off();offSettings();observer.disconnect();doc.removeEventListener('visibilitychange',schedule);env.window.removeEventListener('focus',schedule);bridge.liveVoiceSession('',false)}
}
