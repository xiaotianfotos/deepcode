#!/usr/bin/env python3
"""Dedicated 2560x1600 emulator: swipe the visible app card, verify engine/guest stop."""
import json,time,urllib.request,re
from lib.dsh_device import Device,ROOT,PKG

d=Device('emulator-5580');d.emulator_only();d.authenticate()
assert d.shell('wm','size')=='Physical size: 2560x1600'
assert not any(s['running'] for s in d.rpc('session/list',{'_request':{}})['items'])
source=sorted((ROOT/'artifacts').glob('debian-swipe-server-*.json'),key=lambda p:p.stat().st_mtime)[-1]
r=json.loads(source.read_text());v=json.loads(r['results'][0]['message']['content'][0]['content'][0]['text'])
statefile='files/home/.dsh/debian/jobs/'+v['taskId']+'.state.json'
port=int(d.command('forward','tcp:0','tcp:9088').stdout)
report={'scenario':'recent-task-swipe-away','engine_before':d.engine_pids(),'task_id':v['taskId'],'passed':False}
try:
 with urllib.request.urlopen(f'http://127.0.0.1:{port}/debian-node.json',timeout=3) as response:assert response.status==200
 d.shell('am','start','-n',PKG+'/.MainActivity');time.sleep(2)
 resumed = next(line for line in d.shell('dumpsys','activity','activities').splitlines() if 'ResumedActivity' in line and PKG in line)
 task_id = re.search(r' t(\d+)\}', resumed).group(1)
 d.shell('input','keyevent','187');time.sleep(2)
 # Centered Harness card visually verified on this dedicated emulator.
 (ROOT/'artifacts/debian-swipe-before.png').write_bytes(d.command('exec-out','screencap','-p').stdout)
 for attempt in range(3):
  d.shell('input','touchscreen','swipe','1280','650','1280','0','100')
  time.sleep(2)
  present=any('#'+task_id+' ' in line and PKG in line for line in d.shell('dumpsys','activity','recents').splitlines() if '* Recent #' in line)
  if not present:break
 assert not present, 'Recent task gesture did not remove the selected card'
 report.update(recent_task_id=task_id,gesture_attempts=attempt+1,recent_task_removed=True)
 started=time.monotonic()
 for _ in range(60):
  if not d.engine_pids():break
  time.sleep(.25)
 assert not d.engine_pids(),'Engine survived removing recent task'
 for _ in range(6):
  try:
   urllib.request.urlopen(f'http://127.0.0.1:{port}/',timeout=2)
   raise AssertionError('Guest survived user close')
  except OSError:pass
  assert not d.engine_pids(),'Engine resurrected after user close'
  time.sleep(2)
 state=json.loads(d.read(statefile));assert state['status'] in ['interrupted','cancelled'],state
 report.update(task_state=state,engine_after=d.engine_pids(),no_restart_seconds=round(time.monotonic()-started,2),passed=True)
finally:
 d.command('forward','--remove',f'tcp:{port}',check=False)
 d.shell('am','start','-n',PKG+'/.MainActivity');d.close()
 (ROOT/'artifacts/debian-swipe-away.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
