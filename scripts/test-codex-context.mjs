/** Execute the shipped context boundary and image importer, with isolated fixtures. */
import {readFileSync,mkdtempSync,writeFileSync,mkdirSync,rmSync,symlinkSync} from 'node:fs'
import {readFile,realpath} from 'node:fs/promises'
import {resolve,join,basename,sep,dirname,parse} from 'node:path'
import {tmpdir,homedir} from 'node:os'
import {execFileSync} from 'node:child_process'
import vm from 'node:vm'
import test from 'node:test'
import assert from 'node:assert/strict'

const relay=readFileSync('android-shell/vendor/relay-dsh-plugin-codex/lib/host-plugin.js','utf8')
const loop=process.env.DSH_CONTEXT_ENGINE ? readFileSync(join(process.env.DSH_CONTEXT_ENGINE,'dsh-agent-loop/lib/index.js'),'utf8') : execFileSync('python3',['-c',`import sys;sys.path.insert(0,'scripts');from lib.codex_context_patch import patch_agent_loop,release_source;print(patch_agent_loop(release_source('dsh-agent-loop')))`],{encoding:'utf8',maxBuffer:1024*1024})
const method=loop.slice(loop.indexOf('\tasync preStep('),loop.indexOf('\n\t/** Open one turn'))
const handler=relay.slice(relay.indexOf('({ agent, messages, signal }, next) => {',relay.indexOf('// The scheduler and UI')),relay.indexOf(', { global: true, prepend: true }));',relay.indexOf('// The scheduler and UI')))
const routing=relay.slice(relay.indexOf('function nativeCodexSelection('),relay.indexOf('//#region host-plugin.js'))
const routes=vm.runInNewContext(routing+';({nativeCodexSelection,nativeCodexRequestConfig})')
const nativeModelSelections=new WeakMap()
const native=vm.runInNewContext('('+handler+')',{adapter:{servesAgent:a=>a.codex},...routes,nativeModelSelections,ctx:{agentDefaultModel:{currentSelection:()=>({provider:'relay-codex',model:'gpt-6-astra'})},sessionProjections:{stateOf:()=>({pending:{provider:'relay-codex',model:'gpt-6-astra',reasoningEffort:'low'}})}}})
const signal=new AbortController().signal
const input={source:{kind:'user'},content:[{type:'text',text:'$fixture-skill hi'},{type:'image',attachment:{attachmentId:'fixture'}}]}
const injected={source:{kind:'plugin',plugin:'dsh-policy'},content:[{type:'text',text:'DSH_INJECTION_SENTINEL'}]}

function fixture(codex){
 const calls={assemble:0,preStep:0}
 const assembly={sections:[{text:'DSH_SYSTEM_SENTINEL'}],contexts:[],tools:[{name:'dsh-tool'}],variables:{}}
 const Klass=vm.runInNewContext('(class {'+method+'})',{
  assembleContextFor:()=>({}),renderContextSections:()=>[],joinContextSections:()=>''
 })
 const a=new Klass();Object.assign(a,{codex,phase:{kind:'running',abort:{signal}},inbox:{claim:()=>[input,injected]},runtimeContext:{project:()=>undefined},
  loopCtx:{systemPrompt:{assemble:async()=>{calls.assemble++;return assembly}}},
  dispatch:{waterfall:async(name,p,next)=>{if(name==='agent/context-delegation')return native({...p,agent:a},next);calls.preStep++;return next()}}
 });return {a,calls}
}
test('native Codex bypasses DSH assembly and context producers; user text/images survive',async()=>{
 const {a,calls}=fixture(true),result=await a.preStep('next-turn',{turn:1,step:1})
 assert.deepEqual(calls,{assemble:0,preStep:0});assert.equal(result.messages.length,1);assert.equal(result.messages[0],input)
 assert.equal(result.assembly.sections.length,0);assert.equal(result.assembly.tools.length,0)
})
test('ordinary DSH still assembles prompts and runs pre-step middleware',async()=>{
 const {a,calls}=fixture(false),result=await a.preStep('next-turn',{turn:1,step:1})
 assert.deepEqual(calls,{assemble:1,preStep:1});assert.equal(result.messages.length,2);assert.equal(result.assembly.sections[0].text,'DSH_SYSTEM_SENTINEL')
})
test('plugin-only wakeups do not resend the previous user turn to native Codex',async()=>{
 const result=await native({agent:{codex:true},messages:[injected],signal},()=>{throw Error('Unexpected fallback')})
 assert.equal(result.messages.length,0)
})
const region=relay.slice(relay.indexOf('function codexImagePreviewRoots('),relay.indexOf('//#region codex-tools.js'))
const imageApi=vm.runInNewContext(region+';({codexImagePreviewRoots,importCodexImage,importCodexGeneratedImage})',{readFile,realpath,resolve,join,basename,sep,Buffer,homedir,process:{env:{}}})
const complete=relay.slice(relay.indexOf('\tasync completeItem('),relay.indexOf('\n\tappendActivity(',relay.indexOf('\tasync completeItem(')))
const Projector=vm.runInNewContext('(class {'+complete+'})',{
 ...imageApi,resolve,homedir,basename,isCodexActivityItem:()=>false,imagePreviewFailureReason:()=> 'outside-roots'
})
test('generated images under the configured Codex home render; sibling and symlink escapes stay blocked',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'dsh-codex-image-'))
 try{
  const home=join(dir,'private-codex'),workspace=join(dir,'workspace'),images=join(home,'generated_images')
  mkdirSync(images,{recursive:true});mkdirSync(workspace)
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')
  const file=join(images,'generated.png');writeFileSync(file,png)
  const p=new Projector();p.codexHome=home;p.logger={warn(){}};p.attachments={saveImage:async({data})=>{assert(data.equals(png));return {attachmentId:'saved-image'}}}
  const state=()=>({completed:new Set(),nextIndex:0})
  const chunks=await p.completeItem({session:{header:{cwd:workspace}}},'thread','turn',{id:'image',type:'imageGeneration',savedPath:file},state())
  assert.equal(chunks.at(-1).block.type,'image');assert.equal(chunks.at(-1).block.attachment.attachmentId,'saved-image')
  const outside=join(dir,'secret.png');writeFileSync(outside,png);symlinkSync(outside,join(images,'escape.png'))
  await assert.rejects(imageApi.importCodexImage(outside,[workspace,images],p.attachments),/outside/)
  await assert.rejects(imageApi.importCodexImage(join(images,'escape.png'),[workspace,images],p.attachments),/outside/)
 }finally{rmSync(dir,{recursive:true,force:true})}
})

