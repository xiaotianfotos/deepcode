// Optional voice/gamepad integration tests.
//
// What is real: this suite esbuild-bundles and imports the actual
// src/client/index.tsx apply() code, so every lifecycle branch under test
// (child capture, holder routing, syncGamepad, intent gating, Settings) is
// the shipped implementation, not a source-string check.
//
// Disclosed mock scope: (1) 'react' is a minimal hooks mock —
// useEffect/useLayoutEffect run their callback synchronously and their
// cleanup is collected on globalThis.__dshEffects so tests can unmount;
// useSyncExternalStore returns a fresh getSnapshot() without a scheduler.
// (2) '@deepseek-ai/dsh-client-ui-renderer' SessionSurface is a null stub.
// (3) DOM globals (localStorage, matchMedia, ResizeObserver, rAF/timers,
// window with listener counting, document) are counted stubs.
// (4) The fake Cordis context implements the declared contracts.Context
// surface; ctx.inject()/effect() replicate the disclosed pinned Cordis
// 4.0.2 semantics from the release snapshot: a dependent callback loads
// only while every dep is provided, and provider withdrawal or replacement
// runs the child's effect cleanups before (for replacement) re-running the
// callback. Real-Cordis lifecycle acceptance on device is performed
// supervisor-side; these mocks are not claimed as a real runtime.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {build} from 'esbuild'

const reactMock = `
export function useRef(initial){return {current:initial===undefined?null:initial}}
export function useEffect(fn){const cleanup=fn();if(typeof cleanup==='function')globalThis.__dshEffects.push(cleanup)}
export const useLayoutEffect=useEffect
export function useSyncExternalStore(subscribe,getSnapshot){return getSnapshot()}
export function memo(fn){return fn}
export function useState(v){return [v,()=>{}]}
`
const jsxMock = `
export function jsx(type,props){return {type,props:props||{}}}
export const jsxs=jsx
export function Fragment(){}
`
const rendererMock = `
export function SessionSurface(){return null}
`
const mockPlugin={name:'mocks',setup(b){
  b.onResolve({filter:/^react$/},()=>({path:'react',namespace:'mock'}))
  b.onResolve({filter:/^react\/jsx-runtime$/},()=>({path:'jsx-runtime',namespace:'mock'}))
  b.onResolve({filter:/^@deepseek-ai\/dsh-client-ui-renderer$/},()=>({path:'renderer',namespace:'mock'}))
  b.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:{react:reactMock,'jsx-runtime':jsxMock,renderer:rendererMock}[args.path],loader:'js'}))
}}
const result=await build({entryPoints:['src/client/index.tsx'],bundle:true,format:'esm',platform:'browser',target:'es2022',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},write:false,plugins:[mockPlugin]})
const {apply,inject}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'))

const timers={scheduled:0,fired:0}
const realSetTimeout=globalThis.setTimeout
function installDom(){
  timers.scheduled=0;timers.fired=0
  const storage=new Map()
  globalThis.localStorage={getItem:k=>storage.has(k)?storage.get(k):null,setItem:(k,v)=>void storage.set(k,String(v)),removeItem:k=>void storage.delete(k)}
  globalThis.matchMedia=()=>({matches:false})
  globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}}
  globalThis.HTMLElement=class{}
  const dom={listeners:[],raf:[],styleRemoves:0}
  globalThis.window={addEventListener:(type,fn)=>dom.listeners.push({type,fn}),removeEventListener:(type,fn)=>{const i=dom.listeners.findIndex(l=>l.type===type&&l.fn===fn);if(i>=0)dom.listeners.splice(i,1)}}
  globalThis.document={createElement:()=>({dataset:{},style:{setProperty(){}},remove(){dom.styleRemoves++}}),head:{append(){}},activeElement:null}
  globalThis.requestAnimationFrame=fn=>{timers.scheduled++;dom.raf.push(fn);return dom.raf.length}
  globalThis.setTimeout=(fn,ms)=>{timers.scheduled++;return realSetTimeout(()=>{timers.fired++;fn()},ms)}
  globalThis.__dshEffects=[]
  return dom
}
installDom()

