import test from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {Context} from '@deepseek-ai/cordis'
import {endpoint,requestProvider,validateProfiles} from '../src/providers.mjs'
import {ResponseFeed} from '../src/state.mjs'
import * as plugin from '../lib/index.js'
import {WebSocketServer} from 'ws'
import {once} from 'node:events'
const fixture=()=>{const b=Buffer.alloc(64);b.write('RIFF');b.write('WAVE',8);return b}
const listen=async handler=>{const server=createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));return {url:`http://127.0.0.1:${server.address().port}`,close:()=>new Promise(r=>{server.closeAllConnections();server.close(r)})}}
test('Host WS capture is canceled by settings change and cannot deliver a stale final',async()=>{
 const home=mkdtempSync(join(tmpdir(),'speech-ws-')),old=process.env.HOME;process.env.HOME=home
 const ws=new WebSocketServer({port:0,host:'127.0.0.1'});await once(ws,'listening');let upstream
 ws.on('connection',s=>{upstream=s;s.send(JSON.stringify({type:'session.created',sample_rate:16000,format:'pcm16',protocol:'qwen-local-asr-v1'}))})
 const ctx=new Context(),routes=new Set(),watchers=new Set();let c=plugin.Config({asrProvider:'ws',services:[{id:'ws',model:'asr',baseUrl:`ws://127.0.0.1:${ws.address().port}/v1/realtime`}]})
 ctx.provide('settings',{register(){return {get:()=>c,watch(f){watchers.add(f);return()=>watchers.delete(f)}}}})
 ctx.provide('webServer',{register(r){routes.add(r);return()=>routes.delete(r)}})
 const handle=ctx.plugin(plugin);await handle;const server=await listen((req,res)=>[...routes][0].handler(req,res))
 try{
  const config=await fetch(server.url).then(r=>r.json())
  const post=async b=>fetch(server.url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({csrf:config.csrf,revision:config.revision,...b})})
  const started=await (await post({action:'asr-start'})).json();assert.ok(started.streamId)
  assert.equal((await post({action:'asr-chunk',streamId:started.streamId,sequence:0,audio:Buffer.alloc(640).toString('base64')})).status,200)
  const closed=once(upstream,'close');c={...c,enabled:false};for(const f of watchers)f(c);await closed
  assert.equal((await post({action:'asr-finish',streamId:started.streamId,sequence:1})).status,400)
  c={...c,enabled:true};for(const f of watchers)f(c)
  assert.equal((await post({action:'asr-start'})).status,400)
 }finally{await handle.dispose();await server.close();for(const c of ws.clients)c.terminate();ws.close();process.env.HOME=old;rmSync(home,{recursive:true,force:true})}
})
test('defaults and safe endpoint normalization',()=>{
 const c=plugin.Config({});assert.equal(c.asrProvider,'local');assert.equal(c.ttsEnabled,false);validateProfiles(c)
 assert.equal(endpoint('https://asr.example/v1/','audio/transcriptions'),'https://asr.example/v1/audio/transcriptions')
 for(const s of ['file:///tmp/x',Object.assign(new URL('https://host/v1'),{username:'test',password:'fixture'}).toString(),'https://host/?token=x'])assert.throws(()=>endpoint(s,'audio/speech'))
 assert.throws(()=>validateProfiles({...c,ttsEnabled:true}))
})
test('HTTP multipart ASR and JSON TTS preserve model, audio and transcript',async()=>{
 const requests=[];const server=await listen(async(req,res)=>{let body='';for await(const b of req)body+=b;requests.push({url:req.url,headers:req.headers,body});res.setHeader('content-type',req.url.endsWith('speech')?'audio/mpeg':'application/json');res.end(req.url.endsWith('speech')?Buffer.from([1,2,3]):JSON.stringify({text:'  请修改 A\n不要修改 B  '}))})
 try{const service={baseUrl:server.url+'/v1',model:'whisper',voice:'voice1',speed:1};assert.deepEqual(await requestProvider(service,'private-test-key','asr',fixture()),{text:'请修改 A\n不要修改 B'});assert.equal(requests[0].url,'/v1/audio/transcriptions');assert.match(requests[0].body,/name="model"\r\n\r\nwhisper/);assert.match(requests[0].body,/filename="speech.wav"/);assert.match(requests[0].body,/RIFF/);assert.equal(requests[0].headers.authorization,'Bearer private-test-key');const r=await requestProvider(service,'','tts','结果');assert.equal(r.audio,'AQID');assert.equal(requests[1].headers.authorization,undefined);assert.equal(JSON.parse(requests[1].body).input,'结果')}
 finally{await server.close()}
})
test('redirect does not forward credentials; errors, limits and cancellation reject',async()=>{
 let calls=0;const dest=await listen((q,r)=>{calls++;r.end('{}')});const redirect=await listen((q,r)=>{r.writeHead(302,{location:dest.url});r.end()})
 try{await assert.rejects(requestProvider({baseUrl:redirect.url,model:'x'},'key','asr',fixture()));assert.equal(calls,0)}finally{await redirect.close();await dest.close()}
 for(const response of [new Response('{}'),new Response('not json'),new Response('private error',{status:401}),new Response('x'.repeat(140000))])await assert.rejects(requestProvider({baseUrl:'https://example.test',model:'x'},'','asr',fixture(),undefined,async()=>response))
 await assert.rejects(requestProvider({baseUrl:'https://example.test',model:'x'},'','asr',Buffer.alloc(3000000)))
 const slow=await listen(()=>{}),controller=new AbortController();const promise=requestProvider({baseUrl:slow.url,model:'x'},'','asr',fixture(),controller.signal);controller.abort();try{await assert.rejects(promise)}finally{await slow.close()}
})
test('response feed hides tools/reasoning, separates sessions, bounds and deduplicates finals',()=>{
 const f=new ResponseFeed(),a={id:'A'},ev=(type,data,seq=1)=>({type,data,seq})
 f.event(a,ev('turn/start',{turn:1}));f.event(a,ev('assistant/chunk',{step:1,chunk:{type:'reasoning-delta',text:'SECRET'}}));assert.equal(f.read('A').text,'')
 f.event(a,ev('assistant/chunk',{step:1,chunk:{type:'text-delta',text:'答'.repeat(800)}}));assert.equal(f.read('A').text.length,600);assert.equal(f.read('B').text,'')
 f.event({id:'B'},ev('tool/result',{message:{content:[{type:'text',text:'TOOL'}]}}));assert.equal(f.read('B').text,'')
 const final=ev('assistant/message',{turn:1,step:1,message:{id:'m1',content:[{type:'text',text:'完成'},{type:'reasoning',text:'SECRET'}]}},9);f.event(a,final);const seq=f.read('A').seq;f.event(a,final);assert.equal(f.read('A').seq,seq);assert.equal(f.read('A').final,'完成')
 f.event(a,ev('turn/end',{reason:{kind:'error'}}));assert.equal(f.read('A').phase,'error');f.clear();assert.equal(f.read('A').seq,0)
})
test('Cordis cleanup and disabled services; credential writes remain redacted',async()=>{
 const home=mkdtempSync(join(tmpdir(),'speech-test-')),old=process.env.HOME;process.env.HOME=home
 const ctx=new Context(),routes=new Set(),watchers=new Set();let c=plugin.Config({}),validator
 ctx.provide('settings',{register(ns,schema,options){assert.equal(ns,'speech-services');validator=options.validate;return {get:()=>c,watch(fn){watchers.add(fn);return()=>watchers.delete(fn)}}}})
 ctx.provide('webServer',{register(r){routes.add(r);return()=>routes.delete(r)}})
 const handle=ctx.plugin(plugin);await handle
 const server=await listen((req,res)=>[...routes][0].handler(req,res))
 try{
  const state=await fetch(server.url).then(r=>r.json());assert.equal(state.asrProvider,'local');assert.equal(state.ttsEnabled,false)
  const post=async body=>{const r=await fetch(server.url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({csrf:state.csrf,revision:state.revision,...body})});return {code:r.status,value:await r.json()}}
  assert.equal((await post({action:'tts',text:'no'})).code,400);assert.equal((await post({action:'asr',csrf:'bad'})).code,400)
  c={...c,services:[{id:'api',name:'test',baseUrl:'https://example.test',model:'test'}]};validator(c);for(const fn of watchers)fn(c)
  assert.equal((await post({action:'key',id:'api',key:'dont-expose'})).code,200)
  const redacted=await fetch(server.url).then(r=>r.json());assert.equal(redacted.keySet.api,true);assert.equal(JSON.stringify(redacted).includes('dont-expose'),false)
  c={...c,enabled:false};for(const fn of watchers)fn(c);assert.equal((await post({action:'feed',sessionId:'A'})).code,400)
  await handle.dispose();assert.equal(routes.size,0);assert.equal(watchers.size,0)
 }finally{await server.close();await handle.dispose();process.env.HOME=old;rmSync(home,{recursive:true,force:true})}
})
test('disabling plugin aborts a pending upstream ASR and refuses its late reply',async()=>{
 const old=process.env.HOME,home=mkdtempSync(join(tmpdir(),'speech-abort-'));process.env.HOME=home
 let receive,upstreamResponse;const started=new Promise(r=>receive=r)
 const upstream=await listen(async(req,res)=>{for await(const b of req){}upstreamResponse=res;receive()})
 const ctx=new Context(),routes=new Set(),watchers=new Set();let c=plugin.Config({asrProvider:'api',services:[{id:'api',name:'test',baseUrl:upstream.url,model:'asr'}]})
 ctx.provide('settings',{register(){return {get:()=>c,watch(fn){watchers.add(fn);return()=>watchers.delete(fn)}}}})
 ctx.provide('webServer',{register(r){routes.add(r);return()=>routes.delete(r)}})
 const handle=ctx.plugin(plugin);await handle;const server=await listen((req,res)=>[...routes][0].handler(req,res))
 try{const config=await fetch(server.url).then(r=>r.json());const result=fetch(server.url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'asr',audio:fixture().toString('base64'),csrf:config.csrf,revision:config.revision})});await started;c={...c,enabled:false};for(const fn of watchers)fn(c);upstreamResponse.end(JSON.stringify({text:'late'}));const r=await result;assert.equal(r.status,400);assert.equal((await r.json()).text,undefined)}
 finally{await handle.dispose();await server.close();await upstream.close();process.env.HOME=old;rmSync(home,{recursive:true,force:true})}
})

