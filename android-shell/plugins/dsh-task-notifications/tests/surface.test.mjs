import test from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import {bindSurface} from '../src/client/surface.mjs'
const flush=()=>new Promise(r=>setImmediate(r))
test('visible lanes, scroll, modal and disposal update ownership without ASR',async()=>{
 const dom=new JSDOM('<html data-dsh-session-id="main"><body><div data-chat-flow></div><div data-deck-lane="a"></div><div data-deck-lane="b"></div><div data-deck-lane="c"></div></body></html>',{pretendToBeVisual:true})
 const win=dom.window,doc=win.document,calls=[]
 const elements=[...doc.querySelectorAll('[data-deck-lane]')]
 const rect=(x,w=300)=>({left:x,right:x+w,top:0,bottom:300,width:w,height:300})
 doc.querySelector('[data-chat-flow]').getBoundingClientRect=()=>rect(0)
 elements.forEach((e,i)=>e.getBoundingClientRect=()=>rect(i*600))
 const off=bindSurface({getSnapshot:()=>({status:'ready'}),subscribe:()=>()=>{}},{notificationSurface:v=>calls.push(JSON.parse(v))},win)
 assert.deepEqual(calls.at(-1),['a','b'])
 elements[2].getBoundingClientRect=()=>rect(win.innerWidth-2);doc.dispatchEvent(new win.Event('scroll'));await flush();assert.deepEqual(calls.at(-1),['a','b'])
 elements[0].getBoundingClientRect=()=>rect(-600);elements[2].getBoundingClientRect=()=>rect(600)
 doc.dispatchEvent(new win.Event('scroll'));await flush();assert.deepEqual(calls.at(-1),['b','c'])
 const modal=doc.createElement('div');modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.getBoundingClientRect=()=>rect(0);doc.body.append(modal)
 await flush();assert.deepEqual(calls.at(-1),[])
 modal.remove();await flush();assert.deepEqual(calls.at(-1),['b','c'])
 off();assert.deepEqual(calls.at(-1),[]);const count=calls.length;doc.documentElement.className='changed';await flush();assert.equal(calls.length,count);win.close()
})
