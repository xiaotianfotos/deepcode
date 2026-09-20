import {useEffect,useRef,useState,useSyncExternalStore} from 'react'
import {ProgressAudio,ProgressSpeaker} from './progress-audio.mjs'
export function isCodex(session:any){const s=session?.projectionValues?.modelSelection;const provider=s?.next?.provider??s?.pending?.provider??s?.lastUsed?.provider;return provider?provider==='relay-codex':(session?.projectionValues?.agentPreset??session?.agentPreset)==='relay-codex'}
export function progressComponent(ctx:any,settings:any){
 const speech=ctx.settingsScope.bind({namespace:'speech-services'})
 return function Progress({sessionId}:{sessionId:string}){
  const c=useSyncExternalStore((f:any)=>settings.subscribe(f),()=>settings.getSnapshot()) as any
  const speechConfig=useSyncExternalStore((f:any)=>speech.subscribe(f),()=>speech.getSnapshot()) as any
  const list=useSyncExternalStore((f:any)=>ctx.sessions.list.subscribe(f),()=>ctx.sessions.list.getSnapshot()) as any
  const [progress,setProgress]=useState<any>(null),[audioState,setAudioState]=useState('idle'),[error,setError]=useState('')
  const textRef=useRef<HTMLDivElement>(null)
  const session=list.byId?.[sessionId],running=!!session?.running,codex=isCodex(session)
  useEffect(()=>{
   setProgress(null);setError('')
   if(c.status!=='ready'||!c.value?.enabled||!codex||!running||(!c.value.showCommentary&&!c.value.speakCommentary))return
   let dead=false,busy=false,csrf='',request:AbortController|undefined
   const focused=()=>{
    const active=[...document.querySelectorAll('[data-deck-lane][data-active="true"]')].find((e:any)=>e.getClientRects().length)
    return active?active.getAttribute('data-deck-lane')===sessionId:ctx.sessions.list.getSnapshot().current===sessionId
   }
   const allowed=()=>{
    if(dead||document.visibilityState==='hidden'||!focused()||!c.value.speakCommentary||!speechConfig.value?.enabled||!speechConfig.value?.ttsEnabled)return false
    const bridge=(window as any).androidBridge
    if(!bridge?.speechPlaybackContext)return false
    try{const s=JSON.parse(bridge.speechPlaybackContext()),live=JSON.parse(bridge.liveVoiceStatus?.()??'{}');return s.foreground===true&&!s.companion&&!s.microphone&&!['connecting','listening','working'].includes(live.phase)}catch{return false}
   }
   const audio=new ProgressAudio(allowed,(state:string,message?:string)=>{if(!dead){setAudioState(state);if(message)setError(message)}})
   const speaker=new ProgressSpeaker({play:(text:string)=>audio.play(text),stop:()=>audio.stop()})
   const poll=async()=>{
    if(dead||busy||document.visibilityState==='hidden')return
    busy=true;request=new AbortController();const timeout=setTimeout(()=>request?.abort(),5000)
    try{
     if(!csrf){const r=await fetch('/api/android/codex/live',{signal:request.signal});if(!r.ok)throw Error();csrf=(await r.json()).csrf;if(!csrf)throw Error()}
     const r=await fetch('/api/android/codex/live',{method:'POST',signal:request.signal,headers:{'content-type':'application/json'},body:JSON.stringify({action:'progress',csrf,sessionId})})
     if(!r.ok){csrf='';throw Error()};const state=await r.json();if(dead)return
     setProgress(state);speaker.observe(state,allowed()&&state.speak)
    }catch{if(!dead){speaker.stop();setProgress(null)}}finally{clearTimeout(timeout);busy=false}
   }
   const visibility=()=>{speaker.stop();if(document.visibilityState!=='hidden')void poll()}
   const interaction=()=>{if(!allowed())speaker.stop()}
   document.addEventListener('visibilitychange',visibility);window.addEventListener('blur',visibility)
   const watch=setInterval(interaction,200),timer=setInterval(()=>void poll(),650);void poll()
   return()=>{dead=true;request?.abort();clearInterval(timer);clearInterval(watch);speaker.stop();document.removeEventListener('visibilitychange',visibility);window.removeEventListener('blur',visibility)}
  },[sessionId,running,codex,c.status,c.value,speechConfig.value])
  useEffect(()=>{if(textRef.current)textRef.current.scrollTop=textRef.current.scrollHeight},[progress?.seq])
  if(!running||!codex||!c.value?.enabled||c.value?.showCommentary===false||!progress?.text)return null
  return <div data-plugin="codex-progress" data-audio-state={audioState} data-progress-seq={progress.seq} style={{fontSize:12,lineHeight:1.6,padding:'8px 12px',borderRadius:12,background:'color-mix(in srgb,currentColor 5%,transparent)',color:'inherit',width:'100%',boxSizing:'border-box'}}>
   <div style={{opacity:.6,fontSize:11,marginBottom:3}}>{audioState==='playing'?'正在播报':'任务进度'}</div>
   <div ref={textRef} role="status" aria-live="polite" style={{maxHeight:'4.8em',overflowY:'auto',overflowWrap:'anywhere',whiteSpace:'pre-wrap'}}>{progress.text}</div>
   {error&&<span role="alert" style={{opacity:.7}}>{error}</span>}
  </div>
 }
}
