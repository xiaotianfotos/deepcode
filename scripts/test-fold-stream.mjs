import{connect}from './lib/android-cdp.mjs'
import{execFileSync,spawn}from'node:child_process'
import{readFileSync,writeFileSync}from'node:fs'
import assert from'node:assert/strict'
const[serial,folder]=process.argv.slice(2);assert.equal(serial,'emulator-5582');const c=await connect(serial),ids=JSON.parse(readFileSync(folder+'/sessions.json')),samples=[],pause=ms=>new Promise(r=>setTimeout(r,ms))
const read=()=>c.evaluate(`(()=>{const e=document.querySelector('[data-deck-lane="${ids[1]}"]');return {text:e.querySelector('.dsh-deck-chat').innerText,running:!!e.querySelector('.dsh-deck-running'),drafts:[...document.querySelectorAll('[data-composer-input]')].map(e=>e.innerText),timeOrigin:performance.timeOrigin,width:innerWidth}})()`)
try{
 const initial=await read(),pid=execFileSync('adb',['-s',serial,'shell','pidof','com.dsharnessmobile.shell'],{encoding:'utf8'}).trim()
 const marker='FOLD_REPLY_'+Date.now()
 const p=spawn('python3',['scripts/fold-stream-fixture.py',serial,ids[1],marker],{stdio:['ignore','pipe','pipe']});let error='',output='';p.stderr.on('data',s=>error+=s)
 const finished=new Promise((res,rej)=>p.on('exit',code=>code?rej(Error(error)):res()));finished.catch(()=>{})
 await new Promise((res,rej)=>{p.stdout.on('data',s=>{output+=s;if(output.includes('READY'))res()});p.on('exit',code=>{if(!output.includes('READY'))rej(Error(error||'Fixture exited early'))})})
 let nextFold=Date.now()+400,n=0
 const deadline=Date.now()+120000
 while(Date.now()<deadline){const s=await read();samples.push({at:Date.now(),...s});if(n<8&&Date.now()>nextFold){execFileSync('adb',['-s',serial,'emu',n++%2?'unfold':'fold']);nextFold=Date.now()+1100}if(n>=4&&s.text.includes(marker)&&!s.running)break;await pause(180)}
 await finished;assert(output.includes('\"completed\": true'));const end=await read();assert(end.text.includes(marker));assert(!end.running);assert.equal(end.timeOrigin,initial.timeOrigin);assert.deepEqual(end.drafts,initial.drafts);assert(samples.some(s=>s.running&&s.width<640));assert(samples.some(s=>s.running&&s.width>640));assert(new Set(samples.filter(s=>s.running).map(s=>s.text.length)).size>2);assert.equal(execFileSync('adb',['-s',serial,'shell','pidof','com.dsharnessmobile.shell'],{encoding:'utf8'}).trim(),pid)
 writeFileSync(folder+'/stream-tests.json',JSON.stringify({passed:true,source:'deterministic SSE fixture; LAN model offline',folds:n,samples},null,2));console.log(JSON.stringify({passed:true,folds:n,incrementalUpdates:new Set(samples.map(s=>s.text.length)).size}))
}finally{execFileSync('adb',['-s',serial,'emu','unfold']);c.close()}
