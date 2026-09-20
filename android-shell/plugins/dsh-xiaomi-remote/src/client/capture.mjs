/** Settings-only capture lifetime; no synthesized keyboard events and no runtime actions. */
export function learnKey(native,device,onResult,onEnd,onWarning,env=globalThis){
 if(!native?.remoteCaptureBegin)throw Error('请更新 Android 壳以使用按键录入')
 const id=native.remoteCaptureBegin(device);if(!id)throw Error('无法开始按键录入')
 let closed=false,lastWarning=''
 const close=()=>{if(closed)return;closed=true;env.clearInterval(timer);env.clearTimeout(timeout);env.removeEventListener('blur',blur);env.document?.removeEventListener('visibilitychange',visibility);native.remoteCaptureCancel(id)}
 const end=reason=>{if(closed)return;close();onEnd(reason)}
 const blur=()=>end('canceled'),visibility=()=>{if(env.document?.visibilityState==='hidden')end('canceled')}
 const tick=()=>{
  if(closed)return
  try{
   const c=JSON.parse(native.remoteStatus()).capture
   if(c?.id!==id){end('canceled');return}
   if(c.warning&&c.warning!==lastWarning){lastWarning=c.warning;onWarning(c.warning)}
   if(c.phase==='captured'){close();onResult(c.keyCode);return}
   if(c.phase==='timeout')end('timeout')
  }catch{end('error')}
 }
 const timer=env.setInterval(tick,150),timeout=env.setTimeout(()=>end('timeout'),15500)
 env.addEventListener('blur',blur);env.document?.addEventListener('visibilitychange',visibility)
 return close
}
