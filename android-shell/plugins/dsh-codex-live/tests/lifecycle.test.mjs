import test from 'node:test'
import assert from 'node:assert/strict'
import {EventEmitter} from 'node:events'
import {Context} from '@deepseek-ai/cordis'
import * as plugin from '../src/index.mjs'
const settle=()=>new Promise(r=>setImmediate(r))
test('real Cordis unload/reinstall and optional dependency recovery own one Live instance',async()=>{
 const ctx=new Context(),routes=new Set(),watchers=new Set(),calls=[]
 let value={enabled:false},validator
 ctx.provide('settings',{register(ns,schema,options){
  assert.equal(ns,'codex-live');validator=options.validate
  return {get:()=>value,watch(fn){watchers.add(fn);return()=>watchers.delete(fn)}}
 }})
 ctx.provide('webServer',{register(route){routes.add(route);return()=>routes.delete(route)}})
 const set=async enabled=>{await validator({enabled});value={enabled};for(const fn of watchers)await fn(value)}
 const client=new EventEmitter()
 client.request=async(method,params)=>{calls.push(method);if(method==='thread/realtime/start')queueMicrotask(()=>client.emit('notification',{method:'thread/realtime/sdp',params:{threadId:'thread-1',sdp:'v=0 answer'}}));return {}}
 const runtime={client,enabled:()=>true,voice:null,binding:{prepare:async()=>({threadId:'thread-1',release:()=>calls.push('release')}),sync:async()=>{},interrupt:async()=>calls.push('interrupt')}}
 const dependency=c=>c.provide('androidCodexRuntime',runtime)
 let root=ctx.plugin(plugin);await root
 assert.equal(routes.size,1);assert.equal(watchers.size,1)
 let provider=ctx.plugin(dependency);await provider;await settle()
 assert.equal(runtime.voice,null);assert.equal(client.listenerCount('notification'),0)
 await set(true);const first=runtime.voice;assert.ok(first);assert.equal(first.timer,null)
 await set(true);assert.equal(runtime.voice,first);assert.equal(client.listenerCount('notification'),1)
 await set(false);assert.equal(runtime.voice,null);assert.equal(client.listenerCount('notification'),0)
 await set(true);assert.notEqual(runtime.voice,first)
 await runtime.voice.start({sessionId:'session-test',sdp:'v=0 offer',csrf:runtime.voice.csrf,lease:'live-00000000-0000-0000-0000-000000000000'})
 client.emit('notification',{method:'turn/started',params:{threadId:'thread-1',turn:{id:'turn-test'}}})
 await assert.rejects(set(false),/先结束/);assert.equal(value.enabled,true)
 await root.dispose();await settle()
 assert.equal(routes.size,0);assert.equal(watchers.size,0);assert.equal(runtime.voice,null)
 assert.equal(client.listenerCount('notification'),0);assert.equal(client.listenerCount('exit'),0)
 assert.ok(calls.includes('thread/realtime/stop'));assert.ok(calls.includes('release'));assert.ok(!calls.includes('interrupt'))
 root=ctx.plugin(plugin);await root;await settle()
 assert.equal(routes.size,1);assert.equal(watchers.size,1);assert.equal(client.listenerCount('notification'),1)
 await provider.dispose();await settle();assert.equal(runtime.voice,null);assert.equal(client.listenerCount('notification'),0)
 provider=ctx.plugin(dependency);await provider;await settle();assert.ok(runtime.voice);assert.equal(client.listenerCount('notification'),1)
 await root.dispose();await provider.dispose();assert.equal(routes.size,0);assert.equal(watchers.size,0)
})
