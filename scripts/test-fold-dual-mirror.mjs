import {requireFoldDevice} from './lib/device-target.mjs'
/** App-owned ADB + native PixelCopy/Presentation; does not exercise a real hinge. */
import {connect} from './lib/android-cdp.mjs'
import {execFileSync} from 'node:child_process'
import {mkdirSync,writeFileSync} from 'node:fs'
import {randomBytes} from 'node:crypto'
import assert from 'node:assert/strict'
const serial=process.argv[2];requireFoldDevice(serial)
const dir='docs/validation/2026-09-10-fold-gradient/dual';mkdirSync(dir,{recursive:true})
const adb=(...args)=>execFileSync('adb',['-s',serial,...args],{maxBuffer:32*1024*1024})
assert(adb('shell','dumpsys','device_state').toString().includes('mOverrideState=Optional.empty'))
const pid=adb('shell','pidof','com.dsharnessmobile.shell').toString().trim().split(' ')[0]
const token=randomBytes(16).toString('hex'),uid=10300
const command=(mode,...args)=>execFileSync('java',['-cp','.tools/fold-lease-test','com.dsharnessmobile.shell.CommandMain',mode,''+uid,token,...args],{encoding:'utf8'})
const c=await connect(serial),pause=ms=>new Promise(r=>setTimeout(r,ms))
let acquired=false,initial
try {
 initial=await c.evaluate(`({fold:JSON.parse(androidBridge.foldStatus()),timeOrigin:performance.timeOrigin,drafts:[...document.querySelectorAll('[data-composer-input]')].map(e=>e.innerText)})`)
 assert(initial.fold.foreground,'DeepCode must be foreground and unlocked')
 assert.equal((await c.evaluate('JSON.parse(androidBridge.getAdbState())')).authorized,true)
 await c.evaluate('androidBridge.foldConfigure(false)')
 // A disposable diagnostic pattern prevents capturing personal conversation content.
 await c.evaluate(`(()=>{const e=document.createElement('div');e.id='__dualPattern';e.style.cssText='position:fixed;inset:0;z-index:2147483647;pointer-events:none;background:linear-gradient(90deg,#102f68,#e29928);color:white;font:40px sans-serif;display:flex;align-items:center;justify-content:center';e.textContent='DeepCode · 双屏同步 9:41';document.body.append(e)})()`)
 const granted=await c.evaluate(`JSON.parse(androidBridge.adbShell(${JSON.stringify(command('acquire','5',pid))}))`)
 acquired=granted.stdout?.includes('DSH_FOLD_GRANTED');assert(acquired,'App ADB did not acquire dual display')
 await c.evaluate('androidBridge.foldDualObserve()');await pause(2000)
 const alive=await c.evaluate(`JSON.parse(androidBridge.adbShell(${JSON.stringify(command('heartbeat'))}))`)
 assert(alive.stdout?.includes('DSH_FOLD_ALIVE'),'Lease died while app was alive')
 const probe=await c.evaluate('JSON.parse(androidBridge.foldDualStatus())')
 assert.equal(probe.mirrorShowing,true);assert(probe.mirrorFrames>=10);assert.equal(probe.mirrorError,null)
 const info=adb('shell','dumpsys','display').toString()
 const ids=info.split('\n').filter(l=>l.includes('DisplayDeviceInfo{')&&/state ON[, ]/.test(l)).map(l=>l.match(/StablePhysical\{id=(\d+)/)?.[1]).filter(Boolean)
 assert.equal(ids.length,2,'Both physical panels must report ON')
 for(const id of ids){const raw=adb('exec-out','screencap','-p','-d',id);const start=raw.indexOf(Buffer.from([137,80,78,71,13,10,26,10]));assert(start>=0);writeFileSync(`${dir}/display-${id}.png`,raw.subarray(start))}
 writeFileSync(dir+'/mirror-result.json',JSON.stringify({appOwnedAdb:true,physicalHingeTested:false,physicalOn:ids,probe,acquired,heartbeat:true},null,2))
 console.log(JSON.stringify({appOwnedAdb:true,bothPhysicalOn:true,frames:probe.mirrorFrames,mirrorError:probe.mirrorError}))
} finally {
 await c.evaluate('androidBridge.foldDualProbe(false);document.getElementById("__dualPattern")?.remove()').catch(()=>{})
 if(acquired){const release=command('release');await c.evaluate(`androidBridge.adbShell(${JSON.stringify(release)})`).catch(()=>adb('shell',release))}
 await c.evaluate(`androidBridge.foldConfigure(${initial?.fold.enabled??true})`).catch(()=>{})
 c.close()
 assert(adb('shell','dumpsys','device_state').toString().includes('mOverrideState=Optional.empty'),'Dual lease did not release')
}
