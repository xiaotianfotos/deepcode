import{connect}from'./lib/android-cdp.mjs'
import{writeFileSync,mkdirSync}from'node:fs';import assert from'node:assert/strict'
const[serial,folder]=process.argv.slice(2);if(!folder)throw new Error('Usage: SERIAL OUTPUT');mkdirSync(folder,{recursive:true});
const c=await connect(serial),pause=ms=>new Promise(r=>setTimeout(r,ms))
const click=t=>c.evaluate(`(()=>{[...document.querySelectorAll('button')].find(b=>b.textContent===${JSON.stringify(t)}).click();return true})()`)
try{
 await click('设置');await pause(150);await click('语音输入');await pause(150);await c.evaluate(`document.querySelector('[data-plugin="voice-settings"] input').click()`)
 await click('性能调试');await pause(150);await c.evaluate(`document.querySelector('[data-plugin="performance-settings"] input').click()`)
 await c.call('Page.reload');await pause(2500)
 assert.equal(await c.evaluate(`!!document.querySelector('.dsh-voice-control')`),false);assert.equal(await c.evaluate(`!!document.querySelector('aside.dsh-performance-overlay')`),false)
 await click('设置');await pause(150);await click('语音输入');await pause(150);assert.equal(await c.evaluate(`document.querySelector('[data-plugin="voice-settings"] input').checked`),false)
 await c.evaluate(`document.querySelector('[data-plugin="voice-settings"] input').click()`)
 await click('性能调试');await pause(150);assert.equal(await c.evaluate(`document.querySelector('[data-plugin="performance-settings"] input').checked`),false)
 await c.evaluate(`document.querySelector('[data-plugin="performance-settings"] input').click()`);await click('关闭');await pause(1500)
 assert(await c.evaluate(`!!document.querySelector('.dsh-voice-control')`));assert(await c.evaluate(`!!document.querySelector('aside.dsh-performance-overlay')`))
 const report={passed:true,test:'both switches persist disabled across real WebView reload, independently re-enabled in settings'};writeFileSync(folder+'/persistence.json',JSON.stringify(report,null,2));console.log(report)
}finally{c.close()}