const store=process.env.DSH_CONTEXT_ENGINE ? readFileSync(join(process.env.DSH_CONTEXT_ENGINE,'dsh-attachment-local/lib/index.js'),'utf8') : execFileSync('python3',['-c',`import sys;sys.path.insert(0,'scripts');from lib.codex_context_patch import patch_attachment_store,release_source;print(patch_attachment_store(release_source('dsh-attachment-local')))`],{encoding:'utf8',maxBuffer:1024*1024})
const durability=store.slice(store.indexOf('async function ensureDurableHome('),store.indexOf('\n/**',store.indexOf('async function ensureDurableHome(')))
test('Android fsync stops at canonical filesDir, including Android path aliases',async()=>{
 const calls=[]
 const ensure=vm.runInNewContext(durability+';ensureDurableHome',{
  resolve,dirname,parse,durableHomes:new Set(),process:{platform:'android',env:{TERMUX__PREFIX:'/data/data/pkg/files/usr'}},
  mkdir:async()=>{},realpath:async p=>p.replace('/data/data/','/data/user/0/'),
  ensureDurableDirectory:async(...args)=>calls.push(args)
 })
 await ensure('/data/data/pkg/files/home/.dsh')
 assert.deepEqual(calls,[['/data/user/0/pkg/files/home/.dsh','/data/user/0/pkg/files']])
 await assert.rejects(ensure('/storage/emulated/0/work'),/inside application/)
})
test('desktop directory durability retains its original root boundary',async()=>{
 const calls=[]
 const ensure=vm.runInNewContext(durability+';ensureDurableHome',{
  resolve,dirname,parse,durableHomes:new Set(),process:{platform:'linux'},ensureDurableDirectory:async(...args)=>calls.push(args)
 })
 await ensure('/home/example/.dsh');assert.deepEqual(calls,[['/home/example/.dsh','/']])
})

test('native routing snapshots selected model/effort without inheriting DSH defaults',async()=>{
 const pending={provider:'relay-codex',model:'gpt-5.6-sol',reasoningEffort:'low'}
 const selected=routes.nativeCodexSelection({pending,lastUsed:{provider:'deepseek-official',model:'old'}})
 pending.model='later-selection'
 const config=routes.nativeCodexRequestConfig({provider:'deepseek-official',model:'default',reasoningEffort:'high',maxTokens:100},selected)
 assert.equal(config.provider,'relay-codex');assert.equal(config.model,'gpt-5.6-sol');assert.equal(config.reasoningEffort,'low')
 const without=routes.nativeCodexRequestConfig(config,routes.nativeCodexSelection({pending:null,lastUsed:{provider:'relay-codex',model:'gpt-6-astra'}}))
 assert.equal(without.reasoningEffort,undefined)
 assert.throws(()=>routes.nativeCodexSelection({pending:{provider:'deepseek-official',model:'wrong'}}),/Codex/)
 assert.throws(()=>routes.nativeCodexRequestConfig(config,undefined),/not captured/)
})
test('shipped native request hook overrides routing only for a Codex Agent',async()=>{
 const start=relay.indexOf('async ({ agent }, next) => {',relay.indexOf('const nativeModelSelections'))
 const end=relay.indexOf(', { global: true, prepend: true }));',start)
 const listener=vm.runInNewContext('('+relay.slice(start,end)+')',{adapter:{servesAgent:a=>a.codex},...routes,nativeModelSelections})
 const {a}=fixture(true);await a.preStep('next-turn',{turn:1,step:1})
 const base={provider:'deepseek-official',model:'deepseek-v4-flash',reasoningEffort:'high'}
 const actual=await listener({agent:a},async()=>base)
 assert.equal(actual.provider,'relay-codex');assert.equal(actual.model,'gpt-6-astra');assert.equal(actual.reasoningEffort,'low')
 assert.equal(await listener({agent:{codex:false}},async()=>base),base)
})

test('new native sessions capture the configured default before any model event exists',()=>{
 const defaultSelection={provider:'relay-codex',model:'gpt-5.6-luna'}
 assert.equal(routes.nativeCodexSelection({pending:null,lastUsed:null},defaultSelection).model,'gpt-5.6-luna')
 assert.equal(routes.nativeCodexSelection({pending:{provider:'relay-codex',model:'gpt-6-astra'}},defaultSelection).model,'gpt-6-astra')
})
