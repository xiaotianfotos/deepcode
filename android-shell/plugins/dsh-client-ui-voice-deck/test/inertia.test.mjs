import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
const result=await build({entryPoints:['src/client/chat-swipe.ts'],bundle:true,format:'esm',write:false})
const {releaseTarget,releaseVelocity}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'))
test('short quick flick crosses a lane in either direction',()=>{assert.equal(releaseTarget(65,.6,540,1080),540);assert.equal(releaseTarget(475,-.6,540,1080),0)})
test('slow release uses distance; paused drag has no stale momentum',()=>{assert.equal(releaseTarget(65,0,540,1080),0);assert.equal(releaseTarget(340,0,540,1080),540)})
test('momentum clamps at both ends; nested content has no lane snap',()=>{assert.equal(releaseTarget(1070,3,540,1080),1080);assert.equal(releaseTarget(10,-3,540,1080),0);assert.equal(releaseTarget(100,.5,0,800),220)})

test("Android touchend latency retains last movement speed; a real pause stops it",()=>{const samples=[{time:100,left:45},{time:142,left:67.5},{time:184,left:90}];assert(releaseVelocity(samples,268)>.35);assert.equal(releaseVelocity(samples,425),0)})
