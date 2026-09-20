/** Exercise actual plugin controls, cancellation and privacy without submitting any agent turn. */
import{connect}from'./lib/android-cdp.mjs'
import{mkdirSync,writeFileSync}from'node:fs'
import assert from'node:assert/strict'
const[serial,folder]=process.argv.slice(2);if(!folder)throw new Error('Usage: SERIAL OUTPUT')
const c=await connect(serial),results=[];mkdirSync(folder,{recursive:true})
const pause=ms=>new Promise(r=>setTimeout(r,ms))
const click=t=>c.evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent===${JSON.stringify(t)});if(!b)throw new Error('Missing button');b.click();return true})()`)
const state=()=>c.evaluate('JSON.parse(androidBridge.voiceStatus())')
const draft=()=>c.evaluate(`document.querySelector('[data-composer-input]')?.innerText`)
const record=async()=>{await c.evaluate(`document.querySelector('[aria-label="语音输入"]').click()`);for(let i=0;i<450;i++){const s=await state();if(s.phase==='recording')return s;if(s.phase==='error')throw new Error(s.error);await pause(200)}throw new Error('Capture not ready')}
try{
 await click('设置');await pause(200);await click('语音输入');await pause(200)
 assert.match(await c.evaluate(`document.querySelector('[data-plugin="voice-settings"]').innerText`),/Qwen3-ASR-0.6B/)
 const checkbox=`document.querySelector('[data-plugin="voice-settings"] input')`
 if(!await c.evaluate(`${checkbox}.checked`))await c.evaluate(`${checkbox}.click()`)
 await click('关闭');await pause(250);const before=await draft()
 await record();await click('设置');await pause(200);await click('语音输入');await pause(150);await c.evaluate(`${checkbox}.click()`);await pause(500)
 assert.equal((await state()).phase,'canceled');await click('关闭');await pause(200)
 assert.equal(await c.evaluate(`!!document.querySelector('.dsh-voice-control')`),false);assert.equal(await draft(),before);results.push({test:'disable during recording releases mic and retains draft',passed:true})
 await click('设置');await pause(150);await click('语音输入');await pause(100);await c.evaluate(`${checkbox}.click()`);await click('关闭');await pause(150)
 await record();await c.evaluate(`document.querySelector('[aria-label="取消语音输入"]').click()`);await pause(400);assert.equal((await state()).phase,'canceled');assert.equal(await draft(),before);results.push({test:'re-enable, record and explicit cancel',passed:true})
 await click('设置');await pause(150);await click('性能调试');await pause(150)
 const perf=`document.querySelector('[data-plugin="performance-settings"] input')`
 if(!await c.evaluate(`${perf}.checked`))await c.evaluate(`${perf}.click()`)
 await pause(1500);assert(await c.evaluate(`!!document.querySelector('aside.dsh-performance-overlay')`))
 await c.evaluate(`${perf}.click()`);await pause(300);assert.equal(await c.evaluate(`!!document.querySelector('aside.dsh-performance-overlay')`),false)
 // Instrument only the public sampler call to verify the disabled UI has no polling timer.
 await c.evaluate(`window.__originalPerformanceBridge=window.androidBridge;window.__samplerCalls=0;window.androidBridge=new Proxy(window.__originalPerformanceBridge,{get(t,k){if(k==='performanceSample')return()=>{window.__samplerCalls++;return t.performanceSample()};return t[k]}})`)
 await pause(2200);assert.equal(await c.evaluate('window.__samplerCalls'),0)
 await c.evaluate('window.androidBridge=window.__originalPerformanceBridge;delete window.__originalPerformanceBridge;delete window.__samplerCalls')
 await c.evaluate(`${perf}.click()`);await pause(1500);results.push({test:'performance toggle stops polling and resumes',passed:true,sample:await c.evaluate('JSON.parse(androidBridge.performanceSample())')})
 await click('关闭');await pause(200)
 const shot=await c.call('Page.captureScreenshot',{format:'png'});writeFileSync(folder+'/plugins.png',Buffer.from(shot.data,'base64'))
 console.log(JSON.stringify(results,null,2))
}finally{await c.evaluate('if(window.__originalPerformanceBridge){window.androidBridge=window.__originalPerformanceBridge;delete window.__originalPerformanceBridge;delete window.__samplerCalls}').catch(()=>{});writeFileSync(folder+'/lifecycle.json',JSON.stringify(results,null,2));c.close()}
