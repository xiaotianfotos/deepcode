import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,writeFileSync,chmodSync,rmSync,readFileSync,mkdirSync,realpathSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {join,resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {pathToFileURL} from 'node:url'
import {register} from 'node:module'
import {AndroidCodexClient} from '../src/client.mjs'
import {CodexAccount} from '../src/account.mjs'

// Pinned consumer suite against the ACTUAL patched vendored host. Mocked DSH
// services are disclosed: the two optional peer specifiers resolve to the
// stubs in tests/fixtures (no vendor behavior is reimplemented there), and the
// ctx is a minimal fake host. Everything on the recovery path — PluginHost,
// createCodexExecutionPlugin, CodexSessionRuntime, CodexDshAdapter and the
// real AndroidCodexClient/CodexAccount/JSONL child — is the real thing.
const vendorPath=resolve(import.meta.dirname,'../../../vendor/relay-dsh-plugin-codex/lib/host-plugin.js')
const PINNED_SHA256='3043c9f1c8f6a78d418c7e0f2be96339dec28ac6cf43b2ccdf8d6deae078e6d7'
function assertIdentity(){
  const bytes=readFileSync(vendorPath)
  assert.equal(createHash('sha256').update(bytes).digest('hex'),PINNED_SHA256,'vendored host-plugin.js drifted from the pinned patch')
  const src=bytes.toString('utf8')
  for(const anchor of [
    'const recovery = config.activationRecovery;',
    'recovery?.attach?.(Object.freeze({ refresh }));',
    'if (attempt !== null && recovery?.enabled?.() === false) return attempt.promise;',
    'const epoch = ++this.activationEpoch;',
    'const superseded = () => epoch !== this.activationEpoch;',
    'typeof this.ready === "function" ? this.ready() : this.ready;',
    'config.codexActivationRecovery ? () => runtime.whenReady() : runtime.whenReady(),',
    'activationRecovery: config.codexActivationRecovery',
    'whenReady: () => ready(),'
  ])assert.ok(src.includes(anchor),`missing pinned anchor: ${anchor}`)
  // The poisoned one-shot shapes must be gone (fail-closed, never silently skipped).
  for(const gone of ['const ready = runtime.initialize();','await this.ready;','whenReady: () => ready,','ready: runtime.whenReady(),','await ready;'])
    assert.ok(!src.includes(gone),`legacy poisoned anchor still present: ${gone}`)
}
register('./fixtures/vendor-load-hooks.mjs',import.meta.url)
process.env.DSH_HOME=mkdtempSync(join(tmpdir(),'p01-vendor-home-'))
const vendor=await import(pathToFileURL(vendorPath).href)

// JSONL App Server fixture. The mode file is re-read per request so a test can
// flip the live server's behavior without touching the child: poison-model and
// slow-fail reject model/list AFTER a successful protocol initialize (the
// first-activation failure class the cached one-shot used to make permanent);
// healthy/healthy2 answer the full read/session surface.
const responder=`const fs=require('fs'),readline=require('readline');
const ws=process.env.FIX_CWD;
const mode=()=>{try{return JSON.parse(fs.readFileSync(process.env.FIX_MODE_FILE,'utf8')).mode}catch{return'healthy'}}
const models=(a,b)=>({data:[{id:'gpt-5-codex',displayName:a,description:'fixture default',isDefault:true,defaultReasoningEffort:'medium',supportedReasoningEfforts:[{reasoningEffort:'low'},{reasoningEffort:'medium'},{reasoningEffort:'high'}]},{id:'gpt-5-mini',displayName:b,isDefault:false}]})
readline.createInterface({input:process.stdin}).on('line',line=>{
let m;try{m=JSON.parse(line)}catch{return}
if(!m.id)return
const reply=r=>process.stdout.write(JSON.stringify({id:m.id,result:r})+'\\n')
const fail=t=>process.stdout.write(JSON.stringify({id:m.id,error:{code:-32000,message:t}})+'\\n')
const modeNow=mode()
if(m.method==='initialize')return reply({})
if(m.method==='model/list'){
if(modeNow==='poison-model')return fail('fixture model/list failure')
if(modeNow==='slow-fail')return setTimeout(()=>fail('fixture model/list slow failure'),400)
return reply(modeNow==='healthy2'?models('Renewed Model One','Renewed Model Mini'):models('GPT-5 Codex','GPT-5 Mini'))
}
if(m.method==='account/read')return reply({account:{type:'chatgpt',email:'fixture@example.invalid',planType:'pro'}})
if(m.method==='thread/list')return reply({data:[{id:'t-inv',cwd:ws,preview:'fixture inventory thread'}]})
if(m.method==='thread/read')return reply({thread:{id:m.params.threadId,cwd:ws,preview:'fixture thread'}})
if(m.method==='thread/start')return reply({thread:{id:'t-new',cwd:ws},model:'gpt-5-codex',reasoningEffort:'medium'})
if(m.method==='thread/resume')return reply({thread:{id:m.params.threadId,cwd:ws},model:'gpt-5-codex',reasoningEffort:'medium'})
if(m.method==='turn/start')return reply({turn:{id:'turn-1',status:'completed'}})
return reply({})
})`

async function mount({recovery=true,initialMode='healthy',createTarget=true,initialEnabled=true}={}) {
  assertIdentity()
  const dir=mkdtempSync(join(tmpdir(),'p01-vendor-'))
  const ws=join(dir,'ws');mkdirSync(ws)
  const cwd=realpathSync(ws)
  const target=join(dir,'codex-fixture')
  if(createTarget){writeFileSync(target,`#!${process.execPath}\n${responder}`);chmodSync(target,0o755)}
  const modeFile=join(dir,'mode.json')
  const setMode=mode=>writeFileSync(modeFile,JSON.stringify({mode}))
  setMode(initialMode)
  let enabled=initialEnabled,disposed=false,activationRefresh=null,boots=0,teardownOnce=false
  const live=new Set()
  const client=new AndroidCodexClient({command:target,env:{...process.env,FIX_MODE_FILE:modeFile,FIX_CWD:cwd},cwd,requestTimeoutMs:8000,initializeTimeoutMs:8000,enabled:()=>enabled&&!disposed})
  const realBoot=client.boot.bind(client)
  client.boot=()=>{ // boot/spawn accounting for hot-retry and leak assertions
    boots++
    const promise=realBoot()
    const child=client.process
    if(child&&child.pid!==undefined){const pid=child.pid;live.add(pid);const off=()=>live.delete(pid);child.once('exit',off);child.once('close',off)}
    return promise
  }
  const cleanups=[]
  let adapter=null,terminalProvider=null
  const ctx={
    effect(fn){const cleanup=fn();cleanups.push(cleanup);return async()=>await cleanup?.()},
    on(){return()=>{}},
    agents:{list:()=>[],get:()=>null},
    typert:{lookups:new Map([['agent',{resolve:async()=>{throw new Error('fixture agent not found')}}]])},
    llm:{registerAdapter:(providers,candidate)=>{adapter=candidate;return()=>{}}}, // disclosed mocked DSH llm registry
    webServer:{register:()=>()=>{}}, // disclosed mocked DSH web server
    inject(names,callback){ // disclosed mocked DSH scope: capture the real terminal provider
      callback({relayTerminalProviders:{apiVersion:1,register:provider=>{terminalProvider=provider}},effect:fn=>fn()})
      return{dispose(){}}
    },
    attachments:null,
    workspaceRegistry:{resolveByPath:async()=>null}, // disclosed mocked DSH workspace registry (import route never exercised)
    logger:{error(){},warn(){},info(){}},
    sessionProjections:{stateOf:()=>({})},
    agentDefaultModel:{currentSelection:()=>({})}
  }
  const activationRecovery=recovery?{enabled:()=>enabled&&!disposed,attach(api){activationRefresh=api.refresh}}:undefined
  // Exactly how src/index.mjs wires the account: only the explicit enable
  // action, after the shared client boot resolved, may reach refresh().
  const account=new CodexAccount(client,{enabled:()=>enabled,hasActiveTurns:()=>client.hasActiveWork,setEnabled:value=>{enabled=value},onBoot:()=>{if(activationRefresh)return activationRefresh()}})
  await vendor.apply(ctx,{codex:{client},codexHome:join(dir,'codex-home'),codexExecutionMode:'native',codexExecutionGuidance:false,codexLinkPath:join(dir,'session-links.json'),codexActivationRecovery:activationRecovery})
  assert.ok(adapter,'the real CodexDshAdapter must register through ctx.llm')
  assert.ok(terminalProvider,'the terminal provider must register through the disclosed scope stub')
  return {
    client,account,setMode,cwd,
    get adapter(){return adapter},
    // The DSH entry paths consume this frozen capability object forever; the
    // adapter received the same reference, proving the SAME capability recovers.
    get capability(){return adapter.runtime},
    get terminalProvider(){return terminalProvider},
    enable:()=>account.action({action:'enable',enabled:true,csrf:account.csrf}),
    disable:()=>account.action({action:'enable',enabled:false,csrf:account.csrf}),
    boots:()=>boots,
    liveChildren:()=>live.size,
    teardown:async()=>{if(teardownOnce)return;teardownOnce=true;disposed=true;for(const cleanup of cleanups.reverse())await cleanup?.();await client.dispose();rmSync(dir,{recursive:true,force:true})}
  }
}

test('vendored host-plugin.js identity guard pins the patched source',()=>{assertIdentity()})

test('R1 live model/list first-activation failure recovers every DSH path after repair+enable',async()=>{
  const h=await mount({initialMode:'poison-model'})
  try{
    // Honest failure across every consumer the checkpoint left poisoned.
    await assert.rejects(h.capability.whenReady(),/DSH could not connect/)
    await assert.rejects(h.adapter.listModels(),/DSH could not connect/)
    await assert.rejects(h.adapter.resolveModel('relay-codex','gpt-5-codex'),/DSH could not connect/)
    await assert.rejects(h.capability.listWorkspaceThreads({cwd:h.cwd}),/DSH could not connect/)
    await assert.rejects(h.capability.readThread('t-inv'),/DSH could not connect/)
    await assert.rejects(h.terminalProvider.whenReady(),/DSH could not connect/)
    assert.equal(h.capability.status().state,'connection-failed')
    // One boot; the protocol-healthy child is not a leak and no second child
    // accumulates behind the failed activation.
    assert.equal(h.boots(),1);assert.equal(h.liveChildren(),1)
    // Post-failure polling never retries or hidden-boots.
    const bootsBefore=h.boots()
    for(let i=0;i<5;i++){
      await h.adapter.listModels().catch(()=>{})
      await h.capability.whenReady().catch(()=>{})
      h.capability.status()
      await h.account.status()
    }
    assert.equal(h.boots(),bootsBefore);assert.equal(h.liveChildren(),1)
    // Repair + explicit enable: the SAME capability/adapter objects recover.
    h.setMode('healthy')
    const view=await h.enable()
    assert.equal(view.error,null);assert.equal(view.connected,true)
    await h.capability.whenReady()
    assert.equal(h.capability.status().state,'connected')
    assert.deepEqual((await h.adapter.listModels()).map(m=>m.id),['gpt-5-codex','gpt-5-mini'])
    const resolved=await h.adapter.resolveModel('relay-codex','gpt-5-codex')
    assert.deepEqual(resolved.reasoning.efforts.map(e=>e.id),['low','medium','high'])
    assert.equal(resolved.reasoning.defaultEffort,'medium')
    assert.deepEqual((await h.capability.listWorkspaceThreads({cwd:h.cwd})).map(t=>t.id),['t-inv'])
    assert.equal((await h.capability.readThread('t-inv')).id,'t-inv')
    await h.terminalProvider.whenReady()
    assert.equal((await h.capability.createSession({cwd:h.cwd})).id,'t-new')
    assert.equal(h.capability.hasSession('t-new'),true)
    await h.capability.resumeSession('t-inv',{cwd:h.cwd})
    await h.capability.sendMessage('t-inv',{text:'recovered send'})
    assert.equal(h.boots(),1);assert.equal(h.liveChildren(),1) // same shared boot served the recovery
  }finally{await h.teardown()}
})

test('R3 disable gates ALL recovery; a repaired enable boots exactly once',async()=>{
  const h=await mount({initialMode:'poison-model'})
  try{
    await h.capability.whenReady().catch(()=>{})
    assert.equal(h.boots(),1)
    await h.disable()
    assert.equal(h.client.process,null);assert.equal(h.liveChildren(),0)
    // Disabled queries answer from cached state only: no retry, no hidden boot.
    const bootsBefore=h.boots()
    const view=await h.account.status()
    assert.equal(view.enabled,false);assert.equal(view.connected,false)
    await assert.rejects(h.adapter.listModels(),/DSH could not connect/)
    await assert.rejects(h.capability.whenReady(),/DSH could not connect/)
    await h.capability.listWorkspaceThreads({cwd:h.cwd}).catch(()=>{})
    h.capability.status()
    assert.equal(h.boots(),bootsBefore)
    // Repair, then two concurrent enables observe one deduped attempt and one boot.
    h.setMode('healthy')
    const [first,second]=await Promise.all([h.enable(),h.enable()])
    assert.equal(second.connected,true);assert.equal(second.error,null)
    await h.capability.whenReady()
    assert.equal(h.capability.status().state,'connected')
    assert.equal(h.boots(),bootsBefore+1);assert.equal(h.liveChildren(),1)
    assert.equal(first.connected,true)
  }finally{await h.teardown()}
})

test('R4 initialized disable->enable refreshes status/models and keeps session bindings',async()=>{
  const h=await mount({initialMode:'healthy'})
  try{
    await h.capability.whenReady()
    assert.equal((await h.adapter.listModels())[0].name,'GPT-5 Codex')
    await h.capability.createSession({cwd:h.cwd})
    h.adapter.links.set('sess-1','t-new') // established DSH session binding
    h.adapter.settings.set('sess-1',{model:'gpt-5-codex',effort:'medium',sandbox:'workspace-write',approvalPolicy:'on-request',cwd:h.cwd})
    // An active turn still refuses the stop: recovery never kills Agent work.
    h.client.receive(JSON.stringify({method:'turn/started',params:{turn:{id:'busy-1'}}}))
    await assert.rejects(h.disable(),/请先停止正在执行的 Codex 会话/)
    assert.equal(h.liveChildren(),1)
    h.client.receive(JSON.stringify({method:'turn/completed',params:{turn:{id:'busy-1'}}}))
    h.setMode('healthy2') // catalog changes between the cycles
    await h.disable()
    assert.equal(h.capability.status().state,'connection-failed') // the real exit landed
    assert.equal(h.liveChildren(),0)
    await h.enable()
    await h.capability.whenReady()
    assert.equal(h.capability.status().state,'connected') // connection state refreshed, no host restart
    assert.equal((await h.adapter.listModels())[0].name,'Renewed Model One') // models refreshed from the new cycle
    assert.equal(h.adapter.links.get('sess-1'),'t-new') // session binding kept
    assert.equal(h.adapter.settings.get('sess-1').model,'gpt-5-codex') // settings kept
    assert.equal(h.capability.hasSession('t-new'),true) // runtime sessions kept
  }finally{await h.teardown()}
})

test('R5 spawn-ENOENT first activation is honest with zero children; repair+enable recovers',async()=>{
  const h=await mount({initialMode:'healthy',createTarget:false})
  try{
    await assert.rejects(h.capability.whenReady(),/DSH could not connect/)
    assert.equal(h.capability.status().state,'connection-failed')
    assert.equal(h.liveChildren(),0);assert.equal(h.client.process,null)
    writeFileSync(h.client.command,`#!${process.execPath}\n${responder}`) // repair: the executable appears
    chmodSync(h.client.command,0o755)
    const view=await h.enable()
    assert.equal(view.connected,true)
    await h.capability.whenReady()
    assert.equal(h.capability.status().state,'connected')
    assert.deepEqual((await h.adapter.listModels()).map(m=>m.id),['gpt-5-codex','gpt-5-mini'])
    await h.capability.listWorkspaceThreads({cwd:h.cwd})
    await h.terminalProvider.whenReady()
    assert.equal((await h.capability.createSession({cwd:h.cwd})).id,'t-new')
    assert.equal(h.boots(),2);assert.equal(h.liveChildren(),1)
  }finally{await h.teardown()}
})

test('unmount settles an in-flight activation and closes the recovery gate permanently',async()=>{
  const h=await mount({initialMode:'healthy'})
  try{
    await h.capability.whenReady()
    h.setMode('slow-fail')
    const enabling=h.enable() // refresh attempt parks in the slow model/list
    await new Promise(resolve=>setTimeout(resolve,50))
    await h.teardown() // host + client disposal while the attempt is in flight
    const view=await enabling // every caller settles; nothing hangs
    assert.equal(view.connected,false);assert.match(view.error,/启动失败/)
    await assert.rejects(h.capability.whenReady(),/DSH could not connect|已关闭/)
    const bootsAfter=h.boots()
    await assert.rejects(h.adapter.listModels())
    const late=await h.enable().catch(()=>null) // post-unmount enable cannot respawn
    assert.ok(late===null||late.connected===false)
    assert.equal(h.boots(),bootsAfter);assert.equal(h.liveChildren(),0)
  }finally{await h.teardown()}
})

test('without the Android opt-in the vendored one-shot activation semantics stay upstream',async()=>{
  const h=await mount({recovery:false,initialMode:'poison-model'})
  try{
    await assert.rejects(h.capability.whenReady(),/DSH could not connect/)
    await assert.rejects(h.adapter.listModels(),/DSH could not connect/)
    h.setMode('healthy')
    const view=await h.enable() // no refresh was ever attached: client recovers, vendor stays one-shot
    assert.equal(view.connected,true)
    await assert.rejects(h.capability.whenReady(),/DSH could not connect/)
    assert.equal((await h.capability.createSession({cwd:h.cwd})).id,'t-new') // direct request path untouched
  }finally{await h.teardown()}
})


// The failed-boot classes the protocol-healthy model/list fixture cannot
// produce: no process ever survives the boot, so polling would re-spawn
// forever without the client's bootFailure latch. These cases pin the
// read-only polling contract against the REAL client/account + vendored host.
test('R6 failed spawn: read-only status/GET polling never retries boot; repair+enable recovers pinned consumers',async()=>{
  const h=await mount({createTarget:false})
  try{
    await assert.rejects(h.capability.whenReady(),/DSH could not connect/)
    assert.equal(h.capability.status().state,'connection-failed')
    assert.equal(h.boots(),1);assert.equal(h.liveChildren(),0);assert.equal(h.client.process,null)
    const httpGet=async()=>{
      const res={code:null,body:''}
      res.writeHead=code=>{res.code=code}
      res.end=value=>{res.body=value}
      await h.account.handler({method:'GET'},res)
      assert.equal(res.code,200) // consistent honest view, never a fabricated connection
      return JSON.parse(res.body)
    }
    for(const poll of [()=>h.account.status(),httpGet]){
      for(let i=0;i<3;i++){
        const view=await poll()
        assert.equal(view.connected,false);assert.equal(view.enabled,true)
        assert.match(view.error,/启动失败/) // retryable error retained, never cleared by polling
        assert.equal(typeof view.csrf,'string')
      }
      assert.equal(h.boots(),1,'read-only polling must not retry the failed boot')
      assert.equal(h.liveChildren(),0);assert.equal(h.client.process,null)
      await assert.rejects(h.adapter.listModels(),/DSH could not connect/)
      await assert.rejects(h.capability.whenReady(),/DSH could not connect/)
      await h.capability.listWorkspaceThreads({cwd:h.cwd}).catch(()=>{})
      h.capability.status()
      assert.equal(h.boots(),1)
    }
    writeFileSync(h.client.command,`#!${process.execPath}\n${responder}`) // repair: the executable appears
    chmodSync(h.client.command,0o755)
    // Repair alone must not resurrect the process: polling still boots nothing.
    for(let i=0;i<3;i++){
      assert.equal((await h.account.status()).connected,false)
      assert.equal((await httpGet()).connected,false)
    }
    assert.equal(h.boots(),1);assert.equal(h.liveChildren(),0)
    // One explicit enable boots exactly once and recovers the SAME consumers.
    const view=await h.enable()
    assert.equal(view.connected,true);assert.equal(view.error,null)
    assert.equal(h.boots(),2);assert.equal(h.liveChildren(),1)
    await h.capability.whenReady()
    assert.equal(h.capability.status().state,'connected')
    assert.deepEqual((await h.adapter.listModels()).map(m=>m.id),['gpt-5-codex','gpt-5-mini'])
    assert.equal((await h.adapter.resolveModel('relay-codex','gpt-5-codex')).reasoning.defaultEffort,'medium')
    assert.deepEqual((await h.capability.listWorkspaceThreads({cwd:h.cwd})).map(t=>t.id),['t-inv'])
    assert.equal((await h.capability.readThread('t-inv')).id,'t-inv')
    await h.terminalProvider.whenReady()
    assert.equal((await h.capability.createSession({cwd:h.cwd})).id,'t-new')
    assert.equal((await h.account.status()).connected,true) // post-recovery polls stay boot-free
    assert.equal(h.boots(),2)
  }finally{await h.teardown()}
})

test('R7 initial disabled mount parks activation; enable boots once; disable/enable cycles boot once per cycle',async()=>{
  const h=await mount({initialEnabled:false})
  try{
    assert.equal(h.boots(),0);assert.equal(h.liveChildren(),0)
    for(let i=0;i<3;i++){
      const view=await h.account.status()
      assert.equal(view.enabled,false);assert.equal(view.connected,false)
    }
    assert.equal(h.boots(),0)
    const on=await h.enable()
    assert.equal(on.connected,true);assert.equal(h.boots(),1);assert.equal(h.liveChildren(),1)
    await h.capability.whenReady() // the parked activation shares the enable's single boot
    assert.equal(h.capability.status().state,'connected')
    assert.equal((await h.adapter.listModels())[0].name,'GPT-5 Codex')
    await h.terminalProvider.whenReady()
    const disabled=await h.disable()
    assert.equal(disabled.connected,false);assert.equal(h.liveChildren(),0)
    for(let i=0;i<3;i++)assert.equal((await h.account.status()).connected,false)
    assert.equal(h.boots(),1) // disabled polling never wakes the backend
    const again=await h.enable()
    assert.equal(again.connected,true);assert.equal(h.boots(),2);assert.equal(h.liveChildren(),1)
    await h.capability.whenReady()
    assert.equal((await h.capability.createSession({cwd:h.cwd})).id,'t-new')
  }finally{await h.teardown()}
})
