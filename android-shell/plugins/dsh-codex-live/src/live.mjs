import {randomBytes,timingSafeEqual} from 'node:crypto'
import {CommentaryFeed} from './progress.mjs'
import {LiveHistory} from './history.mjs'
export const LIVE_PATH='/api/android/codex/live'
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b))
/** One authenticated native audio owner; no credentials or SDP are persisted. */
export class CodexLive {
 constructor(client,{enabled=()=>true,progressConfig=()=>({showCommentary:true,speakCommentary:false}),sessionForThread}={}){
  this.client=client;this.enabled=enabled;this.csrf=randomBytes(24).toString('hex');this.active=null;this.binding=null;this.starting=false;this.generation=0
  this.progress=new CommentaryFeed({sessionForThread});this.progressConfig=progressConfig
  this.listen=m=>this.event(m);client.on('notification',this.listen)
  this.exited=()=>{this.progress.clear();if(this.active)this.active.error='Codex 已断开'};client.on('exit',this.exited)
  this.timer=null;this.history=null
 }
 get busy(){return this.starting||!!this.active}
 ownsSession(id){return this.active?.sessionId===String(id)||this.pending?.sessionId===String(id)}
 public(){const a=this.active;return {enabled:this.enabled(),available:!!this.binding,csrf:this.csrf,active:a?{sessionId:a.sessionId,...this.identity(a),phase:a.error?'error':a.turnId?'working':a.ready?'listening':'connecting',error:a.error??null}:null}}
 async syncHistory(sessionId){
  if(!this.enabled())throw Error('GPT Live 插件已关闭')
  if(!this.binding?.history)return {projectedMessages:0}
  this.history??=new LiveHistory(this.binding)
  return this.history.sync(sessionId)
 }
 async start({sessionId,sdp,csrf,lease}){
  if(!equal(csrf,this.csrf))throw Error('Invalid Live CSRF token')
  if(!this.enabled())throw Error('请先启用 Codex 后端')
  if(this.busy)throw Error('已有实时语音连接，请先结束')
  if(!this.binding)throw Error('Codex 尚未就绪，请稍后重试')
  if(typeof sessionId!=='string'||!/^session-[A-Za-z0-9-]+$/.test(sessionId))throw Error('Invalid session')
  if(typeof sdp!=='string'||!sdp.startsWith('v=0')||sdp.length>192*1024)throw Error('Invalid SDP')
  if(typeof lease!=='string'||!/^live-[A-Za-z0-9-]{36}$/.test(lease))throw Error('Invalid audio lease')
  this.timer=setInterval(()=>{if(this.active&&(!this.enabled()||(!this.starting&&Date.now()-this.active.touched>20000)))void this.stop()},5000);this.timer.unref?.()
  this.starting=true;this.pending={sessionId,lease}
  const generation=++this.generation
  try{
   const prepared=await this.binding.prepare(sessionId)
   if(generation!==this.generation){prepared.release?.();throw Error('Live 启动已取消')}
   const a={sessionId,threadId:prepared.threadId,release:prepared.release,lease,touched:Date.now(),events:[],seq:0,realtimeSessionId:null,title:prepared.title??sessionId,ready:false,turnId:null,error:null}
   this.active=a
   let timer
   const answer=new Promise((resolve,reject)=>{a.answer={resolve,reject};timer=setTimeout(()=>reject(Error('GPT Live 连接超时')),45000)})
   // Always observe the SDP rejection, even when start itself is rejected first.
   answer.catch(()=>{})
   try{
    await this.client.request('thread/realtime/start',{threadId:a.threadId,version:'v3',model:'gpt-live-1-codex',outputModality:'audio',transport:{type:'webrtc',sdp},includeStartupContext:true,initialItems:[{role:'developer',text:'Start silently. Wait for the user to speak before responding. Do not read prior chat messages, test markers, or greetings aloud on connection.'}],flushTranscriptTailOnSessionEnd:false,clientManagedHandoffs:false,codexResponseHandoffMode:'bemTags'})
    const remote=await answer
    if(this.active!==a)throw Error('Live 已停止')
    a.touched=Date.now();return {sdp:remote,sessionId,...this.identity(a)}
   }finally{
    clearTimeout(timer);a.answer=null
    // A stop may race the upstream start response. No new owner can start while
    // starting is true; close any late upstream session before releasing it.
    if(this.active!==a){try{await this.client.request('thread/realtime/stop',{threadId:a.threadId},{timeoutMs:5000})}catch{}}
   }
  }catch(e){await this.stop();throw e}finally{this.starting=false;this.pending=null}
 }
 event(m){
  if(this.enabled())this.progress.event(m)
  const a=this.active,p=m.params??{};if(!a||(p.threadId??p.thread?.id)!==a.threadId)return
  this.binding?.observe?.(m)
  if(m.method==='thread/realtime/sdp'){a.answer?.resolve(p.sdp);return}
  if(m.method==='thread/realtime/started'){a.ready=true;a.realtimeSessionId=p.realtimeSessionId??null}
  if(m.method==='turn/started')a.turnId=p.turn?.id??null
  if(m.method==='turn/completed')a.turnId=null
  if(m.method==='thread/realtime/error'||m.method==='thread/realtime/closed'){
   a.error=p.message??p.reason??'实时语音连接已结束';a.answer?.reject(Error(a.error))
  }
  if(['thread/realtime/transcript/delta','thread/realtime/transcript/done','thread/realtime/started','thread/realtime/error','thread/realtime/closed','turn/started','turn/completed'].includes(m.method)){
   a.events.push({seq:++a.seq,type:m.method,role:p.role,text:(p.text??p.delta??'').slice(0,16000),message:a.error,turnId:a.turnId})
   if(a.events.length>256)a.events.shift()
  }
 }
 identity(a){return {codexThreadId:a.threadId,realtimeSessionId:a.realtimeSessionId,sessionTitle:a.title,relationship:'current-thread'}}
 own(body){const a=this.active;if(!a||!equal(body.lease,a.lease)||body.sessionId!==a.sessionId)throw Error('Live audio lease expired');a.touched=Date.now();return a}
 async stop({interrupt=true}={}){
  clearInterval(this.timer);this.timer=null
  this.generation++
  const a=this.active;if(!a)return
  if(a.stopping)return a.stopping
  a.stopping=(async()=>{
   a.answer?.reject(Error('实时语音已结束'))
   try{await this.client.request('thread/realtime/stop',{threadId:a.threadId},{timeoutMs:5000})}catch{}
   if(interrupt&&a.turnId){try{await this.binding.interrupt(a.threadId,a.turnId)}catch{}}
   a.release?.()
   if(this.active===a)this.active=null
   try{await this.syncHistory(a.sessionId)}catch{}
   try{await this.binding.sync(a.sessionId)}catch{}
  })()
  return a.stopping
 }
 async action(b){
  if(b.action==='progress'){
   if(!equal(b.csrf,this.csrf))throw Error('Invalid Live CSRF token')
   if(!this.enabled())throw Error('GPT Live 插件已关闭')
   if(typeof b.sessionId!=='string'||!/^session-[A-Za-z0-9-]+$/.test(b.sessionId))throw Error('Invalid session')
   const c=this.progressConfig();return {...this.progress.read(b.sessionId),show:c.showCommentary!==false,speak:c.speakCommentary===true,realtime:this.ownsSession(b.sessionId)}
  }
  if(b.action==='history'){if(!equal(b.csrf,this.csrf))throw Error('Invalid Live CSRF token');return this.syncHistory(b.sessionId)}
  if(b.action==='start')return this.start(b)
  if(b.action==='stop'&&!this.active){
   if(this.pending){
    if(!equal(b.lease,this.pending.lease)||b.sessionId!==this.pending.sessionId)throw Error('Live audio lease expired')
    await this.stop()
   }
   return {stopped:true}
  }
  const a=this.own(b)
  if(b.action==='poll'){
   if(!a.historyAt||Date.now()-a.historyAt>2000){a.historyAt=Date.now();try{await this.syncHistory(a.sessionId);a.historyError=null}catch(e){a.historyError='语音记录同步失败，请稍后重新打开会话'}}
   return {historyError:a.historyError,...this.identity(a),events:a.events.filter(e=>e.seq>(Number(b.after)||0)),phase:a.error?'error':a.turnId?'working':a.ready?'listening':'connecting',error:a.error}}
  if(b.action==='stop'){await this.stop({interrupt:b.interrupt!==false});return {stopped:true}}
  throw Error('Unknown Live action')
 }
 handler=async(req,res)=>{
  const send=(code,v)=>{res.writeHead(code,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(v))}
  try{
   if(req.method==='GET'){send(200,this.public());return}
   if(req.method!=='POST'||!req.headers['content-type']?.startsWith('application/json')){send(405,{error:'JSON POST required'});return}
   let text='';for await(const chunk of req){text+=chunk;if(text.length>220*1024)throw Error('Request too large')}
   send(200,await this.action(JSON.parse(text)))
  }catch(e){send(400,{error:String(e.message).slice(0,300)})}
 }
 async close(options){this.progress.clear();clearInterval(this.timer);await this.stop(options);await this.history?.close();this.client.off('notification',this.listen);this.client.off('exit',this.exited)}
}
