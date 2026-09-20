import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
const result=await build({entryPoints:['src/client/router.ts'],bundle:true,format:'esm',write:false})
const {ButtonRouter}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'))
test('toggle ignores repeats and duplicate down until key-up',()=>{
 const calls=[],r=new ButtonRouter(x=>calls.push(x));r.button('north',true);r.button('north',true);r.button('north',true,true)
 assert.deepEqual(calls,['record']);r.button('north',false);r.button('north',true);assert.deepEqual(calls,['record','record']);r.reset()
})
test('deletion repeat stops across lane change and needs a fresh press',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const calls=[],r=new ButtonRouter(x=>calls.push(x))
 r.button('west',true);t.mock.timers.tick(450);assert.equal(calls.length,2)
 r.stopRepeat();t.mock.timers.tick(1000);r.button('west',true);assert.equal(calls.length,2)
 r.button('west',false);r.button('west',true);assert.equal(calls.length,3);r.reset();t.mock.timers.tick(2000);assert.equal(calls.length,3)
})
test('shoulders remain one action per edge',()=>{const a=[],r=new ButtonRouter(x=>a.push(x));r.button('l1',true);r.button('l1',true,true);r.button('r1',true);assert.deepEqual(a,['previous','next']);r.reset()})

test('L2 toggles once while held and again after release',()=>{const a=[],r=new ButtonRouter(x=>a.push(x));r.button('l2',true);r.button('l2',true);r.button('l2',true,true);assert.deepEqual(a,['sidebar']);r.button('l2',false);r.button('l2',true);assert.deepEqual(a,['sidebar','sidebar']);r.reset()})

test('Circle sends once per press and never repeats while held',t=>{t.mock.timers.enable({apis:['setTimeout']});const calls=[],r=new ButtonRouter(x=>calls.push(x));r.button('east',true);r.button('east',true);r.button('east',true,true);t.mock.timers.tick(2000);assert.deepEqual(calls,['send']);r.button('east',false);r.button('east',true);assert.deepEqual(calls,['send','send']);r.reset()})
