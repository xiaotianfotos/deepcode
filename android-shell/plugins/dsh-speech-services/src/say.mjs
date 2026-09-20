import {randomUUID} from 'node:crypto'
export const SAY_GUIDANCE='桌面悬浮球是语音交互：每个任务先用 say phase=status 检查当前会话的桌面语音是否可用。available=true 时，开始实质工作前必须用 phase=ack 简短确认收到并说明将做什么；长任务有实质新进展时用 phase=progress 播报一句；结束前必须用 phase=result 播报简短结果，失败、未完成或需要用户介入也要如实说明，然后给出简短文字回复。确认和结果各限一次，不受进度的 30 秒间隔限制，短任务也不能省略结果。进度播报之间至少 30 秒，只报告已经发生或验证过的新事实，不逐工具播报、不定时重复状态、不把计划当成果。每次通常一句话，详细内容、列表、思考和工具输出只用文字，不将长回答拆成多次 say。available=false 或语音调用失败时继续文字回复，不循环重试、等待语音或自行开启设置。'
/** Bounded, focused-session speech; replies never automatically become TTS. */
export class SayQueue {
 constructor(clock=Date.now){this.clock=clock;this.clear()}
 clear(){this.active='';this.at=0;this.pending=[];this.turns=new Map();this.used=new Map()}
 turn(id,value){
  if(this.turns.get(id)!==value){this.used.delete(id);this.pending=this.pending.filter(p=>p.sessionId!==id)}
  this.turns.set(id,value)
  if(this.turns.size>64){const first=this.turns.keys().next().value;this.turns.delete(first);this.used.delete(first)}
 }
 status(sessionId){return {available:!!sessionId&&sessionId===this.active&&this.clock()-this.at<=3000,mode:'desktop'}}
 poll(sessionId,ready,companionActive=true){
  const now=this.clock()
  if(!companionActive){this.active='';this.at=0;this.pending=[];return null}
  if(sessionId!==this.active||now-this.at>3000)this.pending=[]
  this.active=sessionId;this.at=now
  this.pending=this.pending.filter(p=>p.expires>=now)
  if(!ready||!this.pending.length)return null
  const value=this.pending.shift();return {id:value.id,text:value.text}
 }
 enqueue(sessionId,text,phase='progress'){
  const now=this.clock()
  if(!['ack','progress','result'].includes(phase))throw Error('say phase 必须是 ack、progress 或 result')
  if(typeof text!=='string'||!text.trim()||[...text.trim()].length>160)throw Error('say 只接受 160 字以内的简短话语，请勿拆分长回答')
  if(!this.status(sessionId).available)throw Error('当前会话的桌面语音未连接，请使用文字回复')
  const last=this.used.get(sessionId)??{ack:false,result:false,lastAt:-Infinity,seen:new Set()}
  if(last.result||last.seen.has(text.trim())||phase==='ack'&&(last.ack||last.seen.size))throw Error('本轮确认、结果或相同进度已播报，请继续任务并使用文字回复')
  if(phase==='progress'&&now-last.lastAt<30000)throw Error('进度播报至少间隔 30 秒，请继续执行任务')
  this.pending=this.pending.filter(p=>p.expires>=now && !(phase==='result'&&p.sessionId===sessionId&&p.phase==='progress'))
  if(this.pending.length>=3)throw Error('语音队列已满，请继续任务并使用文字回复')
  const id=randomUUID();this.pending.push({id,sessionId,phase,text:text.trim(),expires:now+(phase==='result'?60000:15000)})
  last[phase]=true;last.lastAt=now;last.seen.add(text.trim());this.used.set(sessionId,last)
  return {id,status:'queued',phase}
 }
}
