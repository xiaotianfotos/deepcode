import {requireFoldDevice} from './lib/device-target.mjs'
/** Observe actual sensor/power transitions. No angle injection or permissions changes. */
import {connect} from './lib/android-cdp.mjs'
import {execFileSync} from 'node:child_process'
import {mkdirSync,writeFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
const serial=process.argv[2],seconds=Number(process.argv[3]??70)
requireFoldDevice(serial)
const dir='docs/validation/2026-09-10-fold-gradient/dual/physical';mkdirSync(dir,{recursive:true})
const adb=(...args)=>execFileSync('adb',['-s',serial,...args],{encoding:'utf8'})
const c=await connect(serial),trace=[],start=Date.now();let lastPower=0,power=[]
try{
 console.log('READY: physical dual-display recording')
 while(Date.now()-start<seconds*1000){
  const state=await c.evaluate(`({fold:JSON.parse(androidBridge.foldStatus()),timeOrigin:performance.timeOrigin,drafts:[...document.querySelectorAll('[data-composer-input]')].map(e=>e.innerText)})`)
  const draftHash=createHash('sha256').update(JSON.stringify(state.drafts)).digest('hex');delete state.drafts
  if(Date.now()-lastPower>=450){
   power=adb('shell','dumpsys','display').split('\n').filter(l=>l.includes('DisplayDeviceInfo{')).map(l=>({physicalId:l.match(/StablePhysical\{id=(\d+)/)?.[1],state:l.match(/state (ON|OFF|DOZE_SUSPEND|DOZE)/)?.[1]})).filter(x=>x.physicalId)
   lastPower=Date.now()
  }
  trace.push({ms:Date.now()-start,...state,draftHash,power})
  await new Promise(r=>setTimeout(r,100))
 }
 const result={angleMin:Math.min(...trace.map(s=>s.fold.hingeDegrees)),angleMax:Math.max(...trace.map(s=>s.fold.hingeDegrees)),
  bothPhysicalOnWithMirror:trace.some(s=>s.power.filter(p=>p.state==='ON').length===2 && s.fold.dual.active),
  acquiredStates:[...new Set(trace.map(s=>s.fold.dual.leasedState).filter(Boolean))],
  maxMirrorFrames:Math.max(...trace.map(s=>s.fold.dual.mirrorFrames)),
  errors:[...new Set(trace.flatMap(s=>[s.fold.shaderError,s.fold.dual.error,s.fold.dual.mirrorError]).filter(Boolean))],
  sameWebView:trace.every(s=>s.timeOrigin===trace[0].timeOrigin),draftPreserved:trace.every(s=>s.draftHash===trace[0].draftHash),
  endedReleased:trace.at(-1).fold.dual.leasedState===0,endedClear:trace.at(-1).fold.blurAmount===0,
  coverPolicy:adb('shell','settings','get','system','close_lid_display_setting').trim()}
 writeFileSync(dir+'/trace.json',JSON.stringify(trace,null,2));writeFileSync(dir+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2))
}finally{c.close()}
