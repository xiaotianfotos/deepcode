/** Only explicitly labelled public commentary, never reasoning or tool output. */
export class CommentaryFeed {
 constructor({sessionForThread=()=>null,clock=Date.now}={}){this.resolve=sessionForThread;this.clock=clock;this.states=new Map();this.seq=0}
 clear(){this.states.clear()}
 read(id){const s=this.states.get(id);return s?{turnId:s.turnId,status:s.status,text:s.text,seq:s.seq,completed:s.completed}: {status:'idle',text:'',seq:0,completed:null}}
 event(message){
  const p=message.params??{},threadId=p.threadId??p.thread?.id
  if(typeof threadId!=='string')return
  const id=this.resolve(threadId);if(!id)return
  if(message.method==='turn/started'){
   if(typeof p.turn?.id!=='string')return
   this.states.delete(id);this.states.set(id,{threadId,turnId:p.turn.id,status:'working',text:'',seq:++this.seq,completed:null,items:new Map()})
   while(this.states.size>32)this.states.delete(this.states.keys().next().value)
   return
  }
  const s=this.states.get(id);if(!s||s.threadId!==threadId||s.status!=='working')return
  const turn=p.turnId??p.turn?.id;if(turn!==s.turnId)return
  if(message.method==='turn/completed'){s.status=p.turn?.status==='completed'?'done':'stopped';s.seq=++this.seq;s.completed=null;return}
  const item=p.item
  if(message.method==='item/started'&&item?.type==='agentMessage'&&item.phase==='commentary'&&typeof item.id==='string'){
   s.items.set(item.id,{text:'',done:false});while(s.items.size>16)s.items.delete(s.items.keys().next().value)
  }else if(message.method==='item/agentMessage/delta'){
   const pending=s.items.get(p.itemId);if(!pending||pending.done||typeof p.delta!=='string')return
   pending.text=(pending.text+p.delta).slice(-4000);s.text=pending.text;s.seq=++this.seq
  }else if(message.method==='item/completed'&&item?.type==='agentMessage'&&item.phase==='commentary'&&typeof item.text==='string'){
   const pending=s.items.get(item.id);if(pending?.done)return
   s.items.set(item.id,{text:'',done:true});while(s.items.size>16)s.items.delete(s.items.keys().next().value)
   s.text=item.text.slice(-4000);s.seq=++this.seq
   s.completed={id:s.turnId+':'+item.id,seq:s.seq,text:item.text.slice(0,4000),at:this.clock()}
  }
 }
}
