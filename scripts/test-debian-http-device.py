#!/usr/bin/env python3
"""Non-destructive real-device HTTP background and explicit cancellation test."""
import argparse,json,time,urllib.request,subprocess,sys
from pathlib import Path
from lib.dsh_device import Device,ROOT,PKG
p=argparse.ArgumentParser();p.add_argument('serial');p.add_argument('--receipt',required=True);p.add_argument('--url',required=True);a=p.parse_args()
r=json.loads(Path(a.receipt).read_text());assert r['passed'] and r['serial']==a.serial
v=json.loads(r['results'][0]['message']['content'][0]['content'][0]['text']);task=v['taskId'];d=Device(a.serial)
statefile='files/home/.dsh/debian/jobs/'+task+'.state.json'
uid=d.shell('run-as',PKG,'id','-u')
cgroup='/sys/fs/cgroup/apps/uid_'+uid
def freeze_state():
 return {'freeze':d.shell('cat',cgroup+'/cgroup.freeze',check=False), 'events':d.shell('cat',cgroup+'/cgroup.events',check=False)}
report={'serial':a.serial,'scenario':'guest-http-home-background-and-cancel','url':a.url,'task_id':task,'engine_before':d.engine_pids(),'samples':[],'passed':False}
try:
 d.authenticate();assert not any(s['running'] for s in d.rpc('session/list',{'_request':{}})['items'])
 with urllib.request.urlopen(a.url+'/debian-node.json',timeout=5) as response:assert json.load(response)['result']==42
 d.shell('input','keyevent','3');time.sleep(1)
 resumed=[line.strip() for line in d.shell('dumpsys','activity','activities').splitlines() if 'ResumedActivity' in line]
 assert resumed and all(PKG not in line for line in resumed),resumed
 report['home_background_confirmed']=True
 start=time.monotonic()
 for i in range(13):
  with urllib.request.urlopen(a.url+'/debian-node.json',timeout=5) as response:
   content=json.load(response);assert response.status==200 and content['platform']=='linux' and content['arch']=='arm64' and content['result']==42
  report['samples'].append({'elapsed':round(time.monotonic()-start,2),'http':200,'cgroup':freeze_state()})
  if i<12:time.sleep(5)
 report['engine_after_background']=d.engine_pids();assert report['engine_before']==report['engine_after_background']
 assert json.loads(d.read(statefile))['status']=='running'
 d.shell('am','start','-n',PKG+'/.MainActivity')
 prompt=ROOT/'artifacts'/('cancel-'+task+'.txt')
 prompt.write_text('请只用 debian_tasks(cancelTaskId="'+task+'") 取消刚才的 HTTP 服务任务。发出取消后，最终严格只回复 DEBIAN_TEST_OK，不补充解释。')
 result=subprocess.run([sys.executable,str(ROOT/'scripts/test-debian-agent.py'),a.serial,'--root',r['root'],'--session',r['session_id'],'--prompt-file',str(prompt),'--label','pad9-debian-cancel'],capture_output=True,text=True,timeout=180)
 cancel=json.loads(result.stdout)
 assert 'debian_tasks' in cancel.get('tools',[]) and set(cancel['tools']) <= {'debian_tasks','job_output'},cancel
 report.update(cancel_reply_format_passed=cancel.get('passed',False),cancel_tools=cancel['tools'])
 # The model's wording is diagnostic; the actual task state and closed port
 # below determine whether cancellation worked.
 for _ in range(60):
  state=json.loads(d.read(statefile))
  if state['status']=='cancelled':break
  time.sleep(.25)
 assert state['status']=='cancelled',state
 try:
  urllib.request.urlopen(a.url+'/',timeout=3)
  raise AssertionError('Server still responds after cancellation')
 except OSError:pass
 report.update(cancel_run=cancel['run_id'],task_state=state,port_closed=True,passed=True)
except Exception as error:
 report.update(error=str(error),failure_cgroup=freeze_state())
 raise
finally:
 d.shell('am','start','-n',PKG+'/.MainActivity');d.close()
 safe=a.serial.replace(':','_')
 (ROOT/'artifacts'/f'debian-http-{safe}.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False,indent=2))