function makeVoice(tag){
  const v={tag,calls:{leave:0,start:0,stop:0,cancel:0,retry:0,discard:0,enabled:0,busy:0,held:0,for:0},heldEntries:[],enabledFlag:true}
  v.for=()=>{v.calls.for++;return{snapshot:()=>({phase:'idle'}),subscribe:()=>()=>{},start(){v.calls.start++},stop(){v.calls.stop++},cancel(){v.calls.cancel++},retry(){v.calls.retry++},discard(){v.calls.discard++}}}
  v.enabled=()=>{v.calls.enabled++;return v.enabledFlag}
  v.leave=()=>{v.calls.leave++}
  v.busy=()=>{v.calls.busy++;return false}
  v.held=()=>{v.calls.held++;return v.heldEntries}
  v.total=()=>Object.values(v.calls).reduce((a,b)=>a+b,0)
  return v
}
function makeGamepad(tag){
  const g={tag,bound:[],disposers:0,calls:{stopRepeat:0,bind:0}}
  g.bind=fn=>{g.calls.bind++;g.bound.push(fn);return()=>{g.disposers++}}
  g.stopRepeat=()=>{g.calls.stopRepeat++}
  return g
}
function makeHarness(){
  const providers=Object.create(null)
  // Mirrors the real Cordis proxy: once the plugin fiber is disposed, EVERY
  // injected service accessor on the inactive ctx throws instead of returning
  // stale values. The service objects themselves stay callable through the
  // harness handle, matching independently provided services still alive.
  let inactive=false
  const calls={stageAcquires:0,stageReleases:0,doubleStageReleases:0,viewDisposes:0,doubleViewDisposes:0,opened:[],views:[]}
  const provided={},slotsInjected=[],registered=[],parentCleanups=[],dependents=[],editors=new Map()
  const source=v=>({getSnapshot:()=>v,subscribe:()=>()=>{}})
  const list={ids:['s1','s2'],byId:{s1:{id:'s1',displayTitle:'S1',running:false,blank:false},s2:{id:'s2',displayTitle:'S2',running:true,blank:false}},current:'s1',phase:'ready'}
  const editorFor=id=>{if(!editors.has(id))editors.set(id,{calls:{focus:0,composing:0,deleteBackward:0,send:0,attach:0},state:source({draft:'x',phase:'plain'}),focus(){this.calls.focus++;return true},composing(){this.calls.composing++;return false},deleteBackward(){this.calls.deleteBackward++;return true},send(){this.calls.send++;return true},attach(){this.calls.attach++;return()=>{}}});return editors.get(id)}
  function refresh(d){
    if(d.active){const cs=d.cleanups;d.cleanups=[];d.active=false;for(const off of cs)off()}
    if(!d.deps.every(n=>providers[n]!==undefined))return
    const child=Object.create(ctx)
    for(const n of d.deps)child[n]=providers[n]
    child.effect=fn=>{const off=fn();if(off)d.cleanups.push(off)}
    d.active=true
    d.callback(child)
  }
  const services={
    layout:{toggles:0,workbench:[],toggleSidebar(){this.toggles++},setWorkbenchActive(v){this.workbench.push(v)}},
    sessions:{list:source(list),open(id){calls.opened.push(id)},acquireStage(){calls.stageAcquires++;let done=false;return()=>{if(done)calls.doubleStageReleases++;else{done=true;calls.stageReleases++}}}},
    slots:{inject(name,fn){slotsInjected.push({name,fn});return()=>{}},register(options,component){registered.push({options,component});let done=false;return()=>{if(done)calls.doubleViewDisposes++;else{done=true;calls.viewDisposes++}}},entries:()=>[{store:'store-x'}],resolveStore:()=>({actions:{setView(v){calls.views.push(['setView',v])},openView(v,f){calls.views.push(['openView',v,f])}}})},
    uiSession:{adapter:{resolve:id=>({id})}},
    uiConversation:{binding:()=>({activate(){}})},
    conversation:{blocks:{storeFor:()=>source(undefined)}},
    deckInput:{for:id=>editorFor(id)},
  }
  const ctx={
    inject(deps,callback){const d={deps:[...deps],callback,cleanups:[],active:false};dependents.push(d);refresh(d);return{}},
    provide(name,value){provided[name]=value},
    effect(fn){const off=fn();if(off)parentCleanups.push(off)},
  }
  for(const key of Object.keys(services))Object.defineProperty(ctx,key,{get(){if(inactive)throw new Error(`cannot get required service "${key}" in inactive context`);return services[key]}})
  return {ctx,provided,registered,parentCleanups,calls,list,editorFor,services,
    inactivate(){inactive=true},
    prearrive(name,value){providers[name]=value},
    arrive(name,value){providers[name]=value;for(const d of dependents)if(d.deps.includes(name))refresh(d)},
    withdraw(name){providers[name]=undefined;for(const d of dependents)if(d.deps.includes(name))refresh(d)},
    activateSlots(){for(const {fn} of slotsInjected)fn()},
    viewRegistrations(){return registered.filter(r=>r.options.name==='conversation.view')}}
}
function start(providers={},seed={}){
  const dom=installDom()
  for(const [key,value] of Object.entries(seed))localStorage.setItem(key,value)
  const h=makeHarness()
  for(const [name,value] of Object.entries(providers))h.prearrive(name,value)
  apply(h.ctx)
  h.activateSlots()
  return {h,dom}
}
// The hooks mock records effects but there is no reconciler, so mounting
// means calling the registered component and then invoking every child
// function component (Lane, SessionSurface) once by walking the JSX tree.
function renderNode(node,rendered){
  if(Array.isArray(node)){for(const c of node)renderNode(c,rendered);return}
  if(node&&typeof node==='object'){
    if(typeof node.type==='function'){const out=node.type(node.props||{});if(rendered)rendered.push(out);renderNode(out,rendered)}
    renderNode(node.props&&node.props.children,rendered)
  }
}
function mount(h){
  const entries=h.viewRegistrations()
  const entry=entries[entries.length-1]
  const before=globalThis.__dshEffects.length
  const rendered=[]
  renderNode(entry.component(),rendered)
  const effects=globalThis.__dshEffects.slice(before)
  effects.tree=rendered // rendered child subtrees, so tests can reach retained props like Lane's openView
  return effects
}
function collect(node,pred,out=[]){
  if(Array.isArray(node)){for(const c of node)collect(c,pred,out);return out}
  if(node&&typeof node==='object'){if(pred(node))out.push(node);collect(node.props&&node.props.children,pred,out)}
  return out
}
test('package and service level dependencies are optional',()=>{
  assert.equal(inject.includes('androidVoice'),false)
  assert.equal(inject.includes('gamepadInput'),false)
  const meta=JSON.parse(readFileSync('package.json','utf8')).dsh.client.inject
  assert.equal(meta.includes('@dsh-android/dsh-android-voice-input'),false)
  assert.equal(meta.includes('@dsh-android/dsh-client-input-gamepad'),false)
  assert.ok(meta.includes('@deepseek-ai/dsh-client-runtime'))
})
test('neither plugin: deck enables, lanes, attach and text send work',()=>{
  const {h}=start()
  const deck=h.provided.voiceDeck
  assert.ok(deck)
  assert.ok(h.registered.some(r=>r.options.name==='sidebar.workspaces.before'))
  deck.setEnabled(true)
  deck.assign(0,'s1');deck.assign(1,'s2')
  mount(h)
  const s=deck.getSnapshot()
  assert.deepEqual(s.lanes,['s1','s2',null,null]);assert.equal(s.active,1)
  assert.equal(h.editorFor('s1').calls.attach,1)
  deck.open()
  assert.ok(h.calls.views.some(v=>v[0]==='setView'&&v[1]==='voice-deck'))
  deck.intent('send')
  assert.equal(h.editorFor('s2').calls.send,1);assert.equal(deck.getSnapshot().notice,'')
  deck.intent('record')
  assert.match(deck.getSnapshot().notice,/语音/)
  assert.equal(timers.scheduled,timers.fired)
})
test('voice only: record works and missing gamepad never blocks; withdrawn voice gets no calls',()=>{
  const v1=makeVoice('v1')
  const {h}=start({androidVoice:v1})
  const deck=h.provided.voiceDeck
  deck.setEnabled(true);deck.assign(0,'s1')
  mount(h)
  deck.intent('record')
  assert.equal(v1.calls.start,1)
  h.withdraw('androidVoice')
  const frozen=v1.total()
  deck.intent('record')
  assert.match(deck.getSnapshot().notice,/未安装语音输入插件/)
  assert.equal(v1.total(),frozen)
  deck.intent('send')
  assert.equal(h.editorFor('s1').calls.send,1)
  const v2=makeVoice('v2')
  h.arrive('androidVoice',v2)
  deck.intent('record')
  assert.equal(v2.calls.start,1)
})
test('gamepad only: binds once on mount, releases on unload, text send unaffected',()=>{
  const g1=makeGamepad('g1')
  const {h}=start({gamepadInput:g1})
  const deck=h.provided.voiceDeck
  assert.equal(g1.calls.bind,0) // provider alone must not bind before the view mounts
  deck.setEnabled(true);deck.assign(0,'s1')
  assert.equal(g1.bound.length,0) // enabled but view not mounted yet
  mount(h)
  assert.equal(g1.bound.length,1)
  g1.bound[0]('send')
  assert.equal(h.editorFor('s1').calls.send,1)
  g1.bound[0]('record')
  assert.match(deck.getSnapshot().notice,/未安装语音输入插件/)
  h.withdraw('gamepadInput')
  assert.equal(g1.disposers,1)
  const g2=makeGamepad('g2')
  h.arrive('gamepadInput',g2)
  assert.equal(g2.bound.length,1) // exactly once, no remount needed
})
test('mounted churn: identity, slots, leases and active survive provider reloads',()=>{
  const v1=makeVoice('v1'),g1=makeGamepad('g1')
  const {h}=start({androidVoice:v1,gamepadInput:g1})
  const deck=h.provided.voiceDeck
  deck.setEnabled(true)
  deck.assign(0,'s1');deck.assign(1,'s2')
  mount(h)
  const before=deck.getSnapshot(),lanes=before.lanes,deckRef=deck
  const views=h.viewRegistrations(),viewComponent=views[0].component
  const stages=h.calls.stageAcquires,registers=h.registered.length
  assert.equal(g1.bound.length,1)
  h.withdraw('gamepadInput')
  assert.equal(g1.disposers,1)
  const g2=makeGamepad('g2')
  h.arrive('gamepadInput',g2)
  assert.equal(g2.bound.length,1)
  h.withdraw('androidVoice')
  const frozen=v1.total()
  deck.activate(1) // same active lane, must not touch the withdrawn voice
  deck.intent('record')
  assert.equal(v1.total(),frozen) // no calls into the withdrawn voice service
  assert.match(deck.getSnapshot().notice,/未安装语音输入插件/)
  const v2=makeVoice('v2')
  h.arrive('androidVoice',v2)
  deck.intent('record')
  assert.equal(v2.calls.start,1)
  const after=deck.getSnapshot()
  assert.equal(after.lanes,lanes);assert.equal(after.active,before.active);assert.equal(after.enabled,true)
  assert.equal(deck,h.provided.voiceDeck);assert.equal(deck,deckRef) // same deck service
  assert.equal(h.viewRegistrations().length,1)
  assert.equal(h.viewRegistrations()[0].component,viewComponent) // view not re-registered
  assert.equal(h.registered.length,registers)
  assert.equal(h.calls.stageAcquires,stages) // no duplicate stage leases
  // Each bind is a fenced generation: even while the view stays mounted and
  // enabled, a withdrawn provider's retained callback must stay permanently
  // inert; only the current generation may act.
  g1.bound[0]('next')
  assert.equal(deck.getSnapshot().active,before.active) // old generation inert
  g2.bound[0]('previous')
  assert.equal(deck.getSnapshot().active,0) // current generation works once
})
test('deck close, disable and plugin unload leak no sinks, listeners or timers',()=>{
  const v1=makeVoice('v1'),g1=makeGamepad('g1')
  const {h,dom}=start({androidVoice:v1,gamepadInput:g1})
  const deck=h.provided.voiceDeck
  const listenerBaseline=dom.listeners.length
  deck.setEnabled(true);deck.assign(0,'s1')
  const unmount=mount(h)
  assert.ok(dom.listeners.some(l=>l.type==='dsh-gamepad-reset'))
  for(const off of unmount)off() // view exits
  assert.equal(g1.disposers,1) // gamepad sink released on unmount
  assert.equal(v1.calls.cancel,1) // held recordings kept per original session via cancel
  assert.equal(dom.listeners.length,listenerBaseline)
  deck.setEnabled(false)
  const sendBaseline=h.editorFor('s1').calls.send
  const voiceFrozen=v1.total()
  g1.bound[0]('send');g1.bound[0]('record')
  assert.equal(h.editorFor('s1').calls.send,sendBaseline) // late callbacks gated
  assert.equal(v1.total(),voiceFrozen)
  assert.equal(g1.disposers,1) // disable does not double-dispose the bind
  // Parent plugin unload releases the binding even while a view is mounted.
  const g2=makeGamepad('g2')
  const s2=start({gamepadInput:g2})
  const deck2=s2.h.provided.voiceDeck
  deck2.setEnabled(true);deck2.assign(0,'s1')
  const unmount2=mount(s2.h)
  assert.equal(g2.bound.length,1)
  for(const off of s2.h.parentCleanups)off() // plugin fiber unloaded with view still mounted
  assert.equal(g2.disposers,1)
  const g3=makeGamepad('g3')
  s2.h.arrive('gamepadInput',g3)
  assert.equal(g3.bound.length,0) // disposed deck never rebinds
  for(const off of unmount2)off()
  assert.equal(timers.scheduled,timers.fired)
})
test('withdrawn gamepad callback stays inert after provider removal',()=>{
  const v1=makeVoice('v1'),g1=makeGamepad('g1')
  const {h}=start({androidVoice:v1,gamepadInput:g1})
  const deck=h.provided.voiceDeck
  deck.setEnabled(true);deck.assign(0,'s1')
  mount(h)
  const cb1=g1.bound[0]
  cb1('send')
  assert.equal(h.editorFor('s1').calls.send,1) // the current binding works once
  const sendBaseline=h.editorFor('s1').calls.send,deleteBaseline=h.editorFor('s1').calls.deleteBackward
  const voiceFrozen=v1.total(),lanes=deck.getSnapshot().lanes,active=deck.getSnapshot().active
  h.withdraw('gamepadInput')
  assert.equal(g1.disposers,1)
  assert.doesNotThrow(()=>{cb1('send');cb1('delete');cb1('record')})
  assert.equal(h.editorFor('s1').calls.send,sendBaseline) // withdrawn callback never sends
  assert.equal(h.editorFor('s1').calls.deleteBackward,deleteBaseline)
  assert.equal(v1.total(),voiceFrozen) // nor deletes, records or touches voice
  assert.equal(deck.getSnapshot().lanes,lanes);assert.equal(deck.getSnapshot().active,active)
  const g2=makeGamepad('g2')
  h.arrive('gamepadInput',g2)
  g2.bound[0]('send')
  assert.equal(h.editorFor('s1').calls.send,sendBaseline+1) // fresh generation works
})
test('view close and reopen fences the old binding and rebinds once',()=>{
  const g1=makeGamepad('g1')
  const {h}=start({gamepadInput:g1})
  const deck=h.provided.voiceDeck
  deck.setEnabled(true);deck.assign(0,'s1')
  const unmount=mount(h)
  const cb1=g1.bound[0]
  for(const off of unmount)off() // view exits
  assert.equal(g1.disposers,1)
  deck.setEnabled(false);deck.setEnabled(true)
  const unmount2=mount(h)
  assert.equal(g1.bound.length,2) // exactly one fresh bind on reopen
  const sendBaseline=h.editorFor('s1').calls.send
  assert.doesNotThrow(()=>cb1('send'))
  assert.equal(h.editorFor('s1').calls.send,sendBaseline) // closed-view callback inert
  g1.bound[1]('send')
  assert.equal(h.editorFor('s1').calls.send,sendBaseline+1) // reopened binding works
  for(const off of unmount2)off()
})
test('disable releases the gamepad synchronously before deferred React cleanup',()=>{
  const g1=makeGamepad('g1')
  const {h}=start({gamepadInput:g1})
  const deck=h.provided.voiceDeck
  deck.setEnabled(true);deck.assign(0,'s1')
  const unmount=mount(h)
  const cb=g1.bound[0]
  const sendBaseline=h.editorFor('s1').calls.send
  deck.setEnabled(false) // React view cleanup intentionally still deferred
  assert.equal(g1.disposers,1) // released synchronously, not on unmount
  assert.doesNotThrow(()=>{cb('send');cb('record')})
  assert.equal(h.editorFor('s1').calls.send,sendBaseline) // no sink during the gap
  for(const off of unmount)off()
  assert.equal(g1.disposers,1) // deferred unmount does not double-dispose
  deck.setEnabled(true)
  const unmount2=mount(h)
  assert.equal(g1.bound.length,2)
  g1.bound[1]('send')
  assert.equal(h.editorFor('s1').calls.send,sendBaseline+1) // re-enable rebinds once
  for(const off of unmount2)off()
})
test('parent disposal before React cleanup leaves stale callbacks and actions inert',()=>{
  const v1=makeVoice('v1'),g1=makeGamepad('g1')
  const {h}=start({androidVoice:v1,gamepadInput:g1})
  const deck=h.provided.voiceDeck
  deck.setEnabled(true);deck.assign(0,'s1');deck.assign(1,'s2')
  const unmount=mount(h)
  const cb=g1.bound[0]
  const sendBefore=h.editorFor('s1').calls.send,s2SendBefore=h.editorFor('s2').calls.send,s2DeleteBefore=h.editorFor('s2').calls.deleteBackward
  const lanes=deck.getSnapshot().lanes,active=deck.getSnapshot().active
  const stages=h.calls.stageAcquires,views=h.calls.views.length
  for(const off of h.parentCleanups)off() // plugin fiber disposed, React cleanup deferred
  // The shared one-shot detach ran while the ctx was usable: it cancelled the
  // two lane recordings, as a normal unmount would. Nothing after this point
  // may touch the voice service at all.
  assert.equal(v1.calls.cancel,2)
  const voiceFrozen=v1.total()
  h.inactivate() // every ctx service accessor on the inactive fiber now throws
  assert.doesNotThrow(()=>{
    cb('send');cb('delete')
    deck.intent('send');deck.setEnabled(true);deck.activate(1);deck.open();deck.assign(0,'s2')
  })
  assert.equal(h.editorFor('s1').calls.send,sendBefore) // nothing reached either editor
  assert.equal(h.editorFor('s2').calls.send,s2SendBefore);assert.equal(h.editorFor('s2').calls.deleteBackward,s2DeleteBefore)
  assert.equal(v1.total(),voiceFrozen) // nothing reached the voice service
  assert.equal(deck.getSnapshot().lanes,lanes);assert.equal(deck.getSnapshot().active,active)
  assert.equal(h.calls.stageAcquires,stages);assert.equal(h.calls.views.length,views)
  assert.equal(g1.disposers,1) // old bind disposer fired exactly once
  assert.equal(g1.bound.length,1) // disposed deck never rebinds
  for(const off of unmount)off()
})
test('parent unload drops sink, listeners, leases and workbench state before React cleanup',()=>{
  const v1=makeVoice('v1'),g1=makeGamepad('g1')
  const {h,dom}=start({androidVoice:v1,gamepadInput:g1})
  const deck=h.provided.voiceDeck
  deck.setEnabled(true);deck.assign(0,'s1');deck.assign(1,'s2')
  mount(h) // React cleanup intentionally never runs below
  assert.deepEqual(h.services.layout.workbench,[true])
  assert.ok(dom.listeners.some(l=>l.type==='dsh-gamepad-reset'))
  const acquires=h.calls.stageAcquires
  assert.equal(acquires,2)
  assert.equal(dom.styleRemoves,0)
  for(const off of h.parentCleanups)off() // plugin fiber disposal alone
  assert.deepEqual(h.services.layout.workbench,[true,false]) // workbench flag reset synchronously
  assert.equal(dom.listeners.filter(l=>l.type==='dsh-gamepad-reset').length,0)
  assert.equal(g1.disposers,1) // gamepad sink released exactly once
  assert.equal(h.calls.stageReleases,acquires) // every acquired stage lease released
  assert.equal(h.calls.doubleStageReleases,0)
  assert.equal(h.calls.viewDisposes,1) // conversation.view registration disposed
  assert.equal(dom.styleRemoves,1)
})
test('deferred React cleanup after parent unload is a safe idempotent no-op',()=>{
  const v1=makeVoice('v1'),g1=makeGamepad('g1')
  const {h,dom}=start({androidVoice:v1,gamepadInput:g1})
  const deck=h.provided.voiceDeck
  deck.setEnabled(true);deck.assign(0,'s1')
  const unmount=mount(h)
  for(const off of h.parentCleanups)off()
  assert.deepEqual(h.services.layout.workbench,[true,false])
  h.inactivate() // every ctx service accessor now throws
  assert.doesNotThrow(()=>{for(const off of unmount)off()})
  assert.deepEqual(h.services.layout.workbench,[true,false]) // exactly one false; a co-owner is not clobbered twice
  assert.equal(g1.disposers,1) // no double dispose
  assert.equal(h.calls.stageReleases,h.calls.stageAcquires)
  assert.equal(h.calls.doubleStageReleases,0)
  assert.equal(h.calls.viewDisposes,1)
  assert.equal(h.calls.doubleViewDisposes,0)
  assert.equal(dom.styleRemoves,1) // no double style removal
})
test('after unload with no React cleanup every retained entry point is inert',()=>{
  const v1=makeVoice('v1'),g1=makeGamepad('g1')
  const {h,dom}=start({androidVoice:v1,gamepadInput:g1})
  const deck=h.provided.voiceDeck
  deck.setEnabled(true);deck.assign(0,'s1')
  globalThis.matchMedia=()=>({matches:true}) // hardware keyboard path schedules the focus rAF
  const unmount=mount(h)
  const cb=g1.bound[0]
  const openViews=collect(unmount.tree,n=>n.props&&typeof n.props.openView==='function').map(n=>n.props.openView)
  assert.ok(openViews.length>0)
  const rafQueued=[...dom.raf]
  assert.ok(rafQueued.length>0)
  const before={send:h.editorFor('s1').calls.send,focus:h.editorFor('s1').calls.focus,leave:v1.calls.leave,start:v1.calls.start,
    lanes:deck.getSnapshot().lanes.join(','),active:deck.getSnapshot().active,enabled:deck.getSnapshot().enabled,
    draft:localStorage.getItem('dsh.voice-deck.controller.v2'),stages:h.calls.stageAcquires,views:h.calls.views.length,registered:h.registered.length}
  for(const off of h.parentCleanups)off() // unload without running any React cleanup
  h.inactivate()
  assert.deepEqual(h.services.layout.workbench,[true,false])
  assert.doesNotThrow(()=>{
    for(const intent of ['sidebar','previous','next','record','delete','send'])cb(intent)
    deck.setEnabled(true);deck.assign(1,'s2');deck.activate(1);deck.open();deck.intent('send');deck.intent('record')
    for(const openView of openViews)openView('chat','x')
    for(const fn of rafQueued)fn()
  })
  assert.equal(h.editorFor('s1').calls.send,before.send) // no stale editor mutation
  assert.equal(h.editorFor('s1').calls.focus,before.focus)
  assert.equal(v1.calls.leave,before.leave) // no wrong-session voice work
  assert.equal(v1.calls.start,before.start)
  assert.equal(deck.getSnapshot().lanes.join(','),before.lanes)
  assert.equal(deck.getSnapshot().active,before.active)
  assert.equal(deck.getSnapshot().enabled,before.enabled)
  assert.equal(localStorage.getItem('dsh.voice-deck.controller.v2'),before.draft) // persisted draft untouched
  assert.equal(h.calls.stageAcquires,before.stages) // no new lease after unload
  assert.equal(h.calls.views.length,before.views) // no view navigation
  assert.equal(h.registered.length,before.registered) // no re-registration
})
test('view close and reopen toggle the workbench flag exactly once per mount',()=>{
  const {h}=start()
  const deck=h.provided.voiceDeck
  deck.setEnabled(true);deck.assign(0,'s1')
  const unmount=mount(h)
  assert.deepEqual(h.services.layout.workbench,[true])
  for(const off of unmount)off()
  assert.deepEqual(h.services.layout.workbench,[true,false])
  deck.setEnabled(false);deck.setEnabled(true)
  const unmount2=mount(h)
  assert.deepEqual(h.services.layout.workbench,[true,false,true])
  for(const off of unmount2)off()
  assert.deepEqual(h.services.layout.workbench,[true,false,true,false])
})
test('cold reload restores lanes, active, drafts and re-leases each mounted stage',()=>{
  const saved=JSON.stringify({enabled:true,lanes:['s1','s2',null,null],active:1,notice:''})
  const {h}=start({},{'dsh.voice-deck.controller.v2':saved})
  const deck=h.provided.voiceDeck
  const s=deck.getSnapshot()
  assert.equal(s.enabled,true);assert.equal(s.active,1)
  assert.deepEqual(s.lanes,['s1','s2',null,null])
  mount(h)
  assert.equal(h.calls.stageAcquires,2) // one lease per mounted lane
  assert.equal(localStorage.getItem('dsh.voice-deck.controller.v2'),saved) // untouched persisted draft
})
test('settings keep held-text ownership with voice and render plainly without it',()=>{
  const v1=makeVoice('v1');v1.heldEntries=[{sessionId:'s1',text:'待插入'}]
  const {h}=start({androidVoice:v1})
  const settings=h.registered.find(r=>r.options.name==='settings.section').component
  const tree=settings()
  assert.equal(collect(tree,n=>n.type==='details').length,1)
  const retry=collect(tree,n=>n.type==='button'&&JSON.stringify(n.props.children||'').includes('插入原会话'))[0]
  const discard=collect(tree,n=>n.type==='button'&&JSON.stringify(n.props.children||'').includes('丢弃'))[0]
  retry.props.onClick();discard.props.onClick()
  assert.equal(v1.calls.retry,1);assert.equal(v1.calls.discard,1)
  const plain=start()
  const plainSettings=plain.h.registered.find(r=>r.options.name==='settings.section').component
  const plainTree=plainSettings()
  assert.equal(collect(plainTree,n=>n.type==='details').length,0)
})