test('MiMo uses api-key chat audio contracts and preserves WAV / wraps PCM',async()=>{
 const profile={model:'mimo-v2.5-asr',baseUrl:'https://api.xiaomimimo.com/v1'};
 const wav=Buffer.alloc(48);wav.write('RIFF');wav.write('WAVE',8);
 const fake=async(url,opts)=>{assert.equal(url,'https://api.xiaomimimo.com/v1/chat/completions');assert.equal(opts.headers['api-key'],'test-key');assert.equal(opts.headers.Authorization,undefined);const b=JSON.parse(opts.body);assert.equal(b.messages[0].content[0].input_audio.data,'data:audio/wav;base64,'+wav.toString('base64'));assert.equal(opts.redirect,'error');return new Response(JSON.stringify({choices:[{message:{content:' 测试转录 '}}]}))};
 assert.deepEqual(await requestProvider(profile,'test-key','asr',wav,undefined,fake),{text:'测试转录'});
 for(const audio of [wav,Buffer.from([0,1,2,3])]){
  const out=await requestProvider({...profile,model:'mimo-v2.5-tts',voice:'alloy'},'test-key','tts','朗读测试',undefined,async(_,opts)=>{const b=JSON.parse(opts.body);assert.equal(b.messages[1].content,'朗读测试');assert.equal(b.audio.voice,'mimo_default');return new Response(JSON.stringify({choices:[{message:{audio:{data:audio.toString('base64')}}}]}))});
  assert.equal(out.mime,'audio/wav');const data=Buffer.from(out.audio,'base64');assert.equal(data.toString('ascii',0,4),'RIFF');assert.equal(data.length,audio===wav?48:48);
 }
 await assert.rejects(requestProvider({...profile,model:'mimo-v2.5-tts'},'','tts','x',undefined,async()=>new Response(JSON.stringify({choices:[{message:{audio:{data:'bad!'}}}]}))),/有效音频/)
});

