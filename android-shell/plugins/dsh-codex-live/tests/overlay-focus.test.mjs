import test from 'node:test'
import assert from 'node:assert/strict'
import {followLiveOverlay} from '../src/client/overlay-focus.mjs'
test('desktop Live follows Codex/lane, preserves hidden or pending selection, revokes on disable/dispose',()=>{
 let list={phase:'ready',current:'dsh',byId:{dsh:{codex:false},codex:{codex:true}}},config={status:'ready',value:{enabled:true}},lane='',listener,settingsListener,mutation
 const calls=[],queue=[],events=new Map()
 const doc={visibilityState:'visible',documentElement:{},querySelectorAll:()=>lane?[{getClientRects:()=>[{}],getAttribute:()=>lane}]:[],addEventListener:(k,f)=>events.set(k,f),removeEventListener:k=>events.delete(k)}
 const env={document:doc,window:{androidBridge:{liveVoiceSession:(...v)=>calls.push(v)},addEventListener(){},removeEventListener(){}},queueMicrotask:f=>queue.push(f),MutationObserver:class{constructor(f){mutation=f}observe(){}disconnect(){}}}
 const stop=followLiveOverlay({sessions:{list:{getSnapshot:()=>list,subscribe:f=>{listener=f;return()=>{listener=null}}}}},{getSnapshot:()=>config,subscribe:f=>{settingsListener=f;return()=>{settingsListener=null}}},s=>s?.codex===true,env)
 const flush=()=>{while(queue.length)queue.shift()()}
 assert.deepEqual(calls.at(-1),['dsh',false])
 list={...list,current:'codex'};listener();flush();assert.deepEqual(calls.at(-1),['codex',true])
 const count=calls.length;doc.visibilityState='hidden';list={...list,current:'dsh'};listener();flush();assert.equal(calls.length,count)
 config={status:'ready',value:{enabled:false}};settingsListener();flush();assert.deepEqual(calls.at(-1),['',false])
 config.value.enabled=true;settingsListener();flush();assert.deepEqual(calls.at(-1),['',false])
 doc.visibilityState='visible';events.get('visibilitychange')();flush();assert.deepEqual(calls.at(-1),['dsh',false])
 lane='codex';mutation();flush();assert.deepEqual(calls.at(-1),['codex',true])
 list={...list,phase:'pending',current:undefined};listener();flush();assert.deepEqual(calls.at(-1),['codex',true])
 list={...list,phase:'ready'};lane='';listener();flush();assert.deepEqual(calls.at(-1),['',false])
 mutation();stop();flush();assert.deepEqual(calls.at(-1),['',false]);assert.equal(listener,null);assert.equal(settingsListener,null)
})
