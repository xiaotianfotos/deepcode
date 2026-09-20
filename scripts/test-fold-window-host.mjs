/** Debug-only host transition regression. CDP input does not prove physical touch/IME. */
import {connect} from './lib/android-cdp.mjs'
import {execFileSync} from 'node:child_process'
import {mkdirSync,writeFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const serial=process.argv[2];assert(serial)
const dir=process.argv[3]??'docs/validation/2026-09-11-fold-stable-host'
const adb=(...a)=>execFileSync('adb',['-s',serial,...a],{encoding:'utf8',timeout:15000})
assert.equal(adb('shell','getprop','ro.product.device').trim(),'lhasa')
mkdirSync(dir,{recursive:true});const c=await connect(serial),samples=[]
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const start=Number(adb('shell','date','+%s.%N').trim())
try{
 const s=await c.evaluate('JSON.parse(androidBridge.foldStatus())')
 assert(s.foreground && s.hingeDegrees>175 && s.dual.leasedState===5)
 await c.evaluate(`window.__hostCheck={editor:document.querySelector('[contenteditable=true]'),draft:document.querySelector('[contenteditable=true]')?.textContent,origin:performance.timeOrigin};true`)
 for(let i=0;i<6;i++){
  const cover=i%2===0;await c.evaluate(`androidBridge.foldHostPreview(${cover})`)
  let sample
  for(let j=0;j<25;j++){
   await sleep(100)
   sample=await c.evaluate(`(()=>{const s=JSON.parse(androidBridge.foldStatus()),o=window.__hostCheck,e=document.querySelector('[contenteditable=true]');return {t:Date.now(),dual:s.dual,width:innerWidth,height:innerHeight,shaderError:s.shaderError,sameEditor:o.editor===e,sameDraft:o.draft===e?.textContent,sameDocument:o.origin===performance.timeOrigin}})()`)
   if(sample.dual.primaryCover===cover && sample.dual.hostReady)break
  }
  assert.equal(sample.dual.primaryCover,cover);assert(sample.dual.hostReady)
  assert(sample.sameEditor && sample.sameDraft && sample.sameDocument)
  assert.equal(sample.shaderError,null);assert.equal(sample.dual.error,null);assert.equal(sample.dual.mirrorError,null)
  samples.push(sample)
 }
 const end=Number(adb('shell','date','+%s.%N').trim())
 const power=adb('logcat','-d','-v','epoch','-s','LocalDisplayAdapter').split('\n').filter(l=>{const t=Number(l.trim().split(/\s+/)[0]);return t>=start&&t<=end&&l.includes('setDisplayState(')})
 const result={start,end,simulatedHost:true,physicalFold:false,physicalTouchAndImeVerified:false,samples,powerEvents:power}
 writeFileSync(dir+'/result.json',JSON.stringify(result,null,2)+'\n')
 assert.equal(power.length,0)
 console.log({hostChanges:samples.length,widths:samples.map(s=>s.width),sameDocumentAndEditorAndDraft:true,shaderAndHostErrors:false,powerEvents:power.length,physicalTouchAndImeVerified:false})
}finally{await c.evaluate('androidBridge.foldHostPreview(false);delete window.__hostCheck').catch(()=>{});c.close()}
