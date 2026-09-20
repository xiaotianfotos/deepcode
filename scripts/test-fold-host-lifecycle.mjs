/** Foreground lifecycle test on an already verified lhasa debug installation. */
import {connect} from './lib/android-cdp.mjs'
import {execFileSync} from 'node:child_process'
import {mkdirSync,writeFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const serial=process.argv[2];assert(serial)
const adb=(...a)=>execFileSync('adb',['-s',serial,...a],{encoding:'utf8',timeout:15000})
assert.equal(adb('shell','getprop','ro.product.device').trim(),'lhasa')
const c=await connect(serial),sleep=ms=>new Promise(r=>setTimeout(r,ms)),results=[]
const wait=async predicate=>{for(let i=0;i<70;i++){const s=await c.evaluate('JSON.parse(androidBridge.foldStatus())');if(predicate(s))return s;await sleep(150)}throw Error('Lifecycle did not settle')}
try{
 const initial=await wait(s=>s.foreground && s.dual.active);assert(initial.hingeDegrees>175)
 await c.evaluate(`window.__lifecycleCheck={editor:document.querySelector('[contenteditable=true]'),draft:document.querySelector('[contenteditable=true]')?.textContent,origin:performance.timeOrigin};true`)
 for(const cover of [false,true]){
  await c.evaluate(`androidBridge.foldHostPreview(${cover})`)
  await wait(s=>s.dual.primaryCover===cover && s.dual.hostReady)
  adb('shell','am','start','-a','android.settings.SETTINGS')
  const background=await wait(s=>!s.foreground && s.dual.leasedState===0 && !s.dual.working)
  assert.equal(background.dual.mirrorShowing,false);assert.equal(background.dual.primaryCover,false)
  assert(adb('shell','dumpsys','device_state').includes('mOverrideState=Optional.empty'))
  adb('shell','am','start','-n','com.dsharnessmobile.shell/.MainActivity')
  await c.evaluate('androidBridge.foldHostPreview(false)')
  const resumed=await wait(s=>s.foreground && s.dual.active && s.dual.hostReady && !s.dual.primaryCover)
  const continuity=await c.evaluate(`(()=>{const o=window.__lifecycleCheck,e=document.querySelector('[contenteditable=true]');return {sameEditor:e===o.editor,sameDraft:e?.textContent===o.draft,sameDocument:performance.timeOrigin===o.origin}})()`)
  assert(Object.values(continuity).every(Boolean))
  assert.equal(resumed.dual.mirrorError,null);assert.equal(resumed.dual.error,null)
  results.push({coverHostBeforePause:cover,background:{leased:background.dual.leasedState,mirrorShowing:background.dual.mirrorShowing},resumed:{leased:resumed.dual.leasedState,hostReady:resumed.dual.hostReady},...continuity})
 }
 const dir=process.argv[3]??'docs/validation/2026-09-11-fold-stable-host';mkdirSync(dir,{recursive:true})
 writeFileSync(dir+'/lifecycle.json',JSON.stringify({physicalHinge:179,simulatedCoverHost:true,results},null,2)+'\n')
 console.log(results)
}finally{
 adb('shell','am','start','-n','com.dsharnessmobile.shell/.MainActivity')
 await c.evaluate('androidBridge.foldHostPreview(false);delete window.__lifecycleCheck').catch(()=>{});c.close()
}
