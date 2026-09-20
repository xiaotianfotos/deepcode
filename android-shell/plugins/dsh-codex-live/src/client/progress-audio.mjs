export function spokenProgress(text){
 return String(text??'').replace(/```[\s\S]*?```/g,'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/https?:\/\/\S+/g,'').replace(/[*_`#>]/g,'').replace(/\s+/g,' ').trim().slice(0,160)
}
/** One foreground utterance. Discard stale progress instead of building a speech backlog. */
export class ProgressSpeaker {
 constructor({play,stop,clock=Date.now}){this.play=play;this.cancel=stop;this.clock=clock;this.cursor=null;this.last=-Infinity;this.pending=null;this.seen=new Set();this.busy=false;this.generation=0}
 stop(){this.generation++;this.cancel();this.busy=false;this.pending=null}
 observe(state,allowed){
  const c=state.completed
  if(this.cursor===null){this.cursor=state.seq;return}
  if(!allowed||state.realtime||state.status!=='working'){this.stop();this.cursor=state.seq;return}
  if(c&&c.seq>this.cursor){this.cursor=state.seq;this.pending=c}
  else this.cursor=Math.max(this.cursor,state.seq)
  if(!this.pending||this.busy||this.clock()-this.last<15000)return
  const p=this.pending;this.pending=null
  const text=spokenProgress(p.text)
  if(!text||this.clock()-p.at>20000||this.seen.has(text))return
  this.seen.add(text);if(this.seen.size>64)this.seen.delete(this.seen.values().next().value)
  this.last=this.clock();this.busy=true;const generation=this.generation
  Promise.resolve().then(()=>{if(generation===this.generation)return this.play(text)}).catch(()=>{}).finally(()=>{if(generation===this.generation)this.busy=false})
 }
}
/** Uses the existing authenticated speech API; credentials never enter the browser. */
export class ProgressAudio {
 constructor(allowed=()=>true,onState=()=>{}){this.allowed=allowed;this.onState=onState;this.generation=0;this.context=null;this.abort=null;this.timer=null}
 stop(){this.generation++;this.abort?.abort();this.abort=null;clearInterval(this.timer);this.timer=null;void this.context?.close().catch(()=>{});this.context=null;this.onState('idle')}
 async play(text){
  this.stop();const generation=this.generation,abort=new AbortController();this.abort=abort
  const guard=()=>{if(generation!==this.generation||!this.allowed())throw Error('朗读已取消')}
  let context,end=0,received=0,done=false,reader
  const timeout=setTimeout(()=>this.stop(),45000)
  this.timer=setInterval(()=>{if(!this.allowed())this.stop()},150)
  this.onState('loading')
  try{
   guard()
   const response=await fetch('/api/android/speech',{signal:abort.signal});if(!response.ok)throw Error('语音服务不可用')
   const c=await response.json(),profile=c.services?.find(s=>s.id===c.ttsProvider)
   if(!c.enabled||!c.ttsEnabled||!profile)throw Error('请配置并开启 TTS')
   guard();context=new AudioContext();this.context=context;await context.resume();guard()
   if(context.state!=='running')throw Error('请先点击页面后再朗读')
   const stream=/^wss?:/.test(profile.baseUrl)
   const r=await fetch('/api/android/speech',{method:'POST',signal:abort.signal,headers:{'content-type':'application/json'},body:JSON.stringify({action:stream?'tts-stream':'tts',text,csrf:c.csrf,revision:c.revision})})
   if(!r.ok)throw Error('进度朗读失败')
   const schedule=buffer=>{guard();if(end-context.currentTime>15)throw Error('语音积压');const source=context.createBufferSource();source.buffer=buffer;source.connect(context.destination);end=Math.max(end,context.currentTime+.03);source.start(end);end+=buffer.duration;received+=buffer.length;this.onState('playing')}
   const bytes=base64=>{const raw=atob(base64);if(raw.length>8*1024*1024)throw Error('语音数据过大');return Uint8Array.from(raw,x=>x.charCodeAt(0))}
   if(stream){
    reader=r.body.getReader();const decoder=new TextDecoder();let partial='',rate=0,total=0
    const accept=line=>{if(!line.trim())return;guard();const e=JSON.parse(line)
     if(e.type==='error')throw Error('进度朗读失败')
     if(e.type==='format'){if(rate||e.channels!==1||e.encoding!=='pcm16'||![16000,22050,24000,32000,44100,48000].includes(e.sampleRate))throw Error('语音格式无效');rate=e.sampleRate}
     if(e.type==='audio'){
      const b=bytes(e.audio);total+=b.length;if(!rate||!b.length||b.length%2||total>8*1024*1024)throw Error('语音数据无效')
      const buffer=context.createBuffer(1,b.length/2,rate),floats=buffer.getChannelData(0),view=new DataView(b.buffer)
      for(let i=0;i<floats.length;i++)floats[i]=view.getInt16(i*2,true)/32768
      schedule(buffer)
     }
     if(e.type==='done')done=true
    }
    while(true){guard();const chunk=await reader.read();if(chunk.done)break;partial+=decoder.decode(chunk.value,{stream:true});if(partial.length>3*1024*1024)throw Error('语音数据过大');let n;while((n=partial.indexOf('\n'))>=0){accept(partial.slice(0,n));partial=partial.slice(n+1)}}
    partial+=decoder.decode();if(partial.trim())accept(partial)
    if(!done||!received)throw Error('语音不完整')
   }else{const data=await r.json();const b=bytes(data.audio);schedule(await context.decodeAudioData(b.buffer))}
   while(context.currentTime<end){guard();await new Promise(r=>setTimeout(r,80))}
  }catch(error){if(generation===this.generation&&this.allowed())this.onState('error',error.message);throw error}
  finally{clearTimeout(timeout);await reader?.cancel().catch(()=>{});if(generation===this.generation){clearInterval(this.timer);this.timer=null;this.abort=null;void context?.close().catch(()=>{});this.context=null;this.onState('idle')}}
 }
}
