// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { attachChatSwipe } from '../../plugins/dsh-client-ui-voice-deck/src/client/chat-swipe.ts'
afterEach(()=>{document.body.innerHTML='';window.getSelection()?.removeAllRanges();vi.unstubAllGlobals()})
it('yields horizontal touch gestures to selection, including a longpress after touchstart',()=>{
 vi.stubGlobal('cancelAnimationFrame',vi.fn())
 document.body.innerHTML='<div id="grid"><section><div class="dsh-deck-chat"><p>Some message text to select</p></div></section></div>'
 const grid=document.getElementById('grid')!,p=grid.querySelector('p')!,swipe=attachChatSwipe(grid)
 const touch=(name:string,x:number)=>{const e=new Event(name,{bubbles:true,cancelable:true});Object.defineProperty(e,'touches',{value:[{clientX:x,clientY:20}]});p.dispatchEvent(e);return e}
 const select=()=>{const r=document.createRange();r.selectNodeContents(p);getSelection()!.addRange(r)}
 try{
  touch('touchstart',100);expect(swipe.busy()).toBe(true)
  select();document.dispatchEvent(new Event('selectionchange'));expect(swipe.busy()).toBe(false)
  expect(touch('touchmove',40).defaultPrevented).toBe(false);expect(grid.scrollLeft).toBe(0)
  touch('touchstart',100);expect(swipe.busy()).toBe(false)
  expect(touch('touchmove',40).defaultPrevented).toBe(false)
  getSelection()!.removeAllRanges();touch('touchstart',100)
  expect(touch('touchmove',40).defaultPrevented).toBe(true);expect(grid.scrollLeft).toBe(60)
 }finally{swipe.dispose()}
})
