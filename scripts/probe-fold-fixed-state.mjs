/** Bounded display-policy experiment. Holds OPENED (3), never changes base state. */
import {connect} from './lib/android-cdp.mjs';
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
const serial=process.argv[2],seconds=Number(process.argv[3]??45),state=Number(process.argv[4]??3);assert([3,5].includes(state));
assert(serial&&seconds>0&&seconds<=60);
const dir=`docs/validation/2026-09-11-fold-fixed-state/state-${state}`;mkdirSync(dir,{recursive:true});
const adb=(...a)=>execFileSync('adb',['-s',serial,...a],{encoding:'utf8',timeout:12000});
assert.equal(adb('shell','getprop','ro.product.device').trim(),'lhasa');
const c=await connect(serial),pause=ms=>new Promise(r=>setTimeout(r,ms));
const native=async cmd=>c.evaluate(`JSON.parse(androidBridge.adbShell(${JSON.stringify(cmd)}))`);
const token=randomBytes(16).toString('hex'),lease='/data/local/tmp/dsh-fold-fixed-probe.lease';
const q=s=>"'"+s.replaceAll("'","'\"'\"'")+"'";
const cleanup=`if [ "$(sed -n '1p' ${lease} 2>/dev/null)" = '${token}' ]; then owner="$(sed -n '2p' ${lease})"; if [ "$(dumpsys device_state | sed -n '/^Request: /p')" = "$owner" ]; then cmd display disable-display 1; cmd device_state state reset; fi; rm -f ${lease}; fi`;
const watch=`sleep 70; ${cleanup}`;
let initial,owned=false,start=0;
try{
 initial=await c.evaluate('JSON.parse(androidBridge.foldStatus())');assert(initial.foreground&&initial.hingeDegrees>175,'Start fully open');
 await c.evaluate('androidBridge.foldConfigure(false)');await pause(600);
 assert.equal((await c.evaluate('JSON.parse(androidBridge.foldStatus()).dual')).leasedState,0);
 const request=`umask 077
 dumpsys device_state | grep -q 'mOverrideState=Optional.empty' || exit 1
 cmd display get-displays --ids-only | grep -qx 1 && exit 1
 (set -C; echo ${token} > ${lease}) || exit 1
 cmd device_state state ${state} || { rm -f ${lease}; exit 1; }
 owner="$(dumpsys device_state | sed -n '/^Request: /p')"
 case "$owner" in *mRequestedState=${state},*) ;; *) rm -f ${lease}; exit 1;; esac
 echo "$owner" >> ${lease}
 nohup sh -c ${q(watch)} </dev/null >/dev/null 2>&1 &
 cmd display enable-display 1
 echo DSH_FIXED_GRANTED`;
 const result=await native(request);owned=result.stdout?.includes('DSH_FIXED_GRANTED');assert(owned,result.stdout);
 await c.evaluate('androidBridge.foldConfigure(true);androidBridge.foldDualObserve()');
 start=Number(adb('shell','date','+%s.%N').trim());let lastObserve=Date.now(),lastSample=0;
 console.log('FIXED_STATE_READY');
 const samples=[],endAt=Date.now()+seconds*1000;
 while(Date.now()<endAt){
  if(Date.now()-lastObserve>11000){await c.evaluate('androidBridge.foldDualObserve()');lastObserve=Date.now()}
  const s=await c.evaluate('({t:Date.now(),fold:JSON.parse(androidBridge.foldStatus()),probe:JSON.parse(androidBridge.foldDualStatus()),cssWidth:innerWidth})');
  if(Date.now()-lastSample>800){
   const ds=adb('shell','dumpsys','device_state');s.base=Number(ds.match(/mBaseState=.*identifier=(\d+)/)?.[1]);s.committed=Number(ds.match(/mCommittedState=.*identifier=(\d+)/)?.[1]);lastSample=Date.now()
  }
  samples.push(s);await pause(150);
 }
 const end=Number(adb('shell','date','+%s.%N').trim());
 const power=adb('logcat','-d','-v','epoch','-s','LocalDisplayAdapter').split('\n').filter(l=>{let t=Number(l.trim().split(/\s+/)[0]);return t>=start&&t<=end&&l.includes('setDisplayState(')});
 const summary={start,end,angles:[Math.min(...samples.map(s=>s.fold.hingeDegrees)),Math.max(...samples.map(s=>s.fold.hingeDegrees))],bases:[...new Set(samples.flatMap(s=>s.base==null?[]:[s.base]))],committed:[...new Set(samples.flatMap(s=>s.committed==null?[]:[s.committed]))],power,policyOnly:true,visualAcceptance:false};
 writeFileSync(dir+'/trace.json',JSON.stringify(samples,null,2));writeFileSync(dir+'/result.json',JSON.stringify(summary,null,2));console.log(summary)
}finally{
 await c.evaluate('androidBridge.foldDualProbe(false);androidBridge.foldConfigure(false)').catch(()=>{});
 if(owned)await native(cleanup).catch(()=>adb('shell',cleanup));
 await c.evaluate(`androidBridge.foldConfigure(${initial?.enabled??true})`).catch(()=>{});c.close()
}
