#!/usr/bin/env python3
"""Actual Agent writes a selected shared directory; independent adb UID verifies files."""
import argparse,json,time,uuid,shlex
from lib.dsh_device import Device,ROOT,PKG
p=argparse.ArgumentParser();p.add_argument('serial');p.add_argument('--root',required=True);p.add_argument('--expect-denied',action='store_true');a=p.parse_args()
d=Device(a.serial);run='storage-'+uuid.uuid4().hex[:8];report={'serial':a.serial,'root':a.root,'run_id':run}
try:
 d.authenticate()
 if any(x['running'] for x in d.rpc('session/list',{'_request':{}})['items']):raise RuntimeError('An Agent is active')
 sid=d.rpc('session/create',{'request':{'cwd':a.root,'agentPreset':'standard'}})['sessionId'];report['session_id']=sid
 d.rpc('session/rename',{'request':{'sessionId':sid,'title':'共享存储验收 '+run}})
 d.rpc('session/selectModel',{'request':{'sessionId':sid,'provider':'local-qwen','model':'qwen38-flash-next'}})
 filename=run+'-中文.json'
 prompt=f'你正在用户选择的共享/外置项目目录中。严格只调用标准 write、read、edit 工具，不用 Bash/Python，不更换工作区或路径，不绕过任何错误。用 write 创建 {filename}，内容为 {{"sum":42,"managed":true,"message":"用户可管理的项目文件"}}；read 确认后 edit 将42改为43，再 read 确认。成功后只回复 STORAGE_AGENT_OK。若有错误，报告原始错误并停止。'
 d.rpc('session/prompt',{'request':{'sessionId':sid,'requestId':run,'mode':'queue','content':[{'type':'text','text':prompt}]}})
 deadline=time.monotonic()+180
 while time.monotonic()<deadline:
  time.sleep(2)
  row=next(x for x in d.rpc('session/list',{'_request':{}})['items'] if x['sessionId']==sid)
  if row['running']:continue
  events=[x.get('event',{}) for x in d.session_records(sid)]
  if any(x.get('type')=='turn/end' for x in events):break
 else:raise RuntimeError('Agent timeout')
 texts=[b.get('text','') for x in events if x.get('type')=='assistant/message' for b in x['data']['message']['content'] if b.get('type')=='text']
 calls=[x['data'] for x in events if x.get('type')=='tool/call']
 # Save only tool names and final text; do not copy hidden reasoning or whole session history.
 report['tool_calls']=[{k:v for k,v in c.items() if k in ['name','toolName','tool']} for c in calls]
 report['final_text']=texts[-1] if texts else ''
 path=a.root+'/'+filename
 if a.expect_denied:
  assert 'STORAGE_AGENT_OK' not in report['final_text']
  assert any(x in report['final_text'] for x in ['EACCES','EPERM','ENOENT','permission','Permission','权限','不存在']), report['final_text']
  assert not d.shell('ls',shlex.quote(path),check=False), 'Unexpected output created while denied'
  report.update(passed=True,denied_as_expected=True,output_absent=True)
  print(json.dumps(report,ensure_ascii=False,indent=2));raise SystemExit(0)
 result=d.command('exec-out','cat',path,check=False)
 if result.returncode or not result.stdout.strip():raise RuntimeError('No readable output visible outside the app sandbox')
 value=json.loads(result.stdout);assert value=={'sum':43,'managed':True,'message':'用户可管理的项目文件'},value
 assert 'STORAGE_AGENT_OK' in report['final_text']
 assert [c.get('name') for c in calls]==['write','read','edit','read'], 'Unexpected tool sequence'
 report.update(passed=True,output_path=path,output=value,independent_reader='adb shell UID, without run-as')
except Exception as e:
 if a.expect_denied and 'RPC session/create:' in str(e) and any(c in str(e) for c in ['EACCES','ENOENT','EPERM']):
  report.update(passed=True,denied_as_expected=True,phase='session-create',error=str(e))
 else:report.update(passed=False,error=str(e))
finally:
 d.close();dest=ROOT/'artifacts'/f'{run}.json';dest.write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False,indent=2),flush=True)
if not report.get('passed'):raise SystemExit(1)
