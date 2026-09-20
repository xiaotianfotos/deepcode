import test from 'node:test'
import assert from 'node:assert/strict'
import {EventEmitter} from 'node:events'
import {CodexLive} from '../src/live.mjs'
function fixture(){
 const client=new EventEmitter(),calls=[]
 client.request=async(method,params)=>{calls.push([method,params]);if(method==='thread/realtime/start')queueMicrotask(()=>client.emit('notification',{method:'thread/realtime/sdp',params:{threadId:'thread-1',sdp:'v=0 answer'}}));return {}}
 const live=new CodexLive(client),releases=[]
 live.binding={prepare:async()=>({threadId:'thread-1',release:()=>releases.push(1)}),sync:async()=>{},interrupt:async(...args)=>calls.push(['interrupt',args])}
 const start=()=>live.start({sessionId:'session-test',sdp:'v=0 offer',csrf:live.csrf,lease:'live-00000000-0000-0000-0000-000000000000'})
 return {client,calls,live,releases,start,body:{sessionId:'session-test',lease:'live-00000000-0000-0000-0000-000000000000'}}
}
test('matches HomeRail protocol; preserves selected thread and refuses another owner',async()=>{
 const f=fixture();try{assert.equal((await f.start()).sdp,'v=0 answer');const p=f.calls[0][1];assert.equal(p.model,'gpt-live-1-codex');assert.equal(p.transport.type,'webrtc');assert.equal(p.flushTranscriptTailOnSessionEnd,false);await assert.rejects(f.start(),/已有/);await assert.rejects(f.live.action({...f.body,lease:'wrong',action:'stop'}),/lease/);assert.ok(f.live.active)}finally{await f.live.close()}
})
test('only selected thread notifications reach owner; stop interrupts own turn and releases',async()=>{
 const f=fixture();try{await f.start();f.client.emit('notification',{method:'turn/started',params:{threadId:'other',turn:{id:'other-turn'}}});assert.equal(f.live.active.turnId,null);f.client.emit('notification',{method:'turn/started',params:{threadId:'thread-1',turn:{id:'own-turn'}}});await f.live.action({...f.body,action:'stop'});assert.equal(f.releases.length,1);assert.deepEqual(f.calls.find(c=>c[0]==='interrupt')[1],['thread-1','own-turn']);assert.equal(f.live.active,null)}finally{await f.live.close()}
})
test('startup error releases ownership without leaking credentials',async()=>{
 const f=fixture();f.client.request=async(method)=>{if(method==='thread/realtime/start')throw Error('unavailable');return {}}
 try{await assert.rejects(f.start(),/unavailable/);assert.equal(f.live.busy,false);assert.equal(f.releases.length,1);assert.equal(f.live.public().active,null)}finally{await f.live.close()}
})
test('CSRF and disabled backend reject before acquiring thread',async()=>{
 const f=fixture();try{await assert.rejects(f.live.start({csrf:'wrong'}),/CSRF/);f.live.enabled=()=>false;await assert.rejects(f.start(),/启用/);assert.equal(f.calls.length,0)}finally{await f.live.close()}
})
test('stopping during thread preparation cannot open a late microphone session',async()=>{
 const f=fixture();let finish
 f.live.binding.prepare=()=>new Promise(resolve=>{finish=resolve})
 try{const opening=f.start();assert.equal(f.live.ownsSession(f.body.sessionId),true);await assert.rejects(f.live.action({...f.body,lease:'wrong',action:'stop'}),/lease/);await f.live.action({...f.body,action:'stop'});finish({threadId:'thread-1',release:()=>f.releases.push(1)});await assert.rejects(opening,/取消/);assert.equal(f.calls.length,0);assert.equal(f.releases.length,1);assert.equal(f.live.busy,false)}finally{await f.live.close()}
})

test('stop racing upstream start also closes the late upstream connection',async()=>{
 const f=fixture();let finish
 f.client.request=async(method,params)=>{
  f.calls.push([method,params]);if(method==='thread/realtime/start')await new Promise(resolve=>{finish=resolve});return {}
 }
 try{
  const opening=f.start();await new Promise(resolve=>setImmediate(resolve));
  await f.live.action({...f.body,action:'stop'});finish();
  await assert.rejects(opening,/结束/);
  assert.equal(f.calls.filter(c=>c[0]==='thread/realtime/stop').length,2);
  assert.equal(f.live.busy,false);assert.equal(f.releases.length,1)
 }finally{await f.live.close()}
})

test('history requires CSRF and can catch up without starting realtime or a task',async()=>{
 const f=fixture();let projected=0
 f.live.binding.history=async(id,apply)=>{assert.equal(id,'session-test');projected++;return {projectedMessages:0}}
 try{
  await assert.rejects(f.live.action({action:'history',sessionId:'session-test',csrf:'bad'}),/CSRF/)
  assert.equal(projected,0)
  await f.live.action({action:'history',sessionId:'session-test',csrf:f.live.csrf})
  assert.equal(projected,1);assert.equal(f.calls.length,0);assert.equal(f.live.timer,null)
  f.live.enabled=()=>false
  await assert.rejects(f.live.action({action:'history',sessionId:'session-test',csrf:f.live.csrf}),/关闭/)
 }finally{await f.live.close()}
})
