import test from 'node:test'
import assert from 'node:assert/strict'
import {bindNativeStartup} from '../src/client/lifetime.mjs'
function fixture() {
  let snap={status:'loading'}, watchers=new Set();const calls=[]
  return {calls,watchers,scope:{getSnapshot:()=>snap,subscribe:fn=>{watchers.add(fn);return()=>watchers.delete(fn)}},native:{startupConfigure:v=>calls.push(v)},set:v=>{snap=v;for(const f of watchers)f()}}
}
test('waits for persisted settings, keeps disabled boot, and deduplicates updates',()=>{
 const f=fixture(),off=bindNativeStartup(f.scope,f.native)
 assert.deepEqual(f.calls,[])
 f.set({status:'ready',value:{enabled:false}});f.set({status:'ready',value:{enabled:false}})
 assert.deepEqual(f.calls,[false])
 f.set({status:'ready',value:{enabled:true}});f.set({status:'ready',value:{enabled:false}});f.set({status:'ready',value:{enabled:true}})
 assert.deepEqual(f.calls,[false,true,false,true]);off();assert.equal(f.watchers.size,0);assert.equal(f.calls.at(-1),false)
})
test('transient disconnection preserves cache; dispose disables; reinstall restores host setting',()=>{
 const f=fixture();f.set({status:'ready',value:{enabled:true}})
 const off=bindNativeStartup(f.scope,f.native);f.set({status:'loading'});assert.deepEqual(f.calls,[true]);off()
 f.set({status:'ready',value:{enabled:true}});assert.deepEqual(f.calls,[true,false])
 const next=bindNativeStartup(f.scope,f.native);assert.deepEqual(f.calls,[true,false,true]);next()
})
test('missing Android bridge leaves browser settings usable without side effects',()=>{
 const f=fixture();f.set({status:'ready',value:{enabled:true}});const off=bindNativeStartup(f.scope,undefined);off();assert.equal(f.watchers.size,0)
})
