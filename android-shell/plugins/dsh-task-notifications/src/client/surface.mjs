/** Track actually visible conversations independently of speech configuration. */
export function bindSurface(scope,native,env=globalThis){
 const doc=env.document
 if(!doc||!native?.notificationSurface)return()=>{}
 let queued=false,dead=false,last=''
 const visible=e=>{
  const r=e.getBoundingClientRect();let left=0,right=env.innerWidth,top=0,bottom=env.innerHeight
  if(!r.width||!r.height||env.getComputedStyle(e).visibility==='hidden')return false
  for(let parent=e.parentElement;parent;parent=parent.parentElement){
   const css=env.getComputedStyle(parent),p=parent.getBoundingClientRect()
   if(/auto|scroll|hidden|clip/.test(css.overflowX)){left=Math.max(left,p.left);right=Math.min(right,p.right)}
   if(/auto|scroll|hidden|clip/.test(css.overflowY)){top=Math.max(top,p.top);bottom=Math.min(bottom,p.bottom)}
  }
  // A sliver of the adjacent lane is not a conversation the user is reading.
  return Math.min(r.right,right)-Math.max(r.left,left)>=Math.min(160,r.width*.5)&&Math.min(r.bottom,bottom)-Math.max(r.top,top)>=Math.min(80,r.height*.5)
 }
 const sync=()=>{
  queued=false;if(dead)return
  let ids=[]
  const ready=scope.getSnapshot().status==='ready'
  const covered=[...doc.querySelectorAll('[role="dialog"][aria-modal="true"]')].some(visible)
  if(ready&&doc.visibilityState!=='hidden'&&!covered){
   const lanes=[...doc.querySelectorAll('[data-deck-lane]')]
   ids=lanes.filter(visible).map(e=>e.getAttribute('data-deck-lane'))
   if(!ids.length&&!lanes.some(visible)&&[...doc.querySelectorAll('[data-chat-flow]')].some(visible))ids=[doc.documentElement.getAttribute('data-dsh-session-id')]
  }
  const value=JSON.stringify([...new Set(ids.filter(Boolean))]);if(last!==value){native.notificationSurface(value);last=value}
 }
 const schedule=()=>{if(!dead&&!queued){queued=true;env.queueMicrotask(sync)}}
 const observer=new env.MutationObserver(schedule)
 observer.observe(doc.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['data-deck-lane','data-dsh-session-id','hidden','style','class','aria-modal']})
 const off=scope.subscribe(schedule)
 doc.addEventListener('visibilitychange',schedule);doc.addEventListener('scroll',schedule,true);env.addEventListener('resize',schedule)
 sync()
 return()=>{dead=true;off();observer.disconnect();doc.removeEventListener('visibilitychange',schedule);doc.removeEventListener('scroll',schedule,true);env.removeEventListener('resize',schedule);native.notificationSurface('[]')}
}
