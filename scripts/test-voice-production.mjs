/** Fixed-fixture test in the real APK process through the production SSE parser. */
import {connect} from './lib/android-cdp.mjs'
import {mkdirSync,writeFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const [serial,folder]=process.argv.slice(2)
if(!folder)throw Error('Usage: SERIAL OUTPUT')
mkdirSync(folder,{recursive:true})
const c=await connect(serial),rows=[],pause=ms=>new Promise(r=>setTimeout(r,ms))
try{
 const initial=await c.evaluate('JSON.parse(androidBridge.voiceStatus())')
 assert(['idle','canceled','error'].includes(initial.phase),'Active user voice request')
 const before=await c.evaluate('[...document.querySelectorAll("[data-composer-input]")].map(e=>e.innerText)')
 for(const compatibility of [false,true,false]){
  const id='voice-production-'+Date.now(),start=Date.now()
  const r=await c.evaluate(`JSON.parse(androidBridge.voiceTestSample(${JSON.stringify(id)},${compatibility}))`)
  assert(r.ok,r.error)
  let s
  for(let i=0;i<600;i++){
   s=await c.evaluate('JSON.parse(androidBridge.voiceStatus())')
   if(['done','error','canceled'].includes(s.phase))break
   await pause(200)
  }
  assert.equal(s.phase,'done',s.error)
  assert.equal(s.engine,compatibility?'compatibility':'kleidiai')
  assert.equal(s.text.replace(/[。！？，、\s]/g,''),'甚至出现交易几乎停滞的情况')
  assert(s.engineReady)
  rows.push({engine:s.engine,source:'bundled public WAV in APK, no microphone',text:s.text,
   requestMs:s.requestMs,firstTextMs:s.firstTextMs,wallMs:Date.now()-start,passed:true})
  await c.evaluate(`androidBridge.voiceAcknowledge(${JSON.stringify(id)})`)
 }
 assert.deepEqual(await c.evaluate('[...document.querySelectorAll("[data-composer-input]")].map(e=>e.innerText)'),before,'Test changed a draft')
 console.log(JSON.stringify(rows))
}finally{
 await c.evaluate('androidBridge.voiceRelease()').catch(()=>{})
 writeFileSync(folder+'/app-fixture.json',JSON.stringify(rows,null,2)+'\n');c.close()
}
