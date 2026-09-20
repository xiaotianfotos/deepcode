import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,writeFileSync,chmodSync,rmSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {AndroidCodexClient} from '../src/client.mjs'
const fixture=`const readline=require('readline');readline.createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);if(!m.id)return;if(m.method==='hang')return;if(m.method==='crash')process.exit(3);process.stdout.write(JSON.stringify({id:m.id,result:{method:m.method}})+'\\n')})`
const stubborn=`const readline=require('readline');readline.createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);if(m.id){if(m.method==='hang')return;process.stdout.write(JSON.stringify({id:m.id,result:{}})+'\\n')}});process.on('SIGTERM',()=>{});setInterval(()=>{},1000)`
const emitter=`const readline=require('readline');readline.createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);if(m.method==='emit'){process.stdout.write(JSON.stringify({method:'turn/started',params:{turn:{id:m.params.turnId}}})+'\\n');return}if(m.id)process.stdout.write(JSON.stringify({id:m.id,result:{method:m.method}})+'\\n')})`
const stubbornEmitter=`const readline=require('readline');readline.createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);if(m.method==='emit'){process.stdout.write(JSON.stringify({method:'turn/started',params:{turn:{id:m.params.turnId}}})+'\\n');return}if(m.id)process.stdout.write(JSON.stringify({id:m.id,result:{method:m.method}})+'\\n')});process.on('SIGTERM',()=>{});setInterval(()=>{},1000)`
const slowBoot=`const readline=require('readline');let held=[];readline.createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);if(m.method==='initialize'){held.push(m);return}if(m.method==='release'){for(const h of held)process.stdout.write(JSON.stringify({id:h.id,result:{}})+'\\n');held=[];return}if(m.id)process.stdout.write(JSON.stringify({id:m.id,result:{method:m.method}})+'\\n')})`
test('concurrent starts share a runtime; responses and timeout are settled',async()=>{
  const c=new AndroidCodexClient({command:process.execPath,args:['-e',fixture],requestTimeoutMs:50})
  try{await Promise.all([c.start(),c.start()]);const pid=c.process.pid
    assert.equal((await c.request('account/read')).method,'account/read');assert.equal(c.process.pid,pid)
    await assert.rejects(c.request('hang'),/超时/);assert.equal(c.pending.size,0)
  }finally{await c.close()}
  assert.equal(c.process,null)
})
test('disabled backend parks start without settling or spawning, and work still rejects',async()=>{
  // The pinned relay adapter awaits start() once at activation, so a disabled
  // cold start parks (no spawn, no settle) instead of poisoning that one-shot.
  const c=new AndroidCodexClient({command:process.execPath,args:['-e',fixture],enabled:()=>false})
  const parked=c.start();let parkedState='pending'
  parked.then(()=>{parkedState='resolved'},()=>{parkedState='rejected'})
  await assert.rejects(c.request('turn/start'),error=>error.code==='ANDROID_CODEX_DISABLED')
  await assert.rejects(c.request('account/read'),/尚未启动|启用/)
  assert.equal(c.process,null);assert.equal(parkedState,'pending')
  await c.close()
  await assert.rejects(parked,/已关闭/)
  assert.equal(c.closing,null);assert.equal(c.process,null)
})
test('dispose aborts a parked cold start as a permanent unload',async()=>{
  const c=new AndroidCodexClient({command:process.execPath,args:['-e',fixture],enabled:()=>false})
  const parked=c.start()
  await c.dispose()
  await assert.rejects(parked,/已卸载/)
  assert.equal(c.closing,null);assert.equal(c.process,null)
})
test('resume after enable wakes parked cold starts and they share one boot',async()=>{
  let enabled=false
  const c=new AndroidCodexClient({command:process.execPath,args:['-e',fixture],enabled:()=>enabled})
  try{
    const relayStyle=c.start(),second=c.start()
    let settled=false;relayStyle.then(()=>{settled=true},()=>{settled=true})
    await Promise.resolve()
    assert.equal(settled,false);assert.equal(c.process,null)
    enabled=true;c.resume()
    await Promise.all([relayStyle,second])
    assert.equal((await c.request('account/read')).method,'account/read')
    const pid=c.process.pid
    await c.start()
    assert.equal(c.process.pid,pid) // woken waiters share the single boot
  }finally{await c.close()}
})
test('reported repro: close, start, close kills the live child and clears closing',async()=>{
  const c=new AndroidCodexClient({command:process.execPath,args:['-e',fixture]})
  await c.close() // no child yet: must not strand a stale resolved closing promise
  await c.start()
  const child=c.process
  const exited=new Promise(resolve=>child.once('exit',resolve))
  await c.close() // previously returned the stale promise and leaked this child
  assert.equal(c.process,null);assert.equal(c.closing,null)
  await exited
})
test('crash fails pending work and a deliberate restart can connect again',async()=>{
  const c=new AndroidCodexClient({command:process.execPath,args:['-e',fixture]})
  try{await c.start();await assert.rejects(c.request('crash'),/exited/);await c.start();assert.equal((await c.request('account/read')).method,'account/read')}finally{await c.close()}
})
test('pending turn and out-of-order completion cannot allow mid-turn logout',async()=>{
  const c=new AndroidCodexClient({command:process.execPath,args:['-e',fixture]})
  try{
    await c.start();const pending=c.request('turn/start');assert.equal(c.hasActiveWork,true);await pending
    c.receive(JSON.stringify({method:'turn/started',params:{turn:{id:'one'}}}));assert.equal(c.hasActiveWork,true)
    c.receive(JSON.stringify({method:'turn/completed',params:{turn:{id:'one'}}}));assert.equal(c.hasActiveWork,false)
    c.receive(JSON.stringify({method:'turn/started',params:{turn:{id:'one'}}}));assert.equal(c.hasActiveWork,false)
    const id=c.nextId;c.pending.set(id,{method:'turn/start',timer:null,resolve(){},reject(){}})
    c.receive(JSON.stringify({id,result:{turn:{id:'one',status:'inProgress'}}}));assert.equal(c.hasActiveWork,false)
  }finally{await c.close()}
})
test('close is idempotent and shares a single kill across concurrent callers',async()=>{
  const c=new AndroidCodexClient({command:process.execPath,args:['-e',fixture]})
  await c.start()
  const child=c.process;let kills=0;const realKill=child.kill.bind(child)
  child.kill=signal=>{kills++;return realKill(signal)}
  await Promise.all([c.close(),c.close(),c.close()])
  assert.equal(kills,1);assert.equal(c.process,null)
  await c.close() // repeated close after completion stays a no-op
})
test('close falls back to SIGKILL when the child ignores SIGTERM',async()=>{
  const c=new AndroidCodexClient({command:process.execPath,args:['-e',stubborn]})
  await c.start()
  const startedAt=Date.now()
  await Promise.all([c.close(),c.close()])
  assert.equal(c.process,null)
  assert.ok(Date.now()-startedAt>=1900&&Date.now()-startedAt<6000)
})
test('a slow old close cannot corrupt the newer generation',async()=>{
  const c=new AndroidCodexClient({command:process.execPath,args:['-e',stubborn]})
  try{
    await c.start()
    const oldHang=c.request('hang');oldHang.catch(()=>{})
    const closing=c.close() // not awaited: SIGTERM-stubborn child lingers ~2s
    await c.start()         // generation 2 boots while the old exit wait runs
    const pid=c.process.pid
    const fresh=c.request('account/read')
    const newHang=c.request('hang');newHang.catch(()=>{})
    await assert.rejects(oldHang,/已关闭|exited/) // only generation-1 work settles
    await fresh // generation-2 work survives the old close (stubborn fixture replies empty)
    assert.equal(c.process.pid,pid) // the old tail never wiped generation-2 state
    await closing
    assert.equal(c.pending.size,1)  // only the generation-2 hang stays outstanding
    await c.close()
    await assert.rejects(newHang,/已关闭|exited/)
    assert.equal(c.process,null)
  }finally{await c.close()}
})
test('stale-instance callbacks cannot reject the newer instance pending requests',async()=>{
  const c=new AndroidCodexClient({command:process.execPath,args:['-e',fixture]})
  try{
    await c.start();const old=c.process
    const hanging=c.request('hang');hanging.catch(()=>{})
    await assert.rejects(c.request('crash'),/exited/)
    await c.start()
    const fresh=c.request('account/read')
    const outstanding=c.request('hang');outstanding.catch(()=>{})
    // The crashed child's armed error listener fires after the new boot landed;
    // generation tagging must keep it away from instance-2 work.
    old.emit('error',new Error('stale late failure'))
    assert.equal((await fresh).method,'account/read')
    assert.equal(c.pending.size,1) // only the instance-2 hang stays outstanding
  }finally{await c.close()}
})
test('stdout lines from a stale child cannot dispatch into the current generation',async()=>{
  const c=new AndroidCodexClient({command:process.execPath,args:['-e',emitter]})
  await c.start();const old=c.process
  try{
    // Interleaved restart: boot generation 2 while the old child still lingers.
    c.starting=null
    await c.start()
    const fresh=c.process;assert.notEqual(fresh.pid,old.pid)
    const seen=[];c.on('notification',message=>seen.push(message.params?.turn?.id))
    old.stdin.write(JSON.stringify({method:'emit',params:{turnId:'stale-turn'}})+'\n')
    fresh.stdin.write(JSON.stringify({method:'emit',params:{turnId:'current-turn'}})+'\n')
    await new Promise(resolve=>setTimeout(resolve,250))
    assert.equal(seen.includes('stale-turn'),false) // stale stdout dropped at boot tag
    assert.ok(seen.includes('current-turn'))       // current child still dispatches
    assert.equal(c.hasActiveWork,true)
    old.kill('SIGKILL');await new Promise(resolve=>old.once('exit',resolve))
    assert.equal(c.hasActiveWork,true) // the old exit cleared nothing from generation 2
  }finally{await c.close()}
})
test('close during an in-flight start leaves no runnable process',async()=>{
  const deaf=`const readline=require('readline');readline.createInterface({input:process.stdin})`
  const c=new AndroidCodexClient({command:process.execPath,args:['-e',deaf]})
  const starting=c.start()
  assert.ok(c.process,'boot spawns synchronously before the first await')
  await c.close()
  await assert.rejects(starting,/exited|已关闭/)
  assert.equal(c.process,null)
})
test('a stale child exit is never republished while a newer generation is live',async()=>{
  // The pinned runtime subscribes to client 'exit' and fails active turns on
  // every event, so a SIGTERM-stubborn old child's delayed exit must stay
  // private: the current session's turns must survive the stale event.
  const c=new AndroidCodexClient({command:process.execPath,args:['-e',stubbornEmitter]})
  const exits=[];c.on('exit',event=>exits.push(event))
  await c.start();const old=c.process
  const closing=c.close() // not awaited: stubborn gen1 lingers inside its escalation window
  await c.start()         // generation 2 boots while the old exit wait runs
  assert.notEqual(c.process.pid,old.pid)
  c.process.stdin.write(JSON.stringify({method:'emit',params:{turnId:'gen2-turn'}})+'\n')
  assert.equal((await c.request('account/read')).method,'account/read')
  assert.equal(c.hasActiveWork,true) // live gen2 turn: exactly what a republished exit would fail
  await new Promise(resolve=>old.once('exit',resolve)) // deterministic barrier: the delayed stale exit lands now
  assert.equal(exits.length,0) // no public exit event reached subscribers
  assert.equal(c.hasActiveWork,true) // and nothing gen2-relative was cleared
  assert.equal((await c.request('account/read')).method,'account/read') // session still usable
  await closing
  assert.equal(exits.length,0)
  await c.close()
  assert.equal(exits.length,1) // only generation 2's real exit is published
  assert.equal(c.process,null)
})
test('an in-flight boot is active work with an accurate pending lifetime',async()=>{
  // Disable gating must see initialize in flight (otherwise a mid-boot kill
  // permanently poisons the relay's cached one-shot activation), but a merely
  // resolved starting handle must never keep the client permanently busy.
  const c=new AndroidCodexClient({command:process.execPath,args:['-e',slowBoot]})
  const booting=c.start()
  assert.ok(c.process,'boot spawns synchronously before the first await')
  assert.equal(c.hasActiveWork,true) // initialize outstanding: the stop gate must reject
  c.notify('release',{})
  await booting
  assert.equal(c.hasActiveWork,false)
  assert.ok(c.starting,'a resolved boot handle stays cached for dedup but must not stay busy')
  await c.close()
  const booting2=c.start()
  assert.equal(c.hasActiveWork,true) // a second boot window flips busy again
  c.notify('release',{})
  await booting2
  assert.equal(c.hasActiveWork,false);assert.equal(c.booting,0)
  await c.close()
})
test('a second disable kills the newer stubborn child, not a stale closing promise',async()=>{
  const c=new AndroidCodexClient({command:process.execPath,args:['-e',stubborn]})
  let close1,close2
  try{
    await c.start();const gen1=c.process
    close1=c.close() // not awaited: ~2s escalation window with a stubborn child
    await c.start();const gen2=c.process // re-enable boots gen2 inside the window
    assert.notEqual(gen2.pid,gen1.pid)
    await c.request('account/read') // resolves despite the in-flight old close (stubborn fixture replies empty)
    let terms2=0;const realKill2=gen2.kill.bind(gen2)
    gen2.kill=signal=>{if(signal==='SIGTERM')terms2++;return realKill2(signal)}
    close2=c.close() // second disable must target gen2, not reuse close1's run
    await new Promise(resolve=>gen2.once('exit',resolve))
    assert.ok(terms2>=1) // gen2 actually received SIGTERM
    await c.start();const gen3=c.process // boot gen3 while close2's tail still settles
    assert.notEqual(gen3.pid,gen2.pid)
    await c.request('account/read') // fresh starting handle survives the old tails
    await Promise.all([close1,close2])
    assert.equal(c.process.pid,gen3.pid) // neither stale tail wiped the newest boot
  }finally{
    await Promise.allSettled([close1,close2])
    await c.close()
    assert.equal(c.process,null);assert.equal(c.closing,null)
  }
})
test('failed spawn settles truthfully: no dead process, one exit, bounded close',async()=>{
  // Node emits async 'error'+'close' but never 'exit' for a spawn ENOENT, so
  // 'exit' must not be the only terminal signal: a dead handle may never be
  // mistaken for a connected client and close/dispose must stay bounded.
  const c=new AndroidCodexClient({command:'/definitely-nonexistent-p01-codex-fixture'})
  const exits=[];c.on('exit',event=>exits.push(event))
  await assert.rejects(c.start(),/ENOENT|exited/)
  assert.equal(c.process,null) // the dead child never lingers as a truthy connection
  assert.equal(c.starting,null);assert.equal(c.pending.size,0);assert.equal(c.booting,0)
  assert.equal(c.parked.length,0);assert.equal(c.hasActiveWork,false)
  assert.equal(exits.length,1) // exactly one public exit for the failed boot
  for(const step of [()=>c.close(),()=>c.close(),()=>c.dispose()]){
    const startedAt=Date.now()
    await step()
    assert.ok(Date.now()-startedAt<2000,'close/dispose must not await a missing exit event')
    assert.equal(c.closing,null)
  }
  assert.equal(c.process,null)
})
const rejecting=`const readline=require('readline');readline.createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);if(m.id)process.stdout.write(JSON.stringify({id:m.id,error:{code:-32000,message:'fixture initialization rejected'}})+'\\n')})`
test('a live child rejecting initialize preserves the original error and leaves no orphan',async()=>{
  // Confirmed blocker repro: a child that answers initialize with {id,error}
  // used to survive boot()'s rejection as a live orphan behind a truthy
  // handle, so the next enable booted a second child on top of the leak.
  const c=new AndroidCodexClient({command:process.execPath,args:['-e',rejecting]})
  let captured=null;const boot=c.boot.bind(c)
  c.boot=()=>{const p=boot();captured=c.process??captured;return p} // boot captures the child synchronously at spawn
  await assert.rejects(c.start(),/fixture initialization rejected/) // original message, not an exit error
  assert.equal(c.process,null);assert.equal(c.starting,null);assert.equal(c.booting,0)
  assert.equal(c.pending.size,0);assert.equal(c.parked.length,0);assert.equal(c.hasActiveWork,false)
  assert.ok(captured.dshTerminated)
  assert.ok(captured.exitCode!==null||captured.signalCode!==null) // the captured child is terminally dead before boot settles
  await assert.rejects(c.start(),/fixture initialization rejected/) // retry against the broken server leaks no second child either
  assert.ok(captured.exitCode!==null||captured.signalCode!==null)
  const startedAt=Date.now()
  await c.close() // bounded: cleanup already settled this generation
  assert.ok(Date.now()-startedAt<2000)
  assert.equal(c.closing,null);assert.equal(c.process,null)
})
test('injectable initialize timeout cleans up and a repaired executable proves retry',async()=>{
  const deaf=`const readline=require('readline');readline.createInterface({input:process.stdin})`
  const dir=mkdtempSync(join(tmpdir(),'p01-timeout-'))
  const target=join(dir,'codex-fixture')
  writeFileSync(target,`#!${process.execPath}\n${deaf}`);chmodSync(target,0o755)
  const c=new AndroidCodexClient({command:target,initializeTimeoutMs:100}) // deterministic handshake timeout; default stays 20000
  let captured=null;const boot=c.boot.bind(c)
  c.boot=()=>{const p=boot();captured=c.process??captured;return p}
  try{
    await assert.rejects(c.start(),/超时/)
    assert.equal(c.process,null);assert.equal(c.starting,null);assert.equal(c.booting,0)
    assert.equal(c.pending.size,0);assert.equal(c.hasActiveWork,false)
    assert.ok(captured.exitCode!==null||captured.signalCode!==null) // deaf child death is awaited, bounded
    writeFileSync(target,`#!${process.execPath}\n${fixture}`) // the previous child was reaped before the rewrite
    await c.start() // explicit retry after repair
    const pid=c.process.pid
    assert.equal((await c.request('thread/start',{prompt:'retry'})).method,'thread/start') // immediate real use
    await c.start();assert.equal(c.process.pid,pid) // dedup: still exactly one child
  }finally{await c.close();rmSync(dir,{recursive:true,force:true})}
})
test('a rejected one-shot activation does not block the relay direct-request retry after repair',async()=>{
  // Pinned vendor consumer: at the CLIENT layer the cached one-shot start()
  // promise keeps its semantics while createSession later bypasses it with a
  // direct request('thread/start'). A failed boot must leave that direct
  // retry path usable after repair. The DSH entry paths (whenReady, model
  // listing, workspace thread listing) are no longer a documented permanent
  // limitation: the patched vendored host's Android activation-recovery opt-in
  // recovers them through an explicit enable, proven end to end in
  // vendor-recovery.test.mjs against the actual vendored implementation.
  const dir=mkdtempSync(join(tmpdir(),'p01-relay-'))
  const target=join(dir,'codex-fixture')
  writeFileSync(target,`#!${process.execPath}\n${rejecting}`);chmodSync(target,0o755)
  const c=new AndroidCodexClient({command:target})
  try{
    const cachedReady=c.start() // vendor-style activation promise, kept forever
    await assert.rejects(cachedReady,/fixture initialization rejected/)
    assert.equal(c.process,null) // the rejecting child was torn down, not cached as connected
    writeFileSync(target,`#!${process.execPath}\n${fixture}`)
    await c.start() // enable-style explicit retry boots a fresh child
    const used=await c.request('thread/start',{input:'post-repair session'}) // createSession path works immediately
    assert.equal(used.method,'thread/start')
    const pid=c.process.pid
    await c.start();assert.equal(c.process.pid,pid) // exactly one live child
    await assert.rejects(cachedReady,/fixture initialization rejected/) // client-layer cached start() promise keeps one-shot semantics
  }finally{await c.close();rmSync(dir,{recursive:true,force:true})}
})
test('close surfaces an explicit cleanup error when child termination cannot be confirmed',async()=>{
  // An EPERM/pending-delivery class kill (simulated deterministically in the
  // suite's kill-interception idiom): SIGKILL provably never lands, so the
  // hard ceiling proves only that the wait ended and close() must not pretend
  // the process was released.
  const c=new AndroidCodexClient({command:process.execPath,args:['-e',stubborn]})
  await c.start()
  const child=c.process
  const realKill=child.kill.bind(child)
  child.kill=signal=>signal==='SIGKILL'?true:realKill(signal) // SIGTERM stays ignored by the stubborn fixture
  const startedAt=Date.now()
  await assert.rejects(c.close(),/未能确认退出/)
  assert.ok(Date.now()-startedAt>=3800&&Date.now()-startedAt<9000) // bounded at ~SIGTERM+hard ceilings
  assert.equal(c.closing,null) // failure never strands a closing entry
  child.kill=realKill
  child.kill('SIGKILL')
  await new Promise(resolve=>child.once('exit',resolve)) // teardown stays leak-free
  assert.equal(c.process,null) // the terminal handler settled the same generation
  await c.close() // post-mortem close completes cleanly
})
test('a recovered executable repairs the retry: one child and immediate consumer request',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'p01-repair-'))
  const target=join(dir,'codex-fixture')
  const c=new AndroidCodexClient({command:target})
  try{
    await assert.rejects(c.start(),/ENOENT|exited/)
    assert.equal(c.process,null)
    writeFileSync(target,`#!${process.execPath}\n${fixture}`)
    chmodSync(target,0o755)
    await c.start() // explicit retry after the executable appears boots again (semantics 6)
    const pid=c.process.pid
    assert.equal((await c.request('thread/start',{prompt:'hi'})).method,'thread/start') // immediate real use, no status polling
    await c.start()
    assert.equal(c.process.pid,pid) // dedup preserved: still the one child
  }finally{
    await c.close()
    rmSync(dir,{recursive:true,force:true})
  }
})
