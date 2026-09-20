import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import {readFileSync} from 'node:fs'
import {randomUUID} from 'node:crypto'
function harness(fault={}){
 const services={},jobs=new Map(),values=new Map(),requests=[],timers=new Map();let counter=0,status={ok:true,id:'',phase:'idle'},leaseCount=0
 const bridge={voiceStart(id){if(['recording','transcribing'].includes(status.phase))return JSON.stringify({ok:false,error:'busy'});status={ok:true,id,phase:'recording'};return JSON.stringify(status)},voiceStatus:()=>JSON.stringify(status),voiceStop(id){if(status.id===id)status.phase='transcribing'},voiceCancel(){status.phase='canceled'},voiceAcknowledge(){status={ok:true,id:'',phase:'idle'}},voiceRelease(){}}
 const window={androidBridge:bridge,setInterval(fn){timers.set(++counter,fn);return counter},dispatchEvent(){},addEventListener(){},removeEventListener(){}}
 const ctx={
   settingsScope:{bind:()=>({getSnapshot:()=>({status:'ready',writable:true,user:{asrEnabled:true},value:{enabled:true,asrEnabled:true}}),subscribe:()=>()=>{},set:async()=>{}})},
   provide:(k,v)=>services[k]=v, effect(setup,label){if(label==='Default speech service settings')setup()}, slots:{inject(){}},
   sessions:{
     acquireStage(){if(fault.acquire)throw new Error('Missing session');leaseCount++;return()=>leaseCount--},
     scope(id){return {id,bail(subject,type,request){assert.equal(subject,this,'Cordis requires an explicit dispatch subject for scope filtering');assert.equal(type,'slash/input-insert-text');requests.push({id,request});return jobs.get(id)!=='locked'}}}
   },
   conversation:{input:{for(scope){return {state:{getSnapshot:()=>({draft:scope.id+' existing',draftRev:2,phase:jobs.get(scope.id)==='locked'?'claimed':'plain'})}}}}}
 }

 const sandbox={window,crypto:{randomUUID},console,CustomEvent:class{},clearInterval:id=>timers.delete(id),localStorage:{getItem:k=>values.get(k)??null,setItem:(k,v)=>{if(fault.storage)throw new Error('Quota exceeded');values.set(k,v)},removeItem:k=>values.delete(k)}}
 window.__ModuleLoader__={load({factory}){factory(()=>({})).apply(ctx)}}
 vm.runInNewContext(readFileSync('lib/client.js','utf8'),sandbox)
 return {status:()=>status,voice:services.androidVoice,requests,values,jobs,leaseCount:()=>leaseCount,complete(text){status={...status,phase:'done',text};for(const fn of [...timers.values()])fn()}}
}
test('finish A then activate B: result remains A and releases task lease',()=>{
 const h=harness(),a=h.voice.for('A');a.start();h.voice.leave('A');h.voice.for('B');h.complete('你好');assert.equal(h.requests.length,1);assert.equal(h.requests[0].id,'A');assert.equal(h.leaseCount(),0);assert.equal(h.voice.busy(),false)
})
test('unmounted view retains ASR owner and result is consumed once',()=>{const h=harness(),a=h.voice.for('A');const off=a.attach();a.start();off();h.complete('结束');h.complete('结束');assert.equal(h.requests.length,1)})
test('uneditable draft preserves text durably until explicit retry',()=>{const h=harness(),a=h.voice.for('A');a.start();h.jobs.set('A','locked');h.complete('待插入');assert.equal(h.requests.length,0);assert.equal(h.values.get('dsh.voice.held.A'),'待插入');h.jobs.delete('A');a.retry();assert.equal(h.requests[0].id,'A');assert.equal(h.values.has('dsh.voice.held.A'),false)})

test('storage quota failure keeps native result until retry and releases lease',()=>{
 const h=harness({storage:true}),a=h.voice.for('A');a.start();h.jobs.set('A','locked');h.complete('保留');assert.equal(h.status().phase,'done');assert.equal(a.snapshot().text,'保留');h.jobs.delete('A');a.retry();assert.equal(h.requests.length,1);assert.equal(h.status().phase,'idle');assert.equal(h.leaseCount(),0)
})
test('failed session lease never starts native recording',()=>{
 const h=harness({acquire:true});h.voice.for('A').start();assert.notEqual(h.status().phase,'recording');assert.equal(h.leaseCount(),0)
})
