#!/usr/bin/env python3
"""Drive only the dedicated phone app lab session; preserve global model defaults."""
import argparse,json,pathlib,sys,time,uuid
ROOT=pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'scripts/lib'))
from dsh_device import Device
p=argparse.ArgumentParser();p.add_argument('serial');p.add_argument('prompt');p.add_argument('--session');p.add_argument('--label',default='setup');p.add_argument('--timeout',type=int,default=1200);p.add_argument('--device',default='lhasa');p.add_argument('--workspace',default='/storage/emulated/0/work/phone-app-lab');p.add_argument('--output',default='docs/validation/2026-09-11-selfhost-app');p.add_argument('--title',default='手机开发安卓App · 本机闭环验证');a=p.parse_args()
out=ROOT/a.output;out.mkdir(parents=True,exist_ok=True)
d=Device(a.serial)
try:
 assert d.shell('getprop','ro.product.device')==a.device
 d.authenticate(timeout=15)
 if a.session:sid=a.session
 else:
  d.shell('mkdir','-p',a.workspace)
  sid=d.rpc('session/create',{'request':{'cwd':a.workspace,'agentPreset':'standard'}})['sessionId']
  d.rpc('session/rename',{'request':{'sessionId':sid,'title':a.title}})
  d.rpc('commands/execute',{'agentId':sid,'line':'/permission danger-full-access','images':[]})
  ns=next(n for n in d.rpc('settings/describe',{})['namespaces'] if n['ns']=='agent-default-model')
  try:d.rpc('session/selectModel',{'request':{'sessionId':sid,'provider':'relay-codex','model':'gpt-6-astra','reasoningEffort':'low'}})
  finally:
   current=next(n for n in d.rpc('settings/describe',{})['namespaces'] if n['ns']=='agent-default-model')
   d.rpc('settings/replace',{'ns':'agent-default-model','section':ns.get('user',{}),'expectedRevision':current['revision']})
  (out/'session.json').write_text(json.dumps({'sessionId':sid},indent=2))
 old=d.session_records(sid);seq=max((r.get('event',{}).get('seq',-1) for r in old),default=-1)
 d.rpc('session/prompt',{'request':{'sessionId':sid,'requestId':uuid.uuid4().hex,'mode':'queue','content':[{'type':'text','text':pathlib.Path(a.prompt).read_text()}]}})
 print('Phone Codex started:',sid,flush=True);start=time.monotonic()
 while time.monotonic()-start<a.timeout:
  time.sleep(5)
  items=d.rpc('session/list',{'_request':{}})['items'];item=next(i for i in items if i['sessionId']==sid)
  if item.get('running'):continue
  rows=[r['event'] for r in d.session_records(sid) if r.get('event',{}).get('seq',-1)>seq]
  if not any(r.get('type')=='turn/end' for r in rows):continue
  report={'sessionId':sid,'elapsedSeconds':round(time.monotonic()-start,2),'events':[r for r in rows if r.get('type') in ['assistant/message','tool/call','tool/result','turn/end','relay-codex/activity']]}
  (out/(a.label+'.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
  texts=[b.get('text','') for r in rows if r.get('type')=='assistant/message' for b in r['data']['message']['content'] if b.get('type')=='text']
  print(json.dumps({'elapsedSeconds':report['elapsedSeconds'],'final':texts[-1:]},ensure_ascii=False),flush=True);break
 else:raise RuntimeError('Dedicated lab turn still active; inspect before continuing')
finally:d.close()
