import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
const { outputFiles } = await build({entryPoints:['src/client/draft.ts'],bundle:true,format:'esm',write:false})
const { insertion } = await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'))
test('append at current revision without replacing draft or attachment spans',()=>{
  const state={draft:'现有文字 📎报告.pdf',draftRev:19,phase:'plain'}
  assert.deepEqual(insertion(state,'  识别结果  '),{text:'\n识别结果',span:{start:state.draft.length,end:state.draft.length,draftRev:19}})
  assert.equal(state.draft,'现有文字 📎报告.pdf')
})
test('empty draft and existing separator',()=>{
  assert.equal(insertion({draft:'',draftRev:0,phase:'plain'},'你好').text,'你好')
  assert.equal(insertion({draft:'原文\n',draftRev:3,phase:'plain'},'你好').text,'你好')
})
test('never overwrite claimed or submitting input and ignore empty transcript',()=>{
  for(const phase of ['claimed','adjudicating','submitting'])assert.equal(insertion({draft:'保留',draftRev:2,phase},'你好'),undefined)
  assert.equal(insertion({draft:'保留',draftRev:2,phase:'plain'},' \n'),undefined)
})
test('reference chips occupy one detect coordinate, not their expanded file path',()=>{
  const state={draft:'保留 @very-long-path/report.pdf ',draftRev:20,phase:'plain',occurrences:[{length:26}]}
  assert.deepEqual(insertion(state,'你好'),{text:'你好',span:{start:state.draft.length-25,end:state.draft.length-25,draftRev:20}})
  const two={draft:'x'.repeat(30),draftRev:21,phase:'plain',occurrences:[{length:12},{length:8}]}
  assert.equal(insertion(two,'你好').span.start,12)
})
test('invalid occurrence projection fails closed',()=>{
  assert.equal(insertion({draft:'短',draftRev:1,phase:'plain',occurrences:[{length:99}]},'你好'),undefined)
})
