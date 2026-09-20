import test from 'node:test'
import assert from 'node:assert/strict'
import {learnKey} from '../src/client/capture.mjs'
function fixture(){
 let capture={id:'test',phase:'waiting'},tick,timeout;const handlers=new Map(),results=[],ended=[],warnings=[],cancels=[]
 const native={remoteCaptureBegin:()=>capture.id,remoteCaptureCancel:id=>cancels.push(id),remoteStatus:()=>JSON.stringify({capture})}
 const env={setInterval:f=>(tick=f,1),clearInterval:()=>{tick=null},setTimeout:f=>(timeout=f,2),clearTimeout:()=>{timeout=null},addEventListener:(n,f)=>handlers.set(n,f),removeEventListener:n=>handlers.delete(n),document:{visibilityState:'visible',addEventListener:(n,f)=>handlers.set(n,f),removeEventListener:n=>handlers.delete(n)}}
 const close=learnKey(native,'remote',v=>results.push(v),v=>ended.push(v),v=>warnings.push(v),env)
 return {env,handlers,results,ended,warnings,cancels,close,tick:()=>tick?.(),timeout:()=>timeout?.(),state:value=>{capture={...capture,...value}}}
}
test('captures once, cancels native lifetime, never dispatches a chat action',()=>{
 const f=fixture();f.state({phase:'captured',keyCode:135});f.tick();f.tick()
 assert.deepEqual(f.results,[135]);assert.deepEqual(f.cancels,['test']);assert.equal(f.handlers.size,0);assert.deepEqual(f.ended,[])
})
test('timeout, blur, background, disposal and replacement cannot save late keys',()=>{
 for(const end of [f=>f.timeout(),f=>f.handlers.get('blur')(),f=>{f.env.document.visibilityState='hidden';f.handlers.get('visibilitychange')()},f=>f.close(),f=>{f.state({id:'new'});f.tick()}]){
  const f=fixture();end(f);f.state({phase:'captured',keyCode:4});f.tick();assert.deepEqual(f.results,[]);assert.deepEqual(f.cancels,['test']);assert.equal(f.handlers.size,0)
 }
})
test('reserved key feedback can be followed by an ordinary key; old shells fail clearly',()=>{
 const f=fixture();f.state({warning:'系统按键'});f.tick();f.tick();assert.deepEqual(f.warnings,['系统按键']);assert.deepEqual(f.results,[])
 f.state({phase:'captured',keyCode:66,warning:''});f.tick();assert.deepEqual(f.results,[66])
 assert.throws(()=>learnKey({},'',()=>{},()=>{},()=>{}),/更新/)
})
