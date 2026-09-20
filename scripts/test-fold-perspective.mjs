/** Fixed-angle native shader check. Own stable state-5 lease with watchdog and pixel assertions. */
import {connect} from './lib/android-cdp.mjs';
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
const serial=process.argv[2];assert(serial);
const adb=(...a)=>execFileSync('adb',['-s',serial,...a],{maxBuffer:32*1024*1024,timeout:15000});
assert.equal(adb('shell','getprop','ro.product.device').toString().trim(),'lhasa');
const dir=process.argv[3]??'docs/validation/2026-09-11-fold-perspective';mkdirSync(dir,{recursive:true});
const classes='.tools/fold-state-test';mkdirSync(classes,{recursive:true});
execFileSync('javac',['-d',classes,'android-shell/app/src/main/java/com/dsharnessmobile/shell/FoldDualCommands.java','scripts/fixtures/fold/FoldLeaseMain.java']);
const c=await connect(serial),pause=ms=>new Promise(r=>setTimeout(r,ms));
const token=randomBytes(16).toString('hex');
const pid=adb('shell','pidof','com.dsharnessmobile.shell').toString().trim().split(' ')[0];
const uid=adb('shell','run-as','com.dsharnessmobile.shell','id','-u').toString().trim();
const command=mode=>execFileSync('java',['-cp',classes,'com.dsharnessmobile.shell.FoldLeaseMain',mode,uid,token,pid],{encoding:'utf8'});
const native=async mode=>c.evaluate(`JSON.parse(androidBridge.adbShell(${JSON.stringify(command(mode))}))`);
const capture=(label,id)=>{let raw=adb('exec-out','screencap','-p','-d',id),p=raw.indexOf(Buffer.from([137,80,78,71,13,10,26,10]));assert(p>=0);writeFileSync(`${dir}/${label}.png`,raw.subarray(p));};
let initial,owned=false;
try{
 initial=await c.evaluate('JSON.parse(androidBridge.foldStatus())');assert(initial.foreground);assert(initial.hingeDegrees>175,'Test requires stable fully open device');
 await c.evaluate('androidBridge.foldConfigure(false)');
 for(let i=0;i<50;i++){const d=await c.evaluate('JSON.parse(androidBridge.foldStatus()).dual');if(!d.leasedState&&!d.working)break;await pause(100);}

 assert.equal((await c.evaluate('JSON.parse(androidBridge.foldStatus()).dual')).leasedState,0);
 const grant=await native('acquire');owned=grant.stdout?.includes('DSH_FOLD_GRANTED');assert(owned,grant.stdout);
 await c.evaluate(`(()=>{window.__perspectiveCheck={editor:document.querySelector('[contenteditable="true"]'),draft:document.querySelector('[contenteditable="true"]')?.textContent,origin:performance.timeOrigin};let e=document.createElement('canvas');e.id='__perspectiveGrid';e.width=Math.round(innerWidth*devicePixelRatio);e.height=Math.round(innerHeight*devicePixelRatio);e.style.cssText='position:fixed;inset:0;width:100%;height:100%;z-index:2147483647;pointer-events:none';document.body.append(e);const c=e.getContext('2d'),w=e.width,h=e.height;c.fillStyle='#28384a';c.fillRect(0,0,w,h);for(let i=0;i<=20;i++){c.strokeStyle=i%5?'#a0a8b0':'#ffffff';c.lineWidth=i%5?2:5;c.beginPath();c.moveTo(i*w/20,0);c.lineTo(i*w/20,h);c.stroke();c.beginPath();c.moveTo(0,i*h/20);c.lineTo(w,i*h/20);c.stroke()}c.fillStyle='#dd5533';c.fillRect(0,0,w,60);c.fillStyle='#3355dd';c.fillRect(0,h-60,w,60);c.fillStyle='#33dd77';c.fillRect(w*.5-6,0,12,h);return true})()`);
 await c.evaluate('androidBridge.foldDualObserve()');await pause(850);
 assert((await c.evaluate('JSON.parse(androidBridge.foldDualStatus())')).clearSourceReady);
 const ids={inner:'4639175402683733248',outer:'4639175068132267009'};
 const samples=[];
 for(const angle of [180,120,60,0]){
  await native('heartbeat');await c.evaluate(`androidBridge.foldProjectionPreview(${angle})`);await pause(450);
  const state=await c.evaluate('({main:JSON.parse(androidBridge.foldStatus()),probe:JSON.parse(androidBridge.foldDualStatus())})');
  assert.equal(state.main.shaderError,null);assert.equal(state.probe.mirrorError,null);assert(state.probe.mirrorShowing);
  for(const [name,id] of Object.entries(ids))capture(`${name}-${angle}`,id);
  samples.push({angle,...state});
 }
 execFileSync('python3',['scripts/check-fold-perspective-pixels.py',dir],{stdio:'pipe'});
 const continuity=await c.evaluate('({sameEditor:window.__perspectiveCheck.editor===document.querySelector("[contenteditable=true]"),sameDraft:window.__perspectiveCheck.draft===document.querySelector("[contenteditable=true]")?.textContent,sameDocument:window.__perspectiveCheck.origin===performance.timeOrigin})');
 assert(Object.values(continuity).every(Boolean));
 writeFileSync(`${dir}/native-shader.json`,JSON.stringify({simulatedAngles:true,visualAccepted:false,continuity,samples},null,2)+'\n');
 console.log({nativeShaderErrors:false,bothScreensPixelVerified:true,angles:samples.map(s=>s.angle),...continuity});
}finally{
 await c.evaluate('androidBridge.foldDualProbe(false);androidBridge.foldConfigure(false);document.getElementById("__perspectiveGrid")?.remove();delete window.__perspectiveCheck').catch(()=>{});
 if(owned)await native('release').catch(()=>adb('shell',command('release')));
 await c.evaluate(`androidBridge.foldConfigure(${initial?.enabled??true})`).catch(()=>{});c.close();
}
