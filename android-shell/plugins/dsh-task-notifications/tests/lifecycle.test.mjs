import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,readFileSync,existsSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {apply} from '../src/index.mjs'
test('host owns cache and progress without WebView; disable/dispose preserve tasks',()=>{
 const dir=mkdtempSync(join(tmpdir(),'dsh-notify-')),old=process.env.DSH_HOME;process.env.DSH_HOME=dir
 try{
  let config={enabled:true,progress:true,quietWhenVisible:true},watch,event,dispose
  const ctx={settings:{register:(key)=>{assert.equal(key,'task-notifications');return{get:()=>config,watch:fn=>{watch=fn;return()=>{watch=null}}}}},effect:fn=>{dispose=fn()},on:(key,fn)=>{assert.equal(key,'session/event');event=fn}}
  apply(ctx)
  const read=()=>JSON.parse(readFileSync(join(dir,'.task-notifications.json')))
  assert.equal(read().enabled,true)
  event({id:'first'},{type:'assistant/message'});assert.equal(existsSync(join(dir,'.notify.ndjson')),false)
  event({id:'first'},{type:'turn/start'})
  let lines=()=>readFileSync(join(dir,'.notify.ndjson'),'utf8').trim().split('\n')
  assert.equal(JSON.parse(lines()[0]).sessionId,'first')
  config={...config,enabled:false};watch();event({id:'second'},{type:'turn/start'});assert.equal(lines().length,1);assert.equal(read().enabled,false)
  config={...config,enabled:true,progress:false};watch();event({id:'second'},{type:'turn/start'});assert.equal(lines().length,1)
  config={...config,progress:true};watch();event({id:'second'},{type:'turn/start'});assert.equal(lines().length,2)
  dispose();assert.equal(read().enabled,false);assert.equal(watch,null)
 }finally{if(old===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=old;rmSync(dir,{recursive:true,force:true})}
})
