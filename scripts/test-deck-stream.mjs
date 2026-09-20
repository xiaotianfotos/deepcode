import {connect} from './lib/android-cdp.mjs'
import {spawn} from 'node:child_process'
import {writeFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const [serial,folder]=process.argv.slice(2),c=await connect(serial)
const read=()=>c.evaluate(`[...document.querySelectorAll('[data-deck-lane]')].map(e=>({id:e.dataset.deckLane,text:e.querySelector('.dsh-deck-chat').innerText,length:e.querySelector('.dsh-deck-chat').innerText.length,running:!!e.querySelector('.dsh-deck-running'),height:e.clientHeight,scrollHeight:e.querySelector('.dsh-deck-chat').scrollHeight,scrollTop:e.querySelector('.dsh-deck-chat').scrollTop}))`)
const samples=[]
try{
 const script=`import sys,json,uuid\nfrom pathlib import Path\nsys.path.insert(0,'scripts')\nfrom lib.dsh_device import Device\nd=Device(sys.argv[1])\ntry:\n d.authenticate()\n ids=json.loads(Path(sys.argv[2]+'/sessions.json').read_text())\n for i,sid in enumerate(ids):\n  letter='ABCD'[i]\n  prompt='这是四会话渲染验收。不要调用任何工具。只输出40行编号列表，每行以 '+letter+'- 开头，编号01到40，后面写一句不同的简短中文软件使用建议。最后一行输出 DECK_'+letter+'_DONE。'\n  d.rpc('session/prompt',{'request':{'sessionId':sid,'requestId':uuid.uuid4().hex,'mode':'queue','content':[{'type':'text','text':prompt}]}})\nfinally:\n d.close()\n`
 const p=spawn('python3',['-c',script,serial,folder],{stdio:['ignore','pipe','pipe']})
 let error='';p.stderr.on('data',s=>error+=s);const finished=new Promise((res,rej)=>p.on('exit',code=>code?rej(Error(error)):res()))
 await finished
 const end=Date.now()+150000
 let final
 while(Date.now()<end){final=await read();samples.push({at:Date.now(),lanes:final.map(({text,...r})=>r)});if(final.every((r,i)=>r.text.includes('DECK_'+'ABCD'[i]+'_DONE')&&!r.running))break;await new Promise(r=>setTimeout(r,500))}
 assert.equal(final.length,4)
 assert(final.every((r,i)=>r.text.includes('DECK_'+'ABCD'[i]+'_DONE')&&!r.running),'All four lanes must finish')
 assert.equal(new Set(final.map(r=>r.height)).size,1)
 for(let i=0;i<4;i++)assert(new Set(samples.map(s=>s.lanes[i].length)).size>2,'Must observe streamed updates in each lane')
 writeFileSync(folder+'/four-streams.json',JSON.stringify({passed:true,samples,final},null,2))
 console.log(JSON.stringify({passed:true,samples:samples.length,final:final.map(({text,...r})=>r)},null,2))
}finally{c.close()}
