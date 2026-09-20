import {useSyncExternalStore} from 'react'
import {ButtonRouter, type Button, type Intent} from './router.ts'

interface Native { gamepadLease(epoch:number, enabled:boolean):void; gamepadStatus():string }
interface Context {provide(name:string,value:unknown):void; effect(fn:()=>()=>void,label:string):void; slots:{inject(name:string,fn:()=>()=>void):void; register(options:object,component:unknown):()=>void} }
const KEY='dsh.input.gamepad.enabled'
function native(): Native | undefined { return (window as unknown as {androidBridge?:Native}).androidBridge }
export const inject=['slots']
export function apply(ctx:Context) {
  let enabled=localStorage.getItem(KEY)!=='false', sink:((intent:Intent)=>void)|undefined
  let epoch=1, active=false, frame=0, lastSeq=-1, device:string|undefined
  let snapshot={enabled, connected:false, name:'未连接手柄'}
  const listeners=new Set<()=>void>()
  const publish=()=>listeners.forEach(fn=>fn())
  const router=new ButtonRouter(intent=>{if(active) sink?.(intent)})
  const available=()=>enabled && !!sink && document.visibilityState==='visible' && (!!native()?.gamepadLease || document.hasFocus())
    && ![...document.querySelectorAll('[role="dialog"],dialog[open],[aria-modal="true"]')].some(el=>el.getClientRects().length)
  const refresh=()=>{
    const next=available()
    if(next!==active){router.reset(); epoch++; active=next}
    const bridge=native()
    if(bridge?.gamepadLease) {
      bridge.gamepadLease(epoch,active)
      try {const info=JSON.parse(bridge.gamepadStatus());const first=info.devices?.[0];const name=first?.name??'未连接手柄';
        if(snapshot.connected!==!!first||snapshot.name!==name){snapshot={...snapshot,connected:!!first,name};publish()}
      } catch { }
    }
  }
  const service={
    snapshot:()=>snapshot, subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn)}},
    setEnabled(value:boolean){enabled=value;localStorage.setItem(KEY,String(value));snapshot={...snapshot,enabled:value};refresh();publish()},
    bind(fn:(intent:Intent)=>void){sink=fn;refresh();return()=>{if(sink===fn){sink=undefined;refresh()}}},
    stopRepeat:()=>router.stopRepeat()
  }
  ctx.provide('gamepadInput',service)
  const onButton=(event:Event)=>{
    const d=(event as CustomEvent).detail
    if(!d)return
    if(d.kind==='reset') {router.reset();device=undefined;sink && window.dispatchEvent(new CustomEvent('dsh-gamepad-reset'));return}
    if(d.epoch!==epoch||!Number.isInteger(d.seq)||d.seq<=lastSeq)return
    lastSeq=d.seq
    if(!available()){refresh();return}
    if(device && device!==d.deviceId)return
    device=d.deviceId
    if(['l2','l1','r1','north','west','east'].includes(d.button))router.button(d.button,d.pressed,d.repeat)
  }
  const webPoll=()=>{
    refresh()
    const pad=Array.from(navigator.getGamepads?.()??[]).find(p=>p?.mapping==='standard')
    if(pad && active) for(const [index,button] of [[6,'l2'],[4,'l1'],[5,'r1'],[3,'north'],[2,'west'],[1,'east']] as const)router.button(button,pad.buttons[index]?.pressed??false)
    if(snapshot.connected!==!!pad){snapshot={...snapshot,connected:!!pad,name:pad?.id??'未连接手柄'};publish();if(!pad)router.reset()}
    frame=requestAnimationFrame(webPoll)
  }
  ctx.effect(()=>{
    window.addEventListener('dsh-gamepad-input',onButton)
    window.addEventListener('blur',refresh);window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh)
    const timer=window.setInterval(refresh,750)
    if(!native()?.gamepadLease)frame=requestAnimationFrame(webPoll)
    return()=>{clearInterval(timer);cancelAnimationFrame(frame);sink=undefined;router.reset();native()?.gamepadLease(++epoch,false);window.removeEventListener('dsh-gamepad-input',onButton);window.removeEventListener('blur',refresh);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh)}
  },'gamepad lifecycle')
  function Settings(){const s=useSyncExternalStore(service.subscribe,service.snapshot);return <section style={{padding:20}} data-plugin="gamepad-settings"><h2>手柄输入</h2><label><input type="checkbox" checked={s.enabled} onChange={e=>service.setEnabled(e.target.checked)}/> 启用手柄控制</label><p>{s.name}</p><p>L2 收放会话栏 · L1 / R1 切换会话 · △ 录音 / 结束 · □ 退格（可长按） · ○ 发送草稿</p><p>只控制打开的会话工作台，录音完成后按 ○ 或点击发送按钮发送。</p></section>}
  ctx.slots.inject('settings.section',()=>ctx.slots.register({name:'settings.section',id:'gamepad-input',label:()=> '手柄输入',order:86},Settings))
}
