/** Project release velocity before snapping: a short flick can cross a lane,
 * while a slow drag (or a drag followed by a pause) uses distance alone. */
export function releaseTarget(left:number,velocity:number,stride:number,max:number):number {
  if(stride<=0)return Math.max(0,Math.min(max,left+velocity*240))
  let index=Math.round((left+velocity*240)/stride)
  if(velocity>.35)index=Math.max(index,Math.floor((left+1)/stride)+1)
  if(velocity<-.35)index=Math.min(index,Math.ceil((left-1)/stride)-1)
  return Math.max(0,Math.min(max,index*stride))
}

export function releaseVelocity(samples:readonly {time:number;left:number}[],now:number):number {
  const first=samples[0],last=samples.at(-1)
  return !first||!last||now-last.time>120||last.time<=first.time?0:(last.left-first.left)/(last.time-first.time)
}

/** Android can latch horizontal gestures to the inner vertical chat scroller.
 * Route those drags explicitly; keep native vertical scrolling and pinch. */
export function attachChatSwipe(grid:HTMLElement,onSettled:()=>void=()=>{}) {
  type Sample={time:number;left:number}
  let drag:{x:number;y:number;left:number;target:HTMLElement;axis?:'x'|'y';samples:Sample[]}|undefined
  let frame:number|undefined,held:{target:HTMLElement;snap:string}|undefined
  const hold=(target:HTMLElement)=>{
    if(held?.target===target)return
    if(held)held.target.style.scrollSnapType=held.snap
    held={target,snap:target.style.scrollSnapType};target.style.scrollSnapType='none'
  }
  const release=()=>{if(held)held.target.style.scrollSnapType=held.snap;held=undefined}
  const stop=()=>{if(frame!==undefined)cancelAnimationFrame(frame);frame=undefined}
  const selectingMessage=()=>{
    const selection=window.getSelection()
    if(!selection||selection.isCollapsed)return false
    return [selection.anchorNode,selection.focusNode].some(node=>{
      const chat=(node instanceof Element?node:node?.parentElement)?.closest('.dsh-deck-chat')
      return !!chat&&grid.contains(chat)
    })
  }
  const selectionChanged=()=>{
    if(selectingMessage()){stop();drag=undefined;release()}
  }
  const sample=(samples:Sample[],left:number)=>{
    const now=performance.now();samples.push({time:now,left})
    while(samples.length>2&&samples[1].time<now-100)samples.shift()
  }
  const coast=(target:HTMLElement,velocity:number)=>{
    hold(target)
    const lane=grid.firstElementChild as HTMLElement|null
    const stride=target===grid?(lane?.getBoundingClientRect().width??0)+12:0
    const from=target.scrollLeft,to=releaseTarget(from,velocity,stride,target.scrollWidth-target.clientWidth)
    const distance=to-from,start=performance.now(),duration=Math.max(260,Math.min(460,260+Math.abs(distance)*.25))
    const slope=distance===0?0:Math.max(0,Math.min(3,velocity*duration/distance))
    const tick=(now:number)=>{
      const t=Math.min(1,(now-start)/duration)
      // Cubic Hermite keeps release speed continuous and brakes to zero.
      const progress=(-2*t*t*t+3*t*t)+slope*(t*t*t-2*t*t+t)
      target.scrollLeft=from+distance*progress
      if(t<1){frame=requestAnimationFrame(tick);return}
      frame=undefined;target.scrollLeft=to;release();onSettled()
    }
    frame=requestAnimationFrame(tick)
  }
  const finish=(cancelled=false)=>{
    const old=drag;drag=undefined
    if(old?.axis==='x'){
      // Do not append a zero-distance touchend sample: Android delivery
      // latency would erase a valid flick. A real pause still cancels inertia.
      const velocity=cancelled?0:releaseVelocity(old.samples,performance.now())
      coast(old.target,velocity)
    }else if(held)coast(held.target,0)
  }
  const start=(event:TouchEvent)=>{
    stop();drag=undefined
    if(selectingMessage()){release();return}
    if(event.touches.length!==1||!(event.target instanceof Element)){if(held)coast(held.target,0);return}
    const chat=event.target.closest<HTMLElement>('.dsh-deck-chat')
    if(!chat){if(held)coast(held.target,0);return}
    let target=grid
    // Wide code blocks/tables keep their own horizontal gesture and inertia.
    for(let node=event.target as HTMLElement;node&&node!==chat;node=node.parentElement!){
      if(node.scrollWidth>node.clientWidth+2&&/auto|scroll/.test(getComputedStyle(node).overflowX)){target=node;break}
    }
    const t=event.touches[0]
    drag={x:t.clientX,y:t.clientY,left:target.scrollLeft,target,samples:[{time:performance.now(),left:target.scrollLeft}]}
  }
  const move=(event:TouchEvent)=>{
    if(!drag)return
    if(selectingMessage()){selectionChanged();return}
    if(event.touches.length!==1){finish(true);return}
    const t=event.touches[0],dx=t.clientX-drag.x,dy=t.clientY-drag.y
    if(!drag.axis){
      if(Math.max(Math.abs(dx),Math.abs(dy))<12)return
      drag.axis=Math.abs(dx)>Math.abs(dy)*1.2?'x':'y'
      if(drag.axis==='x')hold(drag.target)
    }
    if(drag.axis!=='x')return
    if(event.cancelable)event.preventDefault()
    drag.target.scrollLeft=drag.left-dx;sample(drag.samples,drag.target.scrollLeft)
  }
  const end=()=>finish(),cancel=()=>finish(true)
  grid.addEventListener('touchstart',start,{passive:true})
  grid.addEventListener('touchmove',move,{passive:false})
  grid.addEventListener('touchend',end)
  grid.addEventListener('touchcancel',cancel)
  document.addEventListener('selectionchange',selectionChanged)
  return {
    busy:()=>drag!==undefined||frame!==undefined,
    cancel:()=>{stop();drag=undefined;release()},
    dispose:()=>{stop();drag=undefined;release();grid.removeEventListener('touchstart',start);grid.removeEventListener('touchmove',move);grid.removeEventListener('touchend',end);grid.removeEventListener('touchcancel',cancel);document.removeEventListener('selectionchange',selectionChanged)},
  }
}
