import test from 'node:test'
import assert from 'node:assert/strict'
import {EventEmitter} from 'node:events'
import {mkdtempSync,writeFileSync,chmodSync,rmSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {CodexAccount,maskEmail} from '../src/account.mjs'
import {AndroidCodexClient} from '../src/client.mjs'
class Client extends EventEmitter {
  calls=[]
  starts=0
  closes=0
  process=null
  async start(){if(this.process)return;this.starts++;this.process={stdin:{writable:true}}}
  async request(method,params){this.calls.push({method,params});if(method==='account/read')return {account:{type:'chatgpt',email:'test@example.invalid',planType:'pro',accessToken:'must-not-leak'}};if(method==='account/login/start')return {loginId:'test',authUrl:'https://auth.openai.com/authorize?state=test',accessToken:'must-not-leak'};return {}}
  async close(){this.closes++;this.process=null}
}
test('only public account fields are returned; login is owned by App Server',async()=>{
  const client=new Client(),service=new CodexAccount(client)
  const state=await service.status();assert.equal(JSON.stringify(state).includes('must-not-leak'),false)
  assert.equal(state.account.email,'te****t@example.invalid')
  assert.equal(JSON.stringify(state).includes('test@example.invalid'),false)
  const login=await service.action({action:'login',csrf:state.csrf});assert.deepEqual(login.login,{loginId:'test',authUrl:'https://auth.openai.com/authorize?state=test'})
  assert.deepEqual(client.calls.find(x=>x.method==='account/login/start').params,{type:'chatgpt'})
  client.emit('notification',{method:'account/login/completed',params:{loginId:'old',success:true}});assert.ok(service.login)
  client.emit('notification',{method:'account/login/completed',params:{loginId:'test',success:true}});assert.equal(service.login,null)
})
test('email display hides the local-part middle, including short addresses',()=>{
  assert.equal(maskEmail('abcdefgh@example.invalid'),'abc****h@example.invalid')
  assert.equal(maskEmail('a@example.invalid'),'****@example.invalid')
  assert.equal(maskEmail('ab@example.invalid'),'a****@example.invalid')
  assert.equal(maskEmail('invalid'),'****')
  assert.equal(maskEmail(null),null)
})
test('CSRF and active work protect account changes',async()=>{
  const client=new Client(),service=new CodexAccount(client,{hasActiveTurns:()=>true})
  await assert.rejects(service.action({action:'logout',csrf:'wrong'}),/Invalid/)
  await assert.rejects(service.action({action:'logout',csrf:service.csrf}),/停止/)
  await assert.rejects(service.action({action:'enable',csrf:service.csrf,enabled:false}),/停止/)
  assert.equal(client.calls.length,0)
  assert.equal(client.closes,0)
})
test('untrusted login URLs are rejected',async()=>{
  const client=new Client();client.request=async()=>({loginId:'bad',authUrl:'https://example.invalid/login'})
  const service=new CodexAccount(client)
  await assert.rejects(service.action({action:'login',csrf:service.csrf}),/授权地址/)
})
test('cancel sent while login is starting cancels the resulting login',async()=>{
  const client=new Client(),original=client.request.bind(client)
  let release;const gate=new Promise(resolve=>{release=resolve})
  client.request=async(method,params)=>{if(method==='account/login/start')await gate;return original(method,params)}
  const service=new CodexAccount(client)
  const login=service.action({action:'login',csrf:service.csrf})
  const cancel=service.action({action:'cancel',csrf:service.csrf})
  release();await Promise.all([login,cancel])
  assert.equal(service.login,null)
  assert.deepEqual(client.calls.find(x=>x.method==='account/login/cancel').params,{loginId:'test'})
})
test('A01 disabled status is a pure read: no boot, no request, enable stays usable',async()=>{
  let enabled=false
  const client=new Client(),service=new CodexAccount(client,{enabled:()=>enabled,setEnabled:v=>{enabled=v}})
  for(let i=0;i<3;i++){
    const s=await service.status()
    assert.equal(s.enabled,false);assert.equal(s.connected,false);assert.equal(s.account,null)
    assert.equal(typeof s.csrf,'string');assert.equal(s.csrf.length,48)
  }
  assert.equal(client.starts,0);assert.equal(client.calls.length,0);assert.equal(client.closes,0)
  const state=await service.status()
  assert.equal(JSON.stringify(state).includes('accessToken'),false)
  const on=await service.action({action:'enable',csrf:state.csrf,enabled:true})
  assert.equal(enabled,true);assert.equal(on.enabled,true)
  // The relay contract caches its one-shot activation start, then issues
  // thread/start directly, so an explicit enable eagerly boots: exactly one
  // start, no settings poll required before the first consumer request.
  assert.equal(client.starts,1);assert.equal(on.connected,true)
})
test('A02 disabling an idle backend closes it and later polls never wake it',async()=>{
  let enabled=true
  const client=new Client(),service=new CodexAccount(client,{enabled:()=>enabled,setEnabled:v=>{enabled=v}})
  const on=await service.status();assert.equal(on.connected,true)
  const off=await service.action({action:'enable',csrf:service.csrf,enabled:false})
  assert.equal(off.enabled,false);assert.equal(off.connected,false)
  assert.equal(client.closes,1)
  const starts=client.starts,calls=client.calls.length
  for(let i=0;i<3;i++){const s=await service.status();assert.equal(s.connected,false)}
  assert.equal(client.starts,starts);assert.equal(client.calls.length,calls)
  // repeat disable is idempotent: no second kill, no extra writes
  await service.action({action:'enable',csrf:service.csrf,enabled:false})
  assert.equal(client.closes,1);assert.equal(client.starts,starts)
})
test('A03 active or pending work rejects disable and logout with state untouched',async()=>{
  let enabled=true;const writes=[]
  const client=new Client(),service=new CodexAccount(client,{enabled:()=>enabled,setEnabled:v=>writes.push(v),hasActiveTurns:()=>true})
  await assert.rejects(service.action({action:'enable',csrf:service.csrf,enabled:false}),/停止/)
  await assert.rejects(service.action({action:'logout',csrf:service.csrf}),/停止/)
  assert.equal(client.closes,0);assert.deepEqual(writes,[])
  assert.equal(client.calls.filter(x=>x.method==='account/logout').length,0)
  assert.equal(enabled,true)
})
test('A05 invalid CSRF, unknown action and bad enabled never touch side effects',async()=>{
  let enabled=true;const writes=[]
  const client=new Client(),service=new CodexAccount(client,{enabled:()=>enabled,setEnabled:v=>writes.push(v)})
  await assert.rejects(service.action({action:'enable',csrf:'x'.repeat(48),enabled:false}),/Invalid/)
  await assert.rejects(service.action({action:'teleport',csrf:service.csrf}),/Unknown/)
  await assert.rejects(service.action({action:'enable',csrf:service.csrf,enabled:'false'}),/Invalid enabled/)
  assert.equal(client.starts,0);assert.equal(client.closes,0)
  assert.deepEqual(writes,[]);assert.equal(client.calls.length,0)
  assert.equal(enabled,true)
})
test('A06 disable during login cancels without booting; late success cannot revive state',async()=>{
  let enabled=true
  const client=new Client(),original=client.request.bind(client)
  let release;const gate=new Promise(resolve=>{release=resolve})
  client.request=async(method,params)=>{if(method==='account/login/start')await gate;return original(method,params)}
  const service=new CodexAccount(client,{enabled:()=>enabled,setEnabled:v=>{enabled=v}})
  const login=service.action({action:'login',csrf:service.csrf})
  const off=service.action({action:'enable',csrf:service.csrf,enabled:false})
  release();assert.ok((await login).login)
  const offState=await off
  assert.equal(offState.enabled,false);assert.equal(offState.connected,false);assert.equal(service.login,null)
  assert.equal(client.closes,1)
  assert.deepEqual(client.calls.find(x=>x.method==='account/login/cancel')?.params,{loginId:'test'})
  const startsAtStop=client.starts
  // A late completion for the old login must not resurrect login or error state.
  client.emit('notification',{method:'account/login/completed',params:{loginId:'test',success:true}})
  assert.equal(service.login,null);assert.equal(service.error,null)
  // Completed authorization data is preserved: the stop never logs out.
  assert.equal(client.calls.filter(x=>x.method==='account/logout').length,0)
  await service.status()
  assert.equal(client.starts,startsAtStop) // cancel and polling never boot
})
test('A04 enable/disable cycles run one process per round without leaked state',async()=>{
  let enabled=false
  const client=new Client(),service=new CodexAccount(client,{enabled:()=>enabled,setEnabled:v=>{enabled=v}})
  await assert.rejects(service.action({action:'login',csrf:service.csrf}),/启用/)
  await assert.rejects(service.action({action:'logout',csrf:service.csrf}),/启用/)
  const idleCancel=await service.action({action:'cancel',csrf:service.csrf})
  assert.equal(idleCancel.enabled,false);assert.equal(idleCancel.connected,false)
  assert.equal(client.starts,0);assert.equal(client.calls.length,0)
  await service.action({action:'enable',csrf:service.csrf,enabled:true})
  assert.ok((await service.action({action:'login',csrf:service.csrf})).login)
  assert.equal(client.starts,1)
  await service.action({action:'enable',csrf:service.csrf,enabled:false})
  assert.equal(client.closes,1);assert.equal(service.login,null)
  await service.action({action:'enable',csrf:service.csrf,enabled:true})
  assert.ok((await service.action({action:'login',csrf:service.csrf})).login)
  assert.equal(client.starts,2)
  await service.action({action:'enable',csrf:service.csrf,enabled:false})
  assert.equal(client.closes,2)
  await service.status()
  assert.equal(client.starts,2) // no third boot
  assert.equal(client.listenerCount('notification'),1) // no duplicate listeners
})
test('cold-start parked activation wakes after enable and shares a single boot (A01+A04)',async()=>{
  // Mirrors the pinned relay adapter: start() is awaited once at activation and
  // its outcome is cached, so a disabled start must park, not reject.
  let enabled=false
  class ParkingClient extends Client {
    parked=[]
    start(){if(!enabled)return new Promise((resolve,reject)=>this.parked.push({resolve,reject}));return super.start()}
    resume(){const waiters=this.parked;this.parked=[];for(const waiter of waiters)this.start().then(waiter.resolve,waiter.reject)}
  }
  const client=new ParkingClient(),service=new CodexAccount(client,{enabled:()=>enabled,setEnabled:v=>{enabled=v}})
  const relayStyle=client.start() // activation await parked on the persisted gate
  for(let i=0;i<3;i++)assert.equal((await service.status()).connected,false)
  assert.equal(client.starts,0)
  const state=await service.status()
  await service.action({action:'enable',csrf:state.csrf,enabled:true})
  const after=await service.status()
  await relayStyle
  assert.equal(after.connected,true)
  assert.equal(client.starts,1) // the woken relay-style activation, the enable's eager boot and later status polls all share one child
})
test('A07 polling interleaved with disable leaves no background boot',async()=>{
  let enabled=true
  const client=new Client(),service=new CodexAccount(client,{enabled:()=>enabled,setEnabled:v=>{enabled=v}})
  await service.status()
  const poll=service.status()
  const off=service.action({action:'enable',csrf:service.csrf,enabled:false})
  const pollState=await poll;await off
  assert.equal(typeof pollState.csrf,'string')
  assert.equal(client.closes,1)
  const starts=client.starts
  for(let i=0;i<3;i++)await service.status()
  assert.equal(client.starts,starts)
  // error bodies keep card-compatible fields
  const res={written:0,head:null,body:''}
  res.writeHead=(code,headers)=>{res.written=code;res.head=headers}
  res.end=value=>{res.body=value}
  await service.handler({method:'POST',headers:{'content-type':'application/json'},async*[Symbol.asyncIterator](){yield JSON.stringify({action:'logout',csrf:service.csrf})}},res)
  assert.equal(res.written,400)
  const body=JSON.parse(res.body)
  assert.equal(body.enabled,false);assert.equal(typeof body.csrf,'string')
})
test('enable eagerly boots so the first consumer request works with zero polling (A04)',async()=>{
  let enabled=false
  const client=new Client(),service=new CodexAccount(client,{enabled:()=>enabled,setEnabled:v=>{enabled=v}})
  const on=await service.action({action:'enable',csrf:service.csrf,enabled:true}) // no status() poll first
  assert.equal(on.enabled,true);assert.equal(on.connected,true)
  assert.equal(client.starts,1);assert.ok(client.process)
  // The pinned relay adapter's createSession issues request('thread/start')
  // directly after its one-shot activation: no second start() and no settings
  // polling exist on this path, so an immediate use must already succeed.
  const used=await client.request('thread/start',{input:'first use after enable'})
  assert.deepEqual(used,{})
  assert.equal(client.starts,1);assert.equal(client.closes,0)
})
test('a failed eager enable keeps enabled=true with a retryable error (semantics 6)',async()=>{
  let enabled=false
  const client=new Client(),service=new CodexAccount(client,{enabled:()=>enabled,setEnabled:v=>{enabled=v}})
  client.start=async()=>{throw new Error('runtime missing')}
  const on=await service.action({action:'enable',csrf:service.csrf,enabled:true})
  assert.equal(on.enabled,true);assert.equal(on.connected,false)
  assert.match(on.error,/启动失败/)
  // An explicit retry recovers: later status()/login may boot again.
  client.start=async()=>{if(client.process)return;client.starts++;client.process={stdin:{writable:true}}}
  assert.equal((await service.status()).connected,true)
})
test('disable during an in-flight boot is rejected and re-enable recovers (semantics 2+7)',async()=>{
  // Guards the relay's cached one-shot ready: killing a booting child would
  // permanently poison host-plugin activation, so the account layer must see
  // an in-flight initialize as active work via hasActiveWork.
  let enabled=true
  class BootingClient extends Client {
    booting=false;hold=false;releaseBoot=()=>{}
    get hasActiveWork(){return this.booting}
    async start(){
      if(this.process)return
      this.starts++;this.booting=true
      if(this.hold)await new Promise(resolve=>{this.releaseBoot=resolve})
      this.booting=false;this.process={stdin:{writable:true}}
    }
  }
  const client=new BootingClient(),service=new CodexAccount(client,{enabled:()=>enabled,setEnabled:v=>{enabled=v},hasActiveTurns:()=>client.hasActiveWork})
  client.hold=true
  const booting=client.start() // activation boot in flight (initialize outstanding)
  await assert.rejects(service.action({action:'enable',csrf:service.csrf,enabled:false}),/停止/)
  assert.equal(enabled,true);assert.equal(client.closes,0) // no config write, no kill, boot untouched
  client.hold=false;client.releaseBoot();await booting
  const off=await service.action({action:'enable',csrf:service.csrf,enabled:false})
  assert.equal(off.enabled,false);assert.equal(off.connected,false);assert.equal(client.closes,1)
  const on=await service.action({action:'enable',csrf:service.csrf,enabled:true})
  assert.equal(on.connected,true);assert.equal(client.starts,2) // exactly one fresh process per cycle
})
test('real-client missing executable: truthful enable failure, bounded disable, recovered retry',async()=>{
  // The pinned repro used the REAL AndroidCodexClient: a spawn ENOENT emits
  // 'error'+'close' but never 'exit', so enable must not report connected=true
  // off a dead handle and the following disable must close without hanging.
  const server=`const readline=require('readline');readline.createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);if(m.id)process.stdout.write(JSON.stringify({id:m.id,result:{method:m.method,account:null}})+'\\n')})`
  const dir=mkdtempSync(join(tmpdir(),'p01-account-'))
  const target=join(dir,'codex-bin')
  let enabled=false
  const client=new AndroidCodexClient({command:target})
  const service=new CodexAccount(client,{enabled:()=>enabled,setEnabled:v=>{enabled=v}})
  try{
    const failed=await service.action({action:'enable',csrf:service.csrf,enabled:true})
    assert.equal(failed.enabled,true)
    assert.equal(failed.connected,false) // never connected=true after a failed spawn
    assert.match(failed.error,/启动失败/)
    assert.equal(client.process,null);assert.equal(client.hasActiveWork,false)
    const startedAt=Date.now()
    const off=await service.action({action:'enable',csrf:service.csrf,enabled:false})
    assert.ok(Date.now()-startedAt<2000) // close is bounded even without an exit event
    assert.equal(off.enabled,false);assert.equal(off.connected,false)
    writeFileSync(target,`#!${process.execPath}\n${server}`)
    chmodSync(target,0o755)
    const back=await service.action({action:'enable',csrf:service.csrf,enabled:true})
    assert.equal(back.connected,true);assert.equal(back.error,null)
    assert.equal((await client.request('account/read')).method,'account/read') // immediate real consumer use, no status polling
    const pid=client.process.pid
    await service.action({action:'enable',csrf:service.csrf,enabled:true})
    assert.equal(client.process.pid,pid) // repeat enable never double-boots
  }finally{
    await client.dispose()
    rmSync(dir,{recursive:true,force:true})
  }
})
test('repro mirror: rejecting initialize fails both enables truthfully with zero live children; repaired retry boots one child for immediate use',async()=>{
  // Faithful mirror of the independent reproduction: REAL AndroidCodexClient +
  // CodexAccount + a real JSONL child that explicitly rejects every request.
  // The old build lied connected=true, wiped the retryable error off the
  // leaked handle and left two live children after the second enable.
  const rejecting=`const readline=require('readline');readline.createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);if(m.id)process.stdout.write(JSON.stringify({id:m.id,error:{code:-32000,message:'fixture initialization rejected'}})+'\\n')})`
  const server=`const readline=require('readline');readline.createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);if(m.id)process.stdout.write(JSON.stringify({id:m.id,result:{method:m.method}})+'\\n')})`
  const dir=mkdtempSync(join(tmpdir(),'p01-repro-'))
  const target=join(dir,'codex-bin')
  writeFileSync(target,`#!${process.execPath}\n${rejecting}`);chmodSync(target,0o755)
  let enabled=false
  const client=new AndroidCodexClient({command:target})
  const service=new CodexAccount(client,{enabled:()=>enabled,setEnabled:v=>{enabled=v},hasActiveTurns:()=>client.hasActiveWork})
  const children=[];const boot=client.boot.bind(client)
  client.boot=()=>{const p=boot();children.push(client.process);return p}
  try{
    const first=await service.action({action:'enable',csrf:service.csrf,enabled:true})
    assert.equal(first.connected,false);assert.match(first.error,/启动失败/)
    const second=await service.action({action:'enable',csrf:service.csrf,enabled:true})
    assert.equal(second.connected,false);assert.match(second.error,/启动失败/)
    assert.equal(children.filter(x=>x.exitCode===null&&x.signalCode===null).length,0) // no orphan survives a failed enable
    assert.equal(client.process,null);assert.equal(client.hasActiveWork,false)
    writeFileSync(target,`#!${process.execPath}\n${server}`) // both rejecting children were reaped before the rewrite
    const third=await service.action({action:'enable',csrf:service.csrf,enabled:true})
    assert.equal(third.connected,true);assert.equal(third.error,null)
    assert.equal(children.filter(x=>x.exitCode===null&&x.signalCode===null).length,1) // exactly one ready child
    assert.equal((await client.request('thread/start',{prompt:'retry'})).method,'thread/start') // immediately usable, no status polling
  }finally{
    await client.dispose()
    for(const child of children)if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL')
    rmSync(dir,{recursive:true,force:true})
  }
})
test('disable against a child that cannot be confirmed terminated keeps disabled persisted and surfaces the cleanup error',async()=>{
  // Semantics 6: a persisted stop with failed process cleanup stays disabled
  // and returns an explicit error — it never rolls configuration back or
  // pretends the process was released.
  const stubborn=`const readline=require('readline');readline.createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);if(m.id){if(m.method==='hang')return;process.stdout.write(JSON.stringify({id:m.id,result:{}})+'\\n')}});process.on('SIGTERM',()=>{});setInterval(()=>{},1000)`
  let enabled=false
  const client=new AndroidCodexClient({command:process.execPath,args:['-e',stubborn]})
  const service=new CodexAccount(client,{enabled:()=>enabled,setEnabled:v=>{enabled=v},hasActiveTurns:()=>client.hasActiveWork})
  try{
    const on=await service.action({action:'enable',csrf:service.csrf,enabled:true})
    assert.equal(on.connected,true)
    const child=client.process
    const realKill=child.kill.bind(child)
    child.kill=signal=>signal==='SIGKILL'?true:realKill(signal) // undeliverable kill: termination cannot be confirmed
    await assert.rejects(service.action({action:'enable',csrf:service.csrf,enabled:false}),/未能确认退出/)
    assert.equal(enabled,false) // disabled stays persisted despite the cleanup failure
    assert.equal(client.hasActiveWork,false)
    const s=await service.status()
    assert.equal(s.enabled,false);assert.equal(s.connected,false) // a disabled poll answers from cache, never boots
    child.kill=realKill
    child.kill('SIGKILL')
    await new Promise(resolve=>child.once('exit',resolve)) // the child is reaped; teardown stays leak-free
  }finally{
    await client.dispose()
  }
})

test('real-client failed boot is latched: three status/GET polls never retry; repair+enable boots exactly once',async()=>{
  // Every failed-boot class where no process survives: spawn ENOENT, live
  // initialize rejection, initialize timeout. REAL AndroidCodexClient +
  // CodexAccount + real JSONL children — no lifecycle stubs.
  const server=`const readline=require('readline');readline.createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);if(m.id)process.stdout.write(JSON.stringify({id:m.id,result:{method:m.method,account:null}})+'\\n')})`
  const rejecting=`const readline=require('readline');readline.createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);if(m.id)process.stdout.write(JSON.stringify({id:m.id,error:{code:-32000,message:'fixture initialization rejected'}})+'\\n')})`
  const deaf=`const readline=require('readline');readline.createInterface({input:process.stdin})`
  for(const variant of ['enoent','rejecting','timeout']){
    const dir=mkdtempSync(join(tmpdir(),`p01-latch-${variant}-`))
    const target=join(dir,'codex-bin')
    if(variant==='rejecting'){writeFileSync(target,`#!${process.execPath}\n${rejecting}`);chmodSync(target,0o755)}
    if(variant==='timeout'){writeFileSync(target,`#!${process.execPath}\n${deaf}`);chmodSync(target,0o755)}
    let enabled=false
    const client=new AndroidCodexClient({command:target,initializeTimeoutMs:variant==='timeout'?100:20000})
    let boots=0;const live=new Set()
    const boot=client.boot.bind(client)
    client.boot=()=>{boots++;const promise=boot();const child=client.process
      if(child&&child.pid!==undefined){const pid=child.pid;live.add(pid);const off=()=>live.delete(pid);child.once('exit',off);child.once('close',off)}
      return promise}
    const service=new CodexAccount(client,{enabled:()=>enabled,setEnabled:v=>{enabled=v},hasActiveTurns:()=>client.hasActiveWork})
    try{
      const first=await service.action({action:'enable',csrf:service.csrf,enabled:true})
      assert.equal(first.connected,false,variant)
      assert.match(first.error,/启动失败/,variant)
      assert.equal(boots,1,variant);assert.equal(client.process,null,variant);assert.equal(live.size,0,variant)
      const httpGet=async()=>{
        const res={code:null,body:''}
        res.writeHead=code=>{res.code=code}
        res.end=value=>{res.body=value}
        await service.handler({method:'GET'},res)
        assert.equal(res.code,200,variant) // GET answers the honest view, not a boot retry
        return JSON.parse(res.body)
      }
      for(let i=0;i<3;i++){
        const view=await service.status()
        assert.equal(view.connected,false,variant);assert.equal(view.enabled,true,variant)
        assert.match(view.error,/启动失败/,variant);assert.equal(typeof view.csrf,'string',variant)
        const via=await httpGet()
        assert.equal(via.connected,false,variant);assert.match(via.error,/启动失败/,variant)
      }
      assert.equal(boots,1,`${variant}: read-only polling must not retry the failed boot`)
      assert.equal(live.size,0,variant)
      writeFileSync(target,`#!${process.execPath}\n${server}`);chmodSync(target,0o755) // repair the fixture
      for(let i=0;i<3;i++){
        assert.equal((await service.status()).connected,false,variant)
        assert.equal((await httpGet()).connected,false,variant)
      }
      assert.equal(boots,1,`${variant}: polling after repair must not start the process`)
      assert.equal(live.size,0,variant)
      const back=await service.action({action:'enable',csrf:service.csrf,enabled:true})
      assert.equal(back.connected,true,variant);assert.equal(back.error,null,variant)
      assert.equal(boots,2,`${variant}: one explicit enable boots exactly once`)
      assert.equal(live.size,1,variant)
      assert.equal((await client.request('account/read')).account,null,variant) // immediate real consumer use
      assert.equal((await service.status()).connected,true,variant)
      assert.equal(boots,2,variant) // recovery polls never boot again
    }finally{
      await client.dispose()
      rmSync(dir,{recursive:true,force:true})
    }
  }
})
test('concurrent read-only polls share one in-flight boot attempt and stay honest',async()=>{
  // Dedup stays intact for overlapping polls: the first poll boots, the
  // concurrent polls join the same attempt, later polls answer from the latch.
  const dir=mkdtempSync(join(tmpdir(),'p01-dedup-'))
  const target=join(dir,'codex-bin') // intentionally missing: the boot hits ENOENT
  const client=new AndroidCodexClient({command:target})
  let boots=0
  const boot=client.boot.bind(client)
  client.boot=()=>{boots++;return boot()}
  const service=new CodexAccount(client)
  try{
    const views=await Promise.all([service.status(),service.status(),service.status()])
    assert.equal(boots,1) // exactly one spawn attempt across the concurrent polls
    for(const view of views){
      assert.equal(view.connected,false);assert.equal(view.enabled,true)
      assert.match(view.error,/启动失败/)
    }
    for(let i=0;i<3;i++)assert.equal((await service.status()).connected,false)
    assert.equal(boots,1);assert.equal(client.process,null)
    writeFileSync(target,`#!${process.execPath}\nconst readline=require('readline');readline.createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);if(m.id)process.stdout.write(JSON.stringify({id:m.id,result:{method:m.method,account:null}})+'\\n')})`)
    chmodSync(target,0o755)
    const on=await service.action({action:'enable',csrf:service.csrf,enabled:true})
    assert.equal(on.connected,true)
    assert.equal(boots,2);assert.equal((await service.status()).connected,true)
  }finally{
    await client.dispose()
    rmSync(dir,{recursive:true,force:true})
  }
})
