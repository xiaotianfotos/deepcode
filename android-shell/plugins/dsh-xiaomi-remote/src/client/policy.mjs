export const defaults={enabled:false,device:'',voiceKey:135,voiceAction:'record',backKey:4,backAction:'delete',confirmKey:66,confirmAction:'send'}
const reserved=new Set([3,24,25,26,164,187,19,20,21,22,219,231])
export function validate(value){
 const c={...defaults,...value},keys=new Set()
 for(const slot of ['voice','back','confirm']){
  const action=c[slot+'Action'],key=c[slot+'Key']
  if(!['record','delete','send','none'].includes(action))return '无效的按键动作'
  if(action==='none')continue
  if(!Number.isInteger(key)||key<1||key>304||reserved.has(key))return '请选择普通按键；音量、方向、主页和系统助手键保持系统行为'
  if(keys.has(key))return '三个映射不能使用相同键码'
  keys.add(key)
 }
 return ''
}
export function bindRemote(scope,native,available,onAction,env=globalThis){
 let last='',lastSeq=-1,closed=false
 const refresh=()=>{
  if(closed)return
  const s=scope.getSnapshot()
  if(s.status!=='ready'){native?.remoteLease?.(false);return}
  const c={...defaults,...s.value},config=JSON.stringify(validate(c)?{enabled:false}:c)
  if(config!==last){last=config;native?.remoteConfigure?.(config)}
  native?.remoteLease?.(c.enabled===true&&!validate(c)&&available())
 }
 const onEvent=e=>{const d=e.detail,s=scope.getSnapshot();if(!d||!Number.isInteger(d.seq)||d.seq<=lastSeq)return;lastSeq=d.seq
  if(s.status==='ready'&&s.value?.enabled===true&&!validate(s.value)&&available()&&['record','delete','send'].includes(d.action))onAction(d.action)
 }
 const off=scope.subscribe(refresh);env.addEventListener('dsh-remote-input',onEvent);env.addEventListener('blur',refresh);env.addEventListener('focus',refresh)
 const timer=env.setInterval(refresh,500);refresh()
 return ()=>{closed=true;off();env.clearInterval(timer);env.removeEventListener('dsh-remote-input',onEvent);env.removeEventListener('blur',refresh);env.removeEventListener('focus',refresh);native?.remoteLease?.(false);native?.remoteConfigure?.('{"enabled":false}')}
}
