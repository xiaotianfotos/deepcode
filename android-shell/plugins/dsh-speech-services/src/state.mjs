// Consume only live Session events; never traverse/replay stored history.
export class ResponseFeed {
 constructor(clock=Date.now){this.sessions=new Map();this.attempts=new Map();this.seq=0;this.clock=clock}
 clear(){this.sessions.clear();this.attempts.clear()}
 read(id){return this.sessions.get(id)??{seq:0,phase:'idle',text:'',final:''}}
 // DSH 0.1.5 publishes transient chunks separately from durable settlements.
 stream({agent,frame}={}){
  const session=agent?.session,id=session?.id
  if(typeof id!=='string'||!frame)return
  const prev=this.read(id)
  if(frame.type==='start'){
   if(prev.phase!=='working'||prev.turn!==frame.turn)return
   this.attempts.delete(id);this.attempts.set(id,{agent,id:frame.attemptId,revision:frame.revision,turn:frame.turn,step:frame.step,index:-1,started:false})
   while(this.attempts.size>32)this.attempts.delete(this.attempts.keys().next().value)
   return
  }
  const a=this.attempts.get(id)
  if(!a||a.agent!==agent||a.id!==frame.attemptId||(!Number.isSafeInteger(frame.revision)||frame.revision<=a.revision)||prev.turn!==a.turn||prev.phase!=='working')return
  a.revision=frame.revision
  if(frame.type==='end'){this.attempts.delete(id);return}
  if(frame.type!=='chunk'||!Number.isSafeInteger(frame.index)||frame.index<=a.index)return
  a.index=frame.index
  const c=frame.chunk
  if(c?.type!=='text-delta'||typeof c.text!=='string'||!c.text||c.channel&&c.channel!=='final')return
  // A retried attempt starts a new text tail; stale/duplicate chunks cannot append.
  if(!a.started){this.sessions.set(id,{...prev,text:'',step:a.step});a.started=true}
  this.event(session,{type:'assistant/chunk',data:{turn:a.turn,step:a.step,chunk:c}})
 }
 event(session,event){
 const id=session?.id;if(typeof id!=='string')return
 const prev=this.read(id),d=event?.data??{};let next={...prev}
 if(event.type==='turn/start'){this.attempts.delete(id);next={seq:0,phase:'working',text:'',final:'',turn:d.turn,step:-1,requestIds:[]}}
 else if(event.type==='user/message'){
  const requestId=d.source?.kind==='user'&&d.source.rpcId
  if(prev.phase!=='working'||typeof requestId!=='string'||!requestId)return
  next.requestIds=[...new Set([...(prev.requestIds??[]),requestId])].slice(-32)
 }
 else if(event.type==='assistant/chunk'){
  const c=d.chunk;if(c?.type!=='text-delta'||typeof c.text!=='string')return
  const channel=c.channel??d.channel;if(channel&&channel!=='final')return
  next.text=(prev.step===d.step?prev.text:'')+c.text;next.step=d.step;next.phase='working'
 }else if(event.type==='assistant/message'){
  if(d.interrupted||d.message?.channel&&d.message.channel!=='final')return
  const blocks=d.message?.content??[];if(blocks.some(x=>x.type==='tool-call'))return
  const text=blocks.filter(x=>x.type==='text'&&typeof x.text==='string').map(x=>x.text).join('')
  if(!text||prev.messageId===d.message?.id&&prev.final===text)return
  next.text=text;next.final=text.slice(0,3000);next.messageId=d.message?.id;next.finalId=String(d.turn)+':'+String(d.step)+':'+String(event.seq);next.step=d.step
 }else if(event.type==='turn/end'){this.attempts.delete(id);next.phase=d.reason?.kind==='completed'?'done':d.reason?.kind==='error'?'error':'stopped'}else return
 if((event.type==='assistant/chunk'||event.type==='assistant/message')&&next.text)next.textAt=this.clock()
 next.text=next.text.slice(-600);next.seq=++this.seq;this.sessions.delete(id);this.sessions.set(id,next)
 while(this.sessions.size>32)this.sessions.delete(this.sessions.keys().next().value)
 }
}
