import{connect}from'./lib/android-cdp.mjs'
import{execFileSync}from'node:child_process'
import{writeFileSync,mkdirSync}from'node:fs'
import assert from'node:assert/strict'
const[serial,folder]=process.argv.slice(2);mkdirSync(folder,{recursive:true})
const c=await connect(serial),results=[],pause=ms=>new Promise(r=>setTimeout(r,ms))
const state=()=>c.evaluate('JSON.parse(androidBridge.voiceStatus())')
const record=async()=>{await c.evaluate(`document.querySelector('[aria-label="语音输入"]').click()`);for(let i=0;i<450;i++){const s=await state();if(s.phase==='recording')return;if(s.phase==='error')throw new Error(s.error);await pause(200)}throw new Error('Recording unavailable')}
const adb=(...args)=>execFileSync('adb',['-s',serial,...args],{encoding:'utf8'})
try{
 const original=await c.evaluate(`document.querySelector('[data-composer-input]').innerText`)
 await record();adb('shell','input','keyevent','3');await pause(1000)
 assert.equal((await state()).phase,'canceled');adb('shell','am','start','-n','com.dsharnessmobile.shell/.MainActivity');await pause(1000)
 assert.equal(await c.evaluate(`document.querySelector('[data-composer-input]').innerText`),original)
 results.push({test:'Home cancels microphone, foreground restores unchanged draft',passed:true})
 await record();await c.evaluate(`document.querySelector('[aria-label="会话“你好”的操作"]').closest('[role=treeitem]').click()`);await pause(800)
 assert.equal((await state()).phase,'canceled');assert.equal(await c.evaluate(`document.querySelector('[data-composer-input]').innerText`),'')
 await c.evaluate(`document.querySelector('[aria-label="在“work”中新建会话"]').click()`);await pause(600)
 assert.equal(await c.evaluate(`document.querySelector('[data-composer-input]').innerText`),original)
 results.push({test:'session switch cancels microphone without cross-session insertion',passed:true})
 const rows=adb('shell','ps','-A','-o','PID,UID,NAME').split('\n').map(line=>line.trim().split(/\s+/));const uid=rows.find(row=>row[2]==='com.dsharnessmobile.shell')[1];
 const procs=rows.filter(row=>row[1]===uid&&row[2]==='libdsh_voice_server.so').map(row=>row[0])
 assert.deepEqual(procs,[]);results.push({test:'cancellation leaves no ASR engine process',passed:true})
 console.log(JSON.stringify(results,null,2))
}finally{writeFileSync(folder+'/navigation.json',JSON.stringify(results,null,2));c.close()}