test('reply age tracks assistant text only; tools, completion and reads cannot renew the minute',()=>{
 let time=1000;const f=new ResponseFeed(()=>time),s={id:'a'}
 f.event(s,{type:'turn/start',data:{turn:1}});assert.equal(f.read('a').textAt,undefined)
 f.event(s,{type:'assistant/chunk',data:{step:1,chunk:{type:'text-delta',text:'收到'}}});assert.equal(f.read('a').textAt,1000)
 time=9000;f.event(s,{type:'assistant/chunk',data:{step:1,chunk:{type:'reasoning-delta',text:'private'}}});assert.equal(f.read('a').textAt,1000)
 f.event(s,{type:'turn/end',data:{reason:{kind:'completed'}}});assert.equal(f.read('a').textAt,1000)
 time=62000;assert.ok(time-f.read('a').textAt>=60000)
 f.event(s,{type:'assistant/chunk',data:{step:2,chunk:{type:'text-delta',text:'继续'}}});assert.equal(f.read('a').textAt,62000)
})

test('desktop reply stream ignores analysis channels and tool argument chunks',()=>{
 const f=new ResponseFeed(()=>1000),session={id:'desktop'}
 f.event(session,{type:'turn/start',data:{turn:1}})
 for(const chunk of [{type:'reasoning-delta',text:'private reasoning'},{type:'tool-call-delta',arguments:'private arguments'},{type:'text-delta',text:'private analysis',channel:'analysis'}])
  f.event(session,{type:'assistant/chunk',data:{step:1,chunk}})
 assert.equal(f.read('desktop').text,'');assert.equal(f.read('desktop').phase,'working');assert.equal(f.read('desktop').textAt,undefined)
 f.event(session,{type:'assistant/chunk',data:{step:2,channel:'commentary',chunk:{type:'text-delta',text:'intermediate work'}}})
 assert.equal(f.read('desktop').text,'')
 f.event(session,{type:'assistant/chunk',data:{step:3,chunk:{type:'text-delta',text:'最新正文',channel:'final'}}})
 assert.equal(f.read('desktop').text,'最新正文')
 f.event(session,{type:'turn/end',data:{reason:{kind:'completed'}}})
 assert.equal(f.read('desktop').phase,'done')
})

