import test from 'node:test'
import assert from 'node:assert/strict'
import {CommentaryFeed} from '../src/progress.mjs'
import {ProgressSpeaker,spokenProgress} from '../src/client/progress-audio.mjs'
import {CodexLive} from '../src/live.mjs'
import {EventEmitter} from 'node:events'
const tick=()=>new Promise(r=>setImmediate(r))
function fixture(){let time=1000;const f=new CommentaryFeed({sessionForThread:id=>({a:'session-a',b:'session-b'})[id],clock:()=>time});const event=(method,params={})=>f.event({method,params:{threadId:'a',turnId:'t1',...params}});return {f,event}}
test('progress is available before turn completion; excludes reasoning, tools, final and unlabelled text',()=>{
 const {f,event}=fixture();event('turn/started',{turn:{id:'t1'}})
 for(const phase of ['final_answer',null,'analysis']){event('item/started',{item:{id:'excluded',type:'agentMessage',phase}});event('item/agentMessage/delta',{itemId:'excluded',delta:'hidden'})}
 event('item/reasoning/textDelta',{delta:'private'});event('item/commandExecution/outputDelta',{delta:'tool'})
 assert.equal(f.read('session-a').text,'')
 event('item/started',{item:{id:'c1',type:'agentMessage',phase:'commentary'}})
 event('item/agentMessage/delta',{itemId:'c1',delta:'正在核对'})
 assert.equal(f.read('session-a').text,'正在核对');assert.equal(f.read('session-a').completed,null)
 event('item/completed',{item:{id:'c1',type:'agentMessage',phase:'commentary',text:'正在核对代码。'}})
 const state=f.read('session-a');assert.equal(state.completed.text,'正在核对代码。');assert.equal(state.status,'working')
 event('item/completed',{item:{id:'c1',type:'agentMessage',phase:'commentary',text:'duplicate'}});assert.equal(f.read('session-a').seq,state.seq)
 event('item/agentMessage/delta',{itemId:'c1',delta:'late'});assert.equal(f.read('session-a').seq,state.seq)
 assert.equal(f.read('session-b').text,'')
 event('turn/completed',{turn:{id:'t1',status:'completed'}});assert.equal(f.read('session-a').completed,null)
})
test('thread/turn identity and new turns reject stale or unrelated progress',()=>{
 const {f,event}=fixture();event('turn/started',{turn:{id:'t1'}})
 const item={id:'c',type:'agentMessage',phase:'commentary',text:'ok'}
 event('item/completed',{threadId:'unknown',item});event('item/completed',{turnId:'old',item});assert.equal(f.read('session-a').text,'')
 event('item/completed',{item});assert.equal(f.read('session-a').text,'ok')
 event('turn/started',{turn:{id:'t2'}});assert.equal(f.read('session-a').text,'')
 event('item/completed',{item});assert.equal(f.read('session-a').text,'');f.clear();assert.equal(f.read('session-a').status,'idle')
})
test('progress API requires CSRF, never starts realtime, disables cleanly',async()=>{
 const client=new EventEmitter();client.request=()=>{throw Error('must not call upstream')}
 const live=new CodexLive(client,{sessionForThread:()=> 'session-a'})
 try{
  client.emit('notification',{method:'turn/started',params:{threadId:'a',turn:{id:'t'}}})
  client.emit('notification',{method:'item/completed',params:{threadId:'a',turnId:'t',item:{id:'i',type:'agentMessage',phase:'commentary',text:'reading'}}})
  await assert.rejects(live.action({action:'progress',sessionId:'session-a',csrf:'bad'}),/CSRF/)
  const result=await live.action({action:'progress',sessionId:'session-a',csrf:live.csrf})
  assert.equal(result.text,'reading');assert.equal(result.speak,false);assert.equal(result.realtime,false);assert.equal(live.active,null)
  client.emit('exit');assert.equal(live.progress.read('session-a').status,'idle')
  live.enabled=()=>false;await assert.rejects(live.action({action:'progress',sessionId:'session-a',csrf:live.csrf}),/关闭/)
 }finally{await live.close()}
})
test('speech primes without replay, deduplicates, bounds cadence and drops stale/desktop/Live progress',async()=>{
 let now=1000;const said=[],speaker=new ProgressSpeaker({clock:()=>now,play:async t=>said.push(t),stop:()=>{}})
 const state=(seq,text='正在检查。')=>({seq,status:'working',completed:{seq,id:String(seq),at:now,text}})
 speaker.observe(state(1),true);await tick();assert.equal(said.length,0)
 speaker.observe(state(2),true);await tick();assert.equal(said.length,1)
 now+=16000;speaker.observe(state(3),true);await tick();assert.equal(said.length,1)
 speaker.observe(state(4,'正在测试。'),true);await tick();assert.equal(said.length,2)
 now+=16000;speaker.observe({...state(5,'Live'),realtime:true},true);speaker.observe(state(6,'桌面'),false);await tick();assert.equal(said.length,2)
 const old=state(7,'过期');old.completed.at=now-21000;speaker.observe(old,true);await tick();assert.equal(said.length,2)
 speaker.observe(state(8,'取消'),true);speaker.stop();await tick();assert.equal(said.length,2)
 assert.equal(spokenProgress('**正在**检查 [文件](https://example.test)。```secret```'),'正在检查 文件。')
})
