import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
const result=await build({entryPoints:['src/client/state.ts'],bundle:true,format:'esm',write:false})
const {adjacent,assign}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'))
test('cycle skips vacancies in both directions',()=>{const a=['A',null,'C',null];assert.equal(adjacent(a,0,1),2);assert.equal(adjacent(a,2,1),0);assert.equal(adjacent(a,0,-1),2);assert.equal(adjacent([null,null,null,null],0,1),0)})
test('moving session swaps occupied slot and never duplicates',()=>{const a=['A','B','C',null];assert.deepEqual(assign(a,1,'A'),['B','A','C',null]);assert.deepEqual(a,['A','B','C',null]);assert.deepEqual(assign(a,3,'A'),[null,'B','C','A']);assert.deepEqual(assign(a,1,null),['A',null,'C',null])})
