/** Observe user-operated physical folding; never inject hinge angles or edit text. */
import {connect} from './lib/android-cdp.mjs'
import {execFileSync} from 'node:child_process'
import {mkdirSync,writeFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
const [serial,folder,seconds='80']=process.argv.slice(2)
mkdirSync(folder,{recursive:true});const c=await connect(serial),trace=[]
const adb=(...args)=>execFileSync('adb',['-s',serial,...args],{encoding:'utf8'})
const started=Date.now(),pid=adb('shell','pidof','com.dsharnessmobile.shell').trim()
try {
 await c.evaluate(`void(window.__physicalFoldEditors=[...document.querySelectorAll('[data-composer-input]')])`)
 console.log('READY: observing physical hinge and display handoffs')
 while(Date.now()-started<Number(seconds)*1000){
  const s=await c.evaluate(`(()=>{const e=[...document.querySelectorAll('[data-composer-input]')];return {fold:JSON.parse(androidBridge.foldStatus()),timeOrigin:performance.timeOrigin,width:innerWidth,height:innerHeight,visibility:document.visibilityState,editorCount:e.length,sameEditors:e.length===window.__physicalFoldEditors.length&&e.every((v,i)=>v===window.__physicalFoldEditors[i]),drafts:e.map(v=>v.innerText)}})()`)
  const draftHash=createHash('sha256').update(JSON.stringify(s.drafts)).digest('hex');delete s.drafts
  trace.push({at:Date.now()-started,...s,draftHash});await new Promise(r=>setTimeout(r,100))
 }
 const first=trace[0],end=trace.at(-1),panels=[...new Set(trace.map(s=>s.fold.panel).filter(Boolean))]
 const result={observed:true,physicalFoldTested:panels.length>1,panels,
  angleMin:Math.min(...trace.map(s=>s.fold.hingeDegrees)),angleMax:Math.max(...trace.map(s=>s.fold.hingeDegrees)),
  phases:[...new Set(trace.map(s=>s.fold.phase))],hingeObserved:trace.some(s=>s.fold.phase==='hinge'&&s.fold.blurAmount>0),
  spatialProfile:trace.filter(s=>s.fold.blurAmount>0).every(s=>s.fold.sigmaLeftPx>s.fold.sigmaCenterPx&&s.fold.sigmaRightPx===0),
  rendererErrors:trace.some(s=>s.fold.shaderError),endedClear:end.fold.phase==='idle'&&end.fold.blurAmount===0,
  sameWebView:trace.every(s=>s.timeOrigin===first.timeOrigin),sameEditors:trace.every(s=>s.sameEditors),draftPreserved:trace.every(s=>s.draftHash===first.draftHash),
  pidPreserved:adb('shell','pidof','com.dsharnessmobile.shell').trim()===pid,
  transitions:end.fold.transitions-first.fold.transitions,completed:end.fold.completed-first.fold.completed,
  systemCoverPolicy:adb('shell','settings','get','system','close_lid_display_setting').trim()}
 writeFileSync(folder+'/physical-trace.json',JSON.stringify(trace,null,2));writeFileSync(folder+'/physical-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2))
}finally{await c.evaluate('delete window.__physicalFoldEditors').catch(()=>{});c.close()}
