import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
const {outputFiles}=await build({entryPoints:['src/client/format.ts'],bundle:true,format:'esm',write:false})
const {percentage}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'))
test('missing/invalid GPU counters never claim idle GPU',()=>{
  for(const value of [null,undefined,NaN,Infinity,-1,101,'50'])assert.equal(percentage(value),'不可用')
  assert.equal(percentage(0),'0.0%');assert.equal(percentage(53.27),'53.3%')
})
