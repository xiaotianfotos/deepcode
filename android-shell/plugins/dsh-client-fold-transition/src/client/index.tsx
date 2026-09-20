import {useSyncExternalStore} from 'react'
interface Native {foldConfigure(value:boolean):void;foldReady(id:number):void;foldStatus():string;openFoldSettings?():void;foldSetup?():void}
interface Context {effect(fn:()=>()=>void,label:string):void; slots:{inject(name:string,fn:()=>()=>void):void;register(options:object,component:unknown):()=>void}}
const KEY='dsh.fold.transition.enabled'
const native=()=> (window as unknown as {androidBridge?:Native}).androidBridge
export const inject=['slots']
export function apply(ctx:Context) {
  let enabled=localStorage.getItem(KEY)!=='false'
  const listeners=new Set<()=>void>(), reduce=matchMedia('(prefers-reduced-motion: reduce)')
  const refresh=()=>native()?.foldConfigure?.(enabled&&!reduce.matches)
  const store={subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn)}},snapshot:()=>enabled}
  ctx.effect(()=>{
    let first=0,second=0
    const ready=(event:Event)=>{
      const id=(event as CustomEvent).detail?.generation
      if(!Number.isInteger(id))return
      cancelAnimationFrame(first);cancelAnimationFrame(second)
      first=requestAnimationFrame(()=>{second=requestAnimationFrame(()=>native()?.foldReady?.(id))})
    }
    refresh();reduce.addEventListener('change',refresh);window.addEventListener('dsh-fold-transition',ready)
    return()=>{cancelAnimationFrame(first);cancelAnimationFrame(second);reduce.removeEventListener('change',refresh);window.removeEventListener('dsh-fold-transition',ready);native()?.foldConfigure?.(false)}
  },'fold transition lifecycle')
  function Settings(){const value=useSyncExternalStore(store.subscribe,store.snapshot);return <section style={{padding:20}} data-plugin="fold-transition-settings"><h2>折叠过渡</h2><label><input type="checkbox" checked={value} onChange={e=>{enabled=e.target.checked;localStorage.setItem(KEY,String(enabled));refresh();listeners.forEach(fn=>fn())}}/> 内外屏切换时使用模糊过渡</label><p>折叠时画面从左侧模糊逐渐过渡到右侧清晰，范围随折叠角度变化；切屏后恢复清晰，保留会话和输入内容。关闭动画不影响自适应布局。</p><p>外屏直接续接需在系统“合盖显示设置”中选择“保持亮屏”。此选项会影响整台手机的合盖行为。</p>{native()?.foldSetup&&<button onClick={()=>native()?.foldSetup?.()}>配置双屏授权</button>}{native()?.openFoldSettings&&<button onClick={()=>native()?.openFoldSettings?.()}>系统合盖设置</button>}{reduce.matches&&<p>系统已启用减少动态效果，动画暂不播放。</p>}</section>}
  ctx.slots.inject('settings.section',()=>ctx.slots.register({name:'settings.section',id:'fold-transition',label:()=> '折叠过渡',order:87},Settings))
}
