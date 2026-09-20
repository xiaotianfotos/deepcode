/** Read-only real hinge/display evidence. Does not inject angles or switch displays. */
import {connect} from './lib/android-cdp.mjs'
import {execFileSync} from 'node:child_process'
import {mkdirSync,writeFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const serial=process.argv[2],seconds=Number(process.argv[3]??90)
assert(serial);assert(seconds>0&&seconds<=180)
const dir=process.argv[4]??'docs/validation/2026-09-10-fold-gradient/dual/secondary-display'
mkdirSync(dir,{recursive:true})
const adb=(...args)=>execFileSync('adb',['-s',serial,...args],{maxBuffer:32*1024*1024})
assert.equal(adb('shell','getprop','ro.product.device').toString().trim(),'lhasa');
const c=await connect(serial),samples=[]
const start=Number(adb('shell','date','+%s.%N').toString().trim()),deadline=Date.now()+seconds*1000
await c.evaluate(`window.__secondaryWatch={editor:document.querySelector('[contenteditable="true"]'),text:document.querySelector('[contenteditable="true"]')?.textContent??'',origin:performance.timeOrigin};true`)
let captured=false
try{
 while(Date.now()<deadline){
  const s=await c.evaluate(`(()=>{const s=JSON.parse(androidBridge.foldStatus()),f=document.querySelector('[data-mobile-topbar]')?.parentElement,e=document.querySelector('[contenteditable="true"]'),o=window.__secondaryWatch;return {t:Date.now(),...s,cssWidth:innerWidth,mobile:f?.dataset.mobile==='true',rail:f?.dataset.sidebarCollapsed==='true',sameEditor:e===o?.editor,sameDocument:performance.timeOrigin===o?.origin,draftUnchanged:(e?.textContent??'')===o?.text}})()`)
  samples.push(s)
  if(!captured&&s.dual.active&&s.dual.clearSourceReady&&s.hingeDegrees>20&&s.hingeDegrees<150){
   for(const [name,id] of Object.entries({inner:'4639175402683733248',outer:'4639175068132267009'})){
    const raw=adb('exec-out','screencap','-p','-d',id),at=raw.indexOf(Buffer.from([137,80,78,71,13,10,26,10]));if(at>=0)writeFileSync(`${dir}/${name}-physical.png`,raw.subarray(at))
   }
   captured=true
  }
  await new Promise(r=>setTimeout(r,150))
 }
 const end=Number(adb('shell','date','+%s.%N').toString().trim())
 const power=adb('logcat','-d','-v','epoch','-s','LocalDisplayAdapter','LogicalDisplayMapper').toString().split('\n').filter(line=>{
  const t=Number(line.trim().split(/\s+/)[0]);return t>=start&&t<=end&&/setDisplayState\(|Applying layout:/.test(line)
 })
 const summary={start,end,samples:samples.length,angles:[Math.min(...samples.map(s=>s.hingeDegrees)),Math.max(...samples.map(s=>s.hingeDegrees))],modes:[...new Set(samples.map(s=>s.dual.mode))],activeSamples:samples.filter(s=>s.dual.active).length,roles:[...new Set(samples.map(s=>s.dual.primaryCover))],sameEditor:samples.every(s=>s.sameEditor),sameDocument:samples.every(s=>s.sameDocument),draftUnchanged:samples.every(s=>s.draftUnchanged),errors:[...new Set(samples.flatMap(s=>[s.shaderError,s.dual.error,s.dual.mirrorError]).filter(Boolean))],powerEvents:power.filter(l=>l.includes('setDisplayState(')),final:{angle:samples.at(-1)?.hingeDegrees,dual:samples.at(-1)?.dual}}
 writeFileSync(dir+'/trace.json',JSON.stringify(samples,null,2)+'\n');writeFileSync(dir+'/power.txt',power.join('\n')+'\n');writeFileSync(dir+'/result.json',JSON.stringify(summary,null,2)+'\n');console.log(summary)
}finally{await c.evaluate('delete window.__secondaryWatch').catch(()=>{});c.close()}
