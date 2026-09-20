import test from 'node:test'
import assert from 'node:assert/strict'
import {bindRemote,defaults,validate} from '../src/client/policy.mjs'
test('observed defaults, reserved keys and duplicate bindings',()=>{
 assert.equal(validate(defaults),'')
 for(const code of [24,25,26,3,19,20,21,22,231])assert.ok(validate({...defaults,voiceKey:code}))
 assert.ok(validate({...defaults,voiceKey:4}));assert.ok(validate({...defaults,voiceKey:1.5}))
 assert.equal(validate({...defaults,voiceAction:'none',voiceKey:4}),'')
})
test('host hydration, focus lease, disable, remount, stale sequence and disposal',()=>{
 let snap={status:'loading'},watch,active=true;const handlers=new Map(),calls=[],actions=[]
 const scope={getSnapshot:()=>snap,subscribe:f=>{watch=f;return()=>{watch=null}}}
 const native={remoteConfigure:x=>calls.push(['config',JSON.parse(x)]),remoteLease:x=>calls.push(['lease',x])}
 const env={addEventListener:(k,f)=>handlers.set(k,f),removeEventListener:k=>handlers.delete(k),setInterval:f=>{env.tick=f;return 1},clearInterval:()=>{env.tick=null}}
 const off=bindRemote(scope,native,()=>active,a=>actions.push(a),env)
 assert.deepEqual(calls,[['lease',false]])
 snap={status:'ready',value:{...defaults,enabled:true}};watch();assert.equal(calls.at(-1)[1],true)
 const event=n=>handlers.get('dsh-remote-input')({detail:{seq:n,action:'record'}})
 event(1);event(1);assert.deepEqual(actions,['record'])
 active=false;env.tick();event(2);assert.equal(actions.length,1);assert.equal(calls.at(-1)[1],false)
 active=true;snap.value.enabled=false;watch();event(3);assert.equal(actions.length,1)
 snap.value.enabled=true;watch();event(4);assert.equal(actions.length,2)
 off();assert.equal(watch,null);assert.equal(env.tick,null);assert.equal(handlers.size,0);assert.deepEqual(calls.at(-1),['config',{enabled:false}])
 const again=bindRemote(scope,native,()=>true,a=>actions.push(a),env);event(5);assert.equal(actions.length,3);again()
})
test('missing native bridge is harmless',()=>{
 const env={addEventListener(){},removeEventListener(){},setInterval(){},clearInterval(){}}
 const scope={getSnapshot:()=>({status:'ready',value:defaults}),subscribe:()=>()=>{}}
 bindRemote(scope,null,()=>false,()=>{},env)()
})
