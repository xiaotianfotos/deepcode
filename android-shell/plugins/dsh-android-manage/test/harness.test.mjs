import {test} from 'node:test'
import assert from 'node:assert/strict'
import {registerHooks} from 'node:module'
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {parseViewport, pngSize, normalizedPoint, assertPoint} from '../lib/screen.js'
import {createImeInput, IME_ID} from '../lib/ime.js'
// Isolate bridge side effects; the installed DSH package is checked separately on device.
const hooks = process.env.DSH_REAL_TOOLS ? null : registerHooks({resolve(specifier, context, next) {
  if (specifier === '@deepseek-ai/dsh-tools') return {url:'data:text/javascript,export const defineTool = x => x',shortCircuit:true}
  return next(specifier,context)
}})
const {tools} = await import('../lib/index.js')
hooks?.deregister()
const viewport=(w=3408,h=2272,r=1)=>`Viewport INTERNAL: displayId=0, orientation=${r}, logicalFrame=[0, 0, ${w}, ${h}], isActive=[1]`
const png=(w,h)=>{const b=Buffer.alloc(24);Buffer.from('89504e470d0a1a0a','hex').copy(b);b.write('IHDR',12);b.writeUInt32BE(w,16);b.writeUInt32BE(h,20);return b}

test('current landscape viewport overrides natural portrait dimensions and ignores secondary displays',()=>{
 assert.deepEqual(parseViewport(`Physical size: 2272x3408\nViewport EXTERNAL: displayId=1, orientation=0, logicalFrame=[0, 0, 800, 600]\n${viewport()}`),{w:3408,h:2272,rotation:1,displayId:0})
 assert.throws(()=>parseViewport('Physical size: 2272x3408'))
 assert.throws(()=>parseViewport(viewport().replace('isActive=[1]','isActive=[0]')))
 assert.deepEqual(pngSize(png(3408,2272)),{w:3408,h:2272})
 assert.throws(()=>pngSize(Buffer.from('error: capture failed')))
})
test('coordinate limits include last pixel and reject the historical offscreen swipe',()=>{
 const s=parseViewport(viewport());assert.deepEqual(normalizedPoint(s,1,1),[3407,2271])
 assertPoint(s,3407,2271);assert.throws(()=>assertPoint(s,600,2600));assert.throws(()=>normalizedPoint(s,NaN,0))
})
const session={}
function fixture(t) {
 const dir=mkdtempSync(join(tmpdir(),'dsh-harness-test-'));const old=process.env.TMPDIR;process.env.TMPDIR=dir
 t.after(()=>{if(old===undefined)delete process.env.TMPDIR;else process.env.TMPDIR=old;rmSync(dir,{recursive:true,force:true})})
 const commands=[];let current=viewport(),rotation=1
 const priv={gateFor:()=>({ok:true}),audit(){},async execAdbShell(cmd){commands.push(cmd);return {ok:true,stdout:cmd==='dumpsys input'?current:''}},async execAdbLine(cmd){
  commands.push(cmd)
  const match=/adb pull \S+ (\S+)/.exec(cmd)
  if(match){
   const xml=`<hierarchy rotation="${rotation}"><node text="黄色" content-desc="" resource-id="color" class="Button" clickable="true" scrollable="false" bounds="[2300,1900][2500,2100]" /></hierarchy>`
   writeFileSync(match[1],cmd.includes('screencap')?png(3408,2272):xml)
  }
  return {ok:true,stdout:cmd.includes('screencap')?'dsh-shot':'Physical size: 2272x3408'}
 }}
 const map=Object.fromEntries(tools(priv).map(x=>[x.name,x]))
 return {commands,map,call:(name,args={},owner=session)=>map[name].execute(args,{agent:{session:owner}}),rotate(){current=viewport(2272,3408,0);rotation=0}}
}
test('model rendering includes the actual node table and snapshot; click consumes it',async t=>{
 const f=fixture(t),dump=await f.call('android_ui_dump')
 const rendered=JSON.parse(f.map.android_ui_dump.output.render({},dump)[0].text)
 assert.equal(rendered.nodes[0].text,'黄色');assert.deepEqual(rendered.screen,{w:3408,h:2272})
 await assert.rejects(f.call('android_ui_click',{ref:'id:n0'}),/snapshotId/)
 await assert.rejects(f.call('android_ui_click',{ref:'id:n0',snapshotId:dump.snapshotId},{}),/本会话/)
 await assert.rejects(f.call('android_ui_click',{ref:'id:n0',snapshotId:'stale'}),/snapshotId/)
 const clicked=await f.call('android_ui_click',{ref:'id:n0',snapshotId:dump.snapshotId})
 assert.equal(clicked.label,'黄色');assert.ok(f.commands.includes('input -d 0 tap 2400 2000'))
 await assert.rejects(f.call('android_ui_click',{ref:'id:n0',snapshotId:dump.snapshotId}),/快照/)
})
test('rotation invalidates cached nodes before injecting any input',async t=>{
 const f=fixture(t),dump=await f.call('android_ui_dump');f.rotate()
 await assert.rejects(f.call('android_ui_click',{ref:'id:n0',snapshotId:dump.snapshotId}),/旋转/)
 assert.equal(f.commands.filter(c=>c.startsWith('input ')).length,0)
})
test('invalid swipe never reaches ADB; normalized edges and full scroll stay in bounds',async t=>{
 const f=fixture(t)
 await assert.rejects(f.call('android_act_input',{action:'swipe',x:600,y:2600,x2:900,y2:2600}),/超出/)
 assert.equal(f.commands.filter(c=>c.startsWith('input ')).length,0)
 const shot=await f.call('android_screenshot')
 await f.call('android_ui_click',{nx:1,ny:1,snapshotId:shot.snapshotId})
 assert.ok(f.commands.includes('input -d 0 tap 3407 2271'))
 const r=await f.call('android_ui_scroll',{direction:'up',fraction:1})
 assertPoint(parseViewport(viewport()),...r.from);assertPoint(parseViewport(viewport()),...r.to)
})
test('screenshot dimensions come from PNG rather than wm size',async t=>{
 const f=fixture(t),r=await f.call('android_screenshot')
 assert.equal(r.width,3408);assert.equal(r.height,2272)
 assert.match(r.text,/视觉模型/)
})
function imeFixture({throwBroadcast=false,failRestore=false,userSwitch=false,initial='com.example/.Keyboard'}={}) {
 let current=initial;const commands=[]
 const input=createImeInput(async cmd=>{
  commands.push(cmd)
  if(cmd==='settings get secure default_input_method')return {ok:true,stdout:current}
  if(cmd.startsWith('ime set '))current=IME_ID
  if(cmd.startsWith('sleep ')){if(failRestore)return {ok:false,stdout:'disconnected'};current=initial}
  if(cmd.startsWith('am broadcast')) {if(userSwitch)current='com.user/.Chosen';if(throwBroadcast)throw new Error('broadcast exception');await new Promise(r=>setTimeout(r,2))}
  return {ok:true,stdout:''}
 })
 return {input,commands,current:()=>current}
}
test('IME restored and verified after a thrown injection',async()=>{
 const f=imeFixture({throwBroadcast:true}),r=await f.input('中文',false)
 assert.equal(r.ok,false);assert.match(r.stdout,/broadcast exception/);assert.equal(f.current(),'com.example/.Keyboard')
})
test('restoration failure is explicit, never reported as successful input',async()=>{
 const f=imeFixture({failRestore:true}),r=await f.input('中文',false)
 assert.equal(r.ok,false);assert.match(r.stdout,/输入法恢复失败/)
})
test('user input-method selection during the loan is preserved',async()=>{
 const f=imeFixture({userSwitch:true});assert.equal((await f.input('中文',false)).ok,true)
 assert.equal(f.current(),'com.user/.Chosen');assert.equal(f.commands.some(c=>c.startsWith('sleep ')),false)
})
test('overlapping IME loans serialize and both restore the real keyboard',async()=>{
 const f=imeFixture(),r=await Promise.all([f.input('甲',false),f.input('乙',false)])
 assert.ok(r.every(x=>x.ok));assert.equal(f.current(),'com.example/.Keyboard')
 assert.equal(f.commands.filter(c=>c.startsWith('sleep ')).length,2)
})
test('unknown or already-automated original IME fails before switching',async()=>{
 for(const initial of ['null',IME_ID]){
  const f=imeFixture({initial}),r=await f.input('中文',false)
  assert.equal(r.ok,false);assert.equal(f.commands.some(c=>c.startsWith('ime set')),false)
 }
})

test('normalized clicks reject stale screenshot orientation and cancelled calls inject nothing',async t=>{
 const f=fixture(t),shot=await f.call('android_screenshot');f.rotate()
 await assert.rejects(f.call('android_ui_click',{nx:.5,ny:.5,snapshotId:shot.snapshotId}),/旋转/)
 const controller=new AbortController();controller.abort()
 await assert.rejects(f.map.android_act_input.execute({action:'keyevent',keycode:4},{agent:{session},signal:controller.signal}),/取消/)
 assert.equal(f.commands.some(c=>c.startsWith('input ')),false)
})
