import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import fs from 'node:fs'
import {createRequire} from 'node:module'
import React from 'react'
import {create,act} from 'react-test-renderer'
const require=createRequire(import.meta.url)
const tick=()=>new Promise(r=>setImmediate(r))
function fixture({enabled=true,user={enabled:true},legacy=null,migrated=false}={}){
 const window=new EventTarget(),document=new EventTarget(),storage=new Map(),components=new Map(),effects=[],watchers=new Set(),timers=new Set(),calls=[]
 let plugin,native={phase:'idle'},settings={state:{status:'ready',writable:true,value:{enabled},user},getSnapshot(){return this.state},subscribe(fn){watchers.add(fn);return()=>watchers.delete(fn)},async set(key,value){calls.push(['set',value]);this.state={...this.state,value:{...this.state.value,[key]:value},user:{...this.state.user,[key]:value}};watchers.forEach(fn=>fn())}}
 window.androidBridge={liveVoiceStatus:()=>JSON.stringify(native),liveVoiceStart:id=>{calls.push(['start',id]);native={phase:'listening',sessionId:id};return '{"ok":true}'},liveVoiceStop:()=>{calls.push(['stop']);native={phase:'closed'}},liveVoiceRelease:()=>calls.push(['release'])}
 window.__ModuleLoader__={load:({factory})=>{plugin=factory(require)}}
 if(legacy!==null)storage.set('dsh.android.voice.enabled',legacy)
 if(migrated)storage.set('dsh.codex-live.migrated','1')
 const localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)}
 vm.runInNewContext(fs.readFileSync(new URL('../lib/client.js',import.meta.url),'utf8'),{window,document,localStorage,setInterval:fn=>{timers.add(fn);return fn},clearInterval:fn=>timers.delete(fn),fetch:async()=>({ok:true,json:async()=>({enabled:true,available:true,csrf:"test"})}),console})
 const list={state:{byId:{'session-test':{agentPreset:'relay-codex'},'session-qwen':{agentPreset:'standard',projectionValues:{modelSelection:{next:{provider:'local-qwen'},lastUsed:{provider:'relay-codex'}}}}}},subscribe(){return()=>{}},getSnapshot(){return this.state}}
 plugin.apply({settingsScope:{bind:()=>settings},sessions:{list},effect:fn=>effects.push(fn()),slots:{inject:(slot,fn)=>effects.push(fn()),register:(spec,component)=>{components.set(spec.id??spec.key,spec.inject?props=>React.createElement(component,spec.inject(props.sessionId)):component);return()=>components.delete(spec.id??spec.key)}}})
 return {settings,calls,storage,timers,watchers,components,cleanup(){effects.reverse().forEach(fn=>fn?.())}}
}
test('standard settings stores render; one click starts, next ends; idle owns no timer',async()=>{
 const f=fixture();let tree
 try{
  assert.equal(f.timers.size,0)
  await act(async()=>{tree=create(React.createElement(f.components.get('codex-live-voice'),{sessionId:'session-test'}))})
  await act(async()=>tree.root.findByProps({'aria-label':'开启 GPT Live'}).props.onClick())
  assert.deepEqual(f.calls[0],['start','session-test']);assert.equal(f.timers.size,1)
  await act(async()=>tree.root.findByProps({'aria-label':'结束 GPT Live'}).props.onClick())
  assert.equal(f.timers.size,0)
  await act(async()=>{await f.settings.set('enabled',false)})
  assert.equal(tree.toJSON(),null);assert.equal(f.timers.size,0)
  await act(async()=>{await f.settings.set('enabled',true)})
  assert.ok(tree.root.findByProps({'aria-label':'开启 GPT Live'}))
 }finally{await act(async()=>tree?.unmount());f.cleanup()}
 assert.equal(f.watchers.size,0);assert.equal(f.components.size,0);assert.equal(f.timers.size,0);assert.equal(f.calls.filter(x=>x[0]==='release').length,1)
})
test('one-time legacy migration preserves existing Host value',async()=>{
 for(const options of [{enabled:true,user:{enabled:true},legacy:'false'},{enabled:false,user:{},legacy:'true',migrated:true}]){
  const f=fixture(options);await tick();assert.equal(f.calls.length,0);f.cleanup()
 }
 const f=fixture({user:{},legacy:'false'});await tick()
 assert.equal(f.settings.getSnapshot().value.enabled,false);assert.equal(f.storage.get('dsh.codex-live.migrated'),'1');assert.equal(f.timers.size,0)
 f.settings.state={...f.settings.state,user:{}};f.watchers.forEach(fn=>fn());await tick()
 assert.equal(f.calls.filter(x=>x[0]==='set').length,1);f.cleanup()
})

test('realtime entry belongs to the selected Codex session, never to a local-model session',async()=>{
 const f=fixture();let tree
 try{
  await act(async()=>{tree=create(React.createElement(f.components.get('codex-live-voice'),{sessionId:'session-qwen'}))})
  assert.equal(tree.toJSON(),null)
  await act(async()=>tree.update(React.createElement(f.components.get('codex-live-voice'),{sessionId:'session-test'})))
  assert.ok(tree.root.findByProps({'aria-label':'开启 GPT Live'}))
  await act(async()=>tree.update(React.createElement(f.components.get('codex-live-voice'),{sessionId:'session-qwen'})))
  assert.equal(tree.toJSON(),null);assert.equal(f.calls.filter(x=>x[0]==='start').length,0)
 }finally{await act(async()=>tree?.unmount());f.cleanup()}
})

 test('commentary display and speech are independent standard GPT Live settings',async()=>{
  const f=fixture();let tree
  try{
   await act(async()=>{tree=create(React.createElement(f.components.get('codex-live')))})
   assert.equal(tree.root.findByProps({'aria-label':'显示 Codex 进度'}).props.checked,true)
   assert.equal(tree.root.findByProps({'aria-label':'朗读 Codex 进度'}).props.checked,false)
   await act(async()=>tree.root.findByProps({'aria-label':'朗读 Codex 进度'}).props.onChange({target:{checked:true}}))
   assert.equal(f.settings.state.value.speakCommentary,true);assert.equal(f.settings.state.value.enabled,true)
   await act(async()=>tree.root.findByProps({'aria-label':'显示 Codex 进度'}).props.onChange({target:{checked:false}}))
   assert.equal(f.settings.state.value.showCommentary,false);assert.equal(f.settings.state.value.speakCommentary,true)
   await act(async()=>f.settings.set('enabled',false))
   assert.equal(tree.root.findByProps({'aria-label':'朗读 Codex 进度'}).props.disabled,true)
  }finally{await act(async()=>tree?.unmount());f.cleanup()}
 })
