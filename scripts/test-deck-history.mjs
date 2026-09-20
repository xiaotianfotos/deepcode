import {connect} from './lib/android-cdp.mjs'
import {execFileSync} from 'node:child_process'
import {readFileSync,writeFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const [serial,folder]=process.argv.slice(2),c=await connect(serial),sid=JSON.parse(readFileSync(folder+'/sessions.json'))[0]
const read=()=>c.evaluate(`(()=>{const e=document.querySelector('.dsh-deck-chat');return {top:e.scrollTop,height:e.scrollHeight,length:e.innerText.length,running:!!e.closest('[data-deck-lane]').querySelector('.dsh-deck-running')}})()`)
try{
 const script=`import sys,uuid\nsys.path.insert(0,'scripts')\nfrom lib.dsh_device import Device\nd=Device(sys.argv[1])\ntry:\n d.rpc('session/prompt',{'request':{'sessionId':sys.argv[2],'requestId':uuid.uuid4().hex,'mode':'queue','content':[{'type':'text','text':'不要调用工具。再写30行不同的中文软件使用建议，编号H01至H30，每条独立一行。最后写 HISTORY_DONE。'}]}})\nfinally:\n d.close()\n`
 execFileSync('python3',['-c',script,serial,sid])
 await new Promise(r=>setTimeout(r,1500));await c.evaluate(`document.querySelector('.dsh-deck-chat').scrollTop=0`)
 const before=await read(),samples=[];let final
 const end=Date.now()+90000
 while(Date.now()<end){await new Promise(r=>setTimeout(r,500));final=await read();samples.push(final);assert.equal(final.top,0);if(!final.running && final.length>before.length)break}
 assert(final.length>before.length);assert(!final.running)
 writeFileSync(folder+'/history-scroll.json',JSON.stringify({passed:true,before,final,samples},null,2));console.log({passed:true,before,final})
}finally{c.close()}
