import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import React from 'react'
import renderer from 'react-test-renderer'
const require=createRequire(import.meta.url)
test('one standard plugin card; ASR/TTS controls write independently and no legacy sidebar entry',async()=>{
 let plugin;const registrations=[],writes=[];const config={status:'ready',writable:true,value:{enabled:true,asrEnabled:true,ttsEnabled:false,asrProvider:'local',ttsProvider:'',services:[]}}
 vm.runInNewContext(readFileSync(new URL('../lib/client.js',import.meta.url),'utf8'),{fetch:async()=>({json:async()=>({keySet:{}})}),window:{__ModuleLoader__:{load({factory}){plugin=factory(require)}}}})
 plugin.apply({effect(){},settingsScope:{bind({namespace}){assert.equal(namespace,'speech-services');return {getSnapshot:()=>config,subscribe:()=>()=>{},set:async(k,v)=>writes.push([k,v])}}},slots:{inject(name,fn){assert.equal(name,'settings.plugin.item');fn()},register(options,component){registrations.push({options,component})}}})
 assert.equal(registrations.length,1);assert.equal(registrations[0].options.key,'speech-services')
 let rendered;await renderer.act(async()=>{rendered=renderer.create(React.createElement(registrations[0].component))})
 const checks=rendered.root.findAllByType('input').filter(x=>x.props.type==='checkbox');assert.equal(checks[1].props.checked,true);assert.equal(checks[2].props.checked,false)
 await renderer.act(async()=>checks[1].props.onChange({target:{checked:false}}));assert.deepEqual(writes,[['asrEnabled',false]])
 await renderer.act(async()=>checks[2].props.onChange({target:{checked:true}}));assert.deepEqual(writes[1],['ttsEnabled',true]);rendered.unmount()
})
