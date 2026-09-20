import {requireFoldDevice} from './lib/device-target.mjs'
/** Real Fold cover: normal -> state 6 wide mirror -> normal, without submitting a chat. */
import {connect} from './lib/android-cdp.mjs'
import {execFileSync} from 'node:child_process'
import {mkdirSync,writeFileSync} from 'node:fs'
import {randomBytes} from 'node:crypto'
import assert from 'node:assert/strict'

const serial=process.argv[2],baseline=process.argv.includes('--baseline')
requireFoldDevice(serial)
const dir='docs/validation/2026-09-10-fold-gradient/dual/cover-crop'
mkdirSync(dir,{recursive:true})
const adb=(...args)=>execFileSync('adb',['-s',serial,...args],{maxBuffer:32*1024*1024})
const c=await connect(serial),pause=ms=>new Promise(r=>setTimeout(r,ms))
const pid=adb('shell','pidof','com.dsharnessmobile.shell').toString().trim().split(' ')[0]
const token=randomBytes(16).toString('hex')
const command=(mode,...args)=>execFileSync('java',['-cp','.tools/fold-lease-test','com.dsharnessmobile.shell.CommandMain',mode,'10300',token,...args],{encoding:'utf8'})
const native=async cmd=>c.evaluate(`JSON.parse(androidBridge.adbShell(${JSON.stringify(cmd)}))`)
const sample=()=>c.evaluate(`(()=>{
 const frame=document.querySelector('[data-mobile-topbar]')?.parentElement;
 const editor=document.querySelector('[contenteditable="true"]');
 const drawer=frame?.children[1],r=drawer?.getBoundingClientRect();
 const original=window.__coverLayoutTest;
 return {width:innerWidth,dpr:devicePixelRatio,sidebarRight:r?.right,expectedInset:window.__dshNavigationInset?.(innerWidth),mobile:frame?.dataset.mobile==='true',rail:frame?.dataset.sidebarCollapsed==='true',drawerOpen:drawer?.dataset.open==='true',drawerVisible:!!r&&r.right>0&&r.left<424,sameEditor:original?.editor===editor,draftUnchanged:original?.text===(editor?.textContent??''),sameDocument:original?.origin===performance.timeOrigin,fold:JSON.parse(androidBridge.foldStatus()),probe:JSON.parse(androidBridge.foldDualStatus())};
})()`)
const screenshot=name=>{
 const raw=adb('exec-out','screencap','-p','-d','4639175068132267009')
 const start=raw.indexOf(Buffer.from([137,80,78,71,13,10,26,10]));assert(start>=0)
 writeFileSync(`${dir}/${baseline?'before':'after'}-${name}.png`,raw.subarray(start))
}
let initial,acquired=false
const samples=[]
try{
 initial=await c.evaluate('JSON.parse(androidBridge.foldStatus())')
 assert(initial.foreground,'Requires unlocked Fold in DeepCode')
 await c.evaluate('androidBridge.foldConfigure(false)');await pause(600)
 assert(adb('shell','dumpsys','device_state').toString().includes('mOverrideState=Optional.empty'))
 await c.evaluate(`window.__coverLayoutTest={editor:document.querySelector('[contenteditable="true"]'),text:document.querySelector('[contenteditable="true"]')?.textContent??'',origin:performance.timeOrigin};true`)
 const closed=await sample();samples.push({phase:'closed',...closed})
 assert(closed.mobile===(closed.width<640));assert(!closed.drawerOpen);screenshot('initial')
 const result=await native(command('acquire','6',pid));acquired=result.stdout?.includes('DSH_FOLD_GRANTED');assert(acquired)
 await pause(1000);await c.evaluate('androidBridge.foldDualObserve()');await pause(650)
 const wide=await sample();samples.push({phase:'wide-mirror',...wide})
 assert(wide.width>=640);assert(wide.probe.mirrorShowing&&wide.probe.clearSourceReady)
 assert(wide.sameEditor&&wide.draftUnchanged&&wide.sameDocument)
 if(baseline){assert(wide.rail&&!wide.mobile)}
 else{assert(!wide.mobile&&wide.rail&&!wide.drawerOpen);assert(wide.expectedInset>0);assert(Math.abs(wide.probe.coverContentOffsetPx-wide.expectedInset*wide.dpr)<1);assert(wide.sidebarRight*wide.dpr-wide.probe.coverContentOffsetPx<=1)}
 screenshot('wide')
 await native(command('heartbeat'))
 await c.evaluate('androidBridge.foldDualProbe(false)');await pause(350)
 await native(command('release'));acquired=false;await pause(750)
 const restored=await sample();samples.push({phase:'restored',...restored})
 assert(restored.mobile===(restored.width<640));assert(!restored.drawerOpen);assert.equal(restored.probe.coverContentOffsetPx,0)
 assert(restored.sameEditor&&restored.draftUnchanged&&restored.sameDocument)
 screenshot('restored')
 writeFileSync(`${dir}/${baseline?'before':'after'}.json`,JSON.stringify({baseline,appOwnedAdb:true,simulatedDisplayState:true,samples},null,2)+'\n')
 console.log(JSON.stringify({baseline,samples:samples.map(s=>({phase:s.phase,width:s.width,mobile:s.mobile,rail:s.rail,coverCropPx:s.probe.coverContentOffsetPx,sameEditor:s.sameEditor,draftUnchanged:s.draftUnchanged}))},null,2))
}finally{
 await c.evaluate('androidBridge.foldDualProbe(false);delete window.__coverLayoutTest').catch(()=>{})
 if(acquired)await native(command('release')).catch(()=>adb('shell',command('release')))
 await c.evaluate(`androidBridge.foldConfigure(${initial?.enabled??true})`).catch(()=>{})
 c.close()
}