test('say tool and Codex skill obey enablement, session binding and explicit delivery',async()=>{
 const home=mkdtempSync(join(tmpdir(),'speech-say-')),old=process.env.HOME;process.env.HOME=home
 const {mkdirSync,writeFileSync,existsSync,readFileSync}=await import('node:fs')
 const ctx=new Context(),routes=new Set(),watchers=new Set(),tools=new Map(),sections=new Map()
 let c=plugin.Config({ttsEnabled:true,ttsProvider:'tts',services:[{id:'tts',model:'fixture',baseUrl:'https://example.test'}]})
 ctx.provide('settings',{register(){return {get:()=>c,watch(f){watchers.add(f);return()=>watchers.delete(f)}}}})
 ctx.provide('webServer',{register(r){routes.add(r);return()=>routes.delete(r)}})
 ctx.provide('tools',{register(t){tools.set(t.name,t);return()=>tools.delete(t.name)}})
 ctx.provide('systemPrompt',{section(s){sections.set(s.name,s);return()=>sections.delete(s.name)}})
 const handle=ctx.plugin(plugin);await handle;await new Promise(r=>setTimeout(r,0))
 const server=await listen((req,res)=>[...routes][0].handler(req,res))
 const skill=join(home,'.dsh/codex-android/home/skills/say/SKILL.md')
 try{
  assert.ok(tools.has('say'));assert.match(sections.get('speech:say').text(),/say/);assert.ok(existsSync(skill))
  const config=await fetch(server.url).then(r=>r.json())
  const post=async b=>{const r=await fetch(server.url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({csrf:config.csrf,revision:config.revision,...b})});return {code:r.status,body:await r.json()}}
  assert.equal((await post({action:'feed',sessionId:'A',sayReady:true})).body.say,null)
  ctx.emit('session/event',{id:'A'},{type:'turn/start',data:{turn:1}})
  const agent={session:{id:'A'}}
  ctx.emit('agent/assistant-stream',{agent,frame:{type:'start',attemptId:'live',revision:1,turn:1,step:0}})
  ctx.emit('agent/assistant-stream',{agent,frame:{type:'chunk',attemptId:'live',revision:2,index:0,chunk:{type:'text-delta',text:'streaming now'}}})
  const streamed=(await post({action:'feed',sessionId:'A',sayReady:true})).body
  assert.equal(streamed.text,'streaming now');assert.equal(streamed.phase,'working');assert.equal(streamed.say,null)
  // A normal assistant reply never creates speech.
  ctx.emit('session/event',{id:'A'},{type:'assistant/message',data:{message:{id:'normal',content:[{type:'text',text:'a long normal reply'}]}}})
  assert.equal((await post({action:'feed',sessionId:'A',sayReady:true})).body.say,null)
  assert.equal((await tools.get('say').execute({phase:'status'},{agent:{session:{id:'A'}}})).available,true)
  assert.equal((await tools.get('say').execute({phase:'status'},{agent:{session:{id:'B'}}})).available,false)
  const ack=await tools.get('say').execute({text:'收到，先检查',phase:'ack'},{agent:{session:{id:'A'}}});assert.equal(ack.status,'queued')
  const spoken=await tools.get('say').execute({text:'完成了',phase:'result'}, {agent:{session:{id:'A'}}})
  assert.equal(spoken.status,'queued')
  await assert.rejects(tools.get('say').execute({text:'不应串台'}, {agent:{session:{id:'B'}}}))
  assert.equal((await post({action:'feed',sessionId:'A'})).body.say,undefined)
  assert.equal((await post({action:'feed',sessionId:'A',sayReady:true})).body.say.text,'收到，先检查')
  assert.equal((await post({action:'feed',sessionId:'A',sayReady:true})).body.say.text,'完成了')
  assert.equal((await post({action:'feed',sessionId:'A',sayReady:true})).body.say,null)
  const links=join(home,'.dsh/codex-android/session-links.json');mkdirSync(join(home,'.dsh/codex-android'),{recursive:true});writeFileSync(links,JSON.stringify({sessions:{B:{threadId:'current-thread'}}}))
  assert.equal((await post({action:'say',threadId:'unknown',text:'拒绝'})).code,400)
  assert.equal((await post({action:'say',threadId:'current-thread',text:'拒绝其他泳道'})).code,400)
  await post({action:'feed',sessionId:'B',sayReady:true})
  assert.equal((await post({action:'say',threadId:'current-thread',phase:'status'})).body.available,true)
  assert.equal((await post({action:'say',threadId:'current-thread',text:'这是一条简短确认',phase:'ack'})).body.status,'queued')
  assert.equal((await post({action:'say',threadId:'current-thread',text:'任务未完成，需要检查',phase:'result'})).body.status,'queued')
  assert.equal((await post({action:'feed',sessionId:'B',sayReady:true})).body.say.text,'这是一条简短确认')
  assert.equal((await post({action:'feed',sessionId:'B',sayReady:true})).body.say.text,'任务未完成，需要检查')
  await post({action:'feed',sessionId:'B',sayReady:true,companionActive:false})
  assert.equal((await post({action:'say',threadId:'current-thread',phase:'status'})).body.available,false)
  c={...c,ttsEnabled:false};for(const f of watchers)f(c)
  assert.equal(tools.has('say'),false);assert.equal(sections.get('speech:say').text(),'');assert.equal(existsSync(skill),false)
  assert.equal((await post({action:'say',threadId:'current-thread',text:'已禁用'})).code,400)
  c={...c,ttsEnabled:true};for(const f of watchers)f(c)
  assert.ok(tools.has('say'));assert.ok(existsSync(skill))
  writeFileSync(skill,'User-owned edited skill')
  await handle.dispose();assert.equal(tools.size,0);assert.equal(sections.size,0)
  assert.equal(readFileSync(skill,'utf8'),'User-owned edited skill')
 }finally{await handle.dispose();await server.close();process.env.HOME=old;rmSync(home,{recursive:true,force:true})}
})

 test('DSH live stream frames deliver text before settlement and isolate attempts',()=>{
 const f=new ResponseFeed(()=>1234),a={session:{id:'A'}},b={session:{id:'B'}}
 f.event(a.session,{type:'turn/start',data:{turn:2}})
 const emit=(agent,frame)=>f.stream({agent,frame})
 const start={type:'start',attemptId:'one',revision:1,turn:2,step:0}
 emit(a,start)
 const chunk=(index,text,type='text-delta')=>({type:'chunk',attemptId:'one',revision:index+2,index,chunk:{type,text}})
 emit(a,chunk(0,'secret','reasoning-delta'));emit(a,chunk(1,'tool','tool-call-delta'))
 emit(a,chunk(2,'Hello'));emit(a,chunk(2,'duplicate'));emit(b,chunk(3,'wrong session'))
 assert.equal(f.read('A').text,'Hello');assert.equal(f.read('A').phase,'working');assert.equal(f.read('A').textAt,1234)
 emit(a,chunk(3,' world'));assert.equal(f.read('A').text,'Hello world')
 emit(a,{...start,attemptId:'two',revision:10});emit(a,chunk(4,'stale'))
 emit(a,{...chunk(0,'retry'),attemptId:'two',revision:11});assert.equal(f.read('A').text,'retry')
 f.event(a.session,{type:'assistant/message',seq:5,data:{turn:2,step:0,message:{id:'m',content:[{type:'text',text:'retry complete'}]}}})
 emit(a,{type:'end',attemptId:'two',revision:12});assert.equal(f.read('A').text,'retry complete')
 f.event(a.session,{type:'turn/end',data:{reason:{kind:'completed'}}});emit(a,chunk(9,'late'));assert.equal(f.read('A').text,'retry complete')
 f.clear();emit(a,start);emit(a,chunk(0,'disabled'));assert.equal(f.read('A').text,'')
 })

test('voice correlation follows committed user rpcId and resets at the next turn',()=>{
 const f=new ResponseFeed(),s={id:'a'}
 f.event(s,{type:'turn/start',data:{turn:1}})
 f.event(s,{type:'user/message',data:{source:{kind:'user',rpcId:'voice-1'}}})
 f.event(s,{type:'user/message',data:{source:{kind:'system',rpcId:'not-user'}}})
 assert.deepEqual(f.read('a').requestIds,['voice-1'])
 f.event(s,{type:'assistant/chunk',data:{step:0,chunk:{type:'text-delta',text:'hi'}}})
 f.event(s,{type:'turn/end',data:{reason:{kind:'completed'}}})
 assert.deepEqual(f.read('a').requestIds,['voice-1'])
 f.event(s,{type:'turn/start',data:{turn:2}})
 assert.deepEqual(f.read('a').requestIds,[])
 assert.equal(f.read('a').text,'')
 assert.equal(f.read('b').requestIds,undefined)
})
