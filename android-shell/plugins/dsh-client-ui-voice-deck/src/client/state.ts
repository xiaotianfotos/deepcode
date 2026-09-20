export interface DeckState {enabled:boolean;lanes:(string|null)[];active:number;notice:string}
export function adjacent(lanes:readonly (string|null)[], active:number, delta:number):number {
  for(let n=1;n<=lanes.length;n++){const i=(active+delta*n+lanes.length*2)%lanes.length;if(lanes[i])return i}return active
}
export function assign(lanes:readonly (string|null)[], index:number, id:string|null):(string|null)[]{
  if(index<0||index>=4)throw new Error('Invalid lane')
  const next=[...lanes];const existing=id===null?-1:next.indexOf(id)
  if(existing>=0 && existing!==index)next[existing]=next[index]
  next[index]=id;return next
}
