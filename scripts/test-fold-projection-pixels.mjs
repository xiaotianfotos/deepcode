import {requireFoldDevice} from './lib/device-target.mjs'
/** Native compositor evidence for complementary inner/outer blur masks. */
import {connect} from './lib/android-cdp.mjs'
import {execFileSync} from 'node:child_process'
import {mkdirSync,writeFileSync} from 'node:fs'
import {randomBytes} from 'node:crypto'
import assert from 'node:assert/strict'
const serial=process.argv[2];requireFoldDevice(serial)
const dir=process.argv[3]??'docs/validation/2026-09-10-fold-gradient/dual/inner-upright';mkdirSync(dir,{recursive:true})
const adb=(...args)=>execFileSync('adb',['-s',serial,...args],{maxBuffer:32*1024*1024})
const c=await connect(serial),pause=ms=>new Promise(r=>setTimeout(r,ms));let initial,acquired=false
const token=randomBytes(16).toString('hex'),pid=adb('shell','pidof','com.dsharnessmobile.shell').toString().trim().split(' ')[0]
const command=(mode,...args)=>execFileSync('java',['-cp','.tools/fold-lease-test','com.dsharnessmobile.shell.CommandMain',mode,'10300',token,...args],{encoding:'utf8'})
const native=async command=>c.evaluate(`JSON.parse(androidBridge.adbShell(${JSON.stringify(command)}))`)
const capture=(name,id)=>{const raw=adb('exec-out','screencap','-p','-d',id),p=raw.indexOf(Buffer.from([137,80,78,71,13,10,26,10]));assert(p>=0);writeFileSync(`${dir}/${name}.png`,raw.subarray(p))}
try{
 initial=await c.evaluate('JSON.parse(androidBridge.foldStatus())');assert(initial.foreground)
 await c.evaluate('androidBridge.foldConfigure(false)');await pause(500)
 assert(adb('shell','dumpsys','device_state').toString().includes('mOverrideState=Optional.empty'))
 const grant=await native(command('acquire','6',pid));acquired=grant.stdout?.includes('DSH_FOLD_GRANTED');assert(acquired)
 await pause(1200)
 await c.evaluate(`(()=>{const e=document.createElement('canvas');e.id='__projectionPattern';e.width=Math.round(innerWidth*devicePixelRatio);e.height=Math.round(innerHeight*devicePixelRatio);e.style.cssText='position:fixed;inset:0;width:100%;height:100%;z-index:2147483647;pointer-events:none';document.body.append(e);const draw=()=>{e.width=Math.round(innerWidth*devicePixelRatio);e.height=Math.round(innerHeight*devicePixelRatio);const ctx=e.getContext('2d'),data=ctx.createImageData(e.width,e.height);for(let y=0;y<e.height;y++)for(let x=0;x<e.width;x++){let v=128+105*Math.sin(x*Math.PI/12);const i=(y*e.width+x)*4;data.data[i]=data.data[i+1]=data.data[i+2]=v;data.data[i+3]=255}ctx.putImageData(data,0,0);ctx.fillStyle='#ff00cc';ctx.fillRect(0,100,Math.round((window.__dshNavigationInset?.(innerWidth)??0)*devicePixelRatio),e.height-200);ctx.fillStyle='#f04433';ctx.fillRect(0,0,e.width,100);ctx.fillStyle='#2255ee';ctx.fillRect(0,e.height-100,e.width,100);ctx.fillStyle='white';ctx.font='bold 48px sans-serif';ctx.fillText('TOP  ↑  123',32,66);ctx.fillText('BOTTOM  ↓  789',32,e.height-28)};draw();const observer=new ResizeObserver(draw);observer.observe(e);e.__cleanup=()=>observer.disconnect()})()`)
 await c.evaluate('androidBridge.foldDualObserve()');await pause(250)
 await pause(650)
 assert((await c.evaluate('JSON.parse(androidBridge.foldDualStatus())')).clearSourceReady,'clear hardware source unavailable')
 const ids={inner:'4639175402683733248',outer:'4639175068132267009'}
 for(const [name,id] of Object.entries(ids))capture(name+'-clear',id)
 const samples=[]
 for(const angle of [20,45,70,120,160]){
  await native(command('heartbeat'))
  await c.evaluate(`androidBridge.foldProjectionPreview(${angle})`);await pause(550)
  const state=await c.evaluate('({fold:JSON.parse(androidBridge.foldStatus()),probe:JSON.parse(androidBridge.foldDualStatus())})')
  assert.equal(state.fold.shaderError,null);assert.equal(state.probe.mirrorError,null);assert(state.probe.mirrorShowing)
  for(const [name,id] of Object.entries(ids))capture(name+'-'+angle,id)
  samples.push({angle,...state})
 }
 writeFileSync(dir+'/result.json',JSON.stringify({simulatedAngles:true,appOwnedAdb:true,samples},null,2))
 console.log(JSON.stringify({bothPhysicalScreensCaptured:true,samples:samples.length,shaderErrors:false}))
}finally{
 await c.evaluate('androidBridge.foldDualProbe(false);androidBridge.foldConfigure(false);document.getElementById("__projectionPattern")?.__cleanup?.();document.getElementById("__projectionPattern")?.remove()').catch(()=>{})
 if(acquired)await native(command('release')).catch(()=>adb('shell',command('release')))
 await c.evaluate(`androidBridge.foldConfigure(${initial?.enabled??true})`).catch(()=>{});c.close()
}
