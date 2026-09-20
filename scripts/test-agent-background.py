#!/usr/bin/env python3
"""Real Agent task observed through >5 minutes of emulator background + screen off."""
import argparse
import json
import time
import uuid
from lib.dsh_device import Device, ROOT, PKG

parser=argparse.ArgumentParser()
parser.add_argument('serial')
args=parser.parse_args()
d=Device(args.serial)
run_id='background-'+uuid.uuid4().hex[:10]
rel='files/home/.dsh/workspaces/incoming/'+run_id
cwd='/data/data/'+PKG+'/'+rel
screen_changed=False
original_default=None
report={'serial':args.serial,'run_id':run_id,'physical_device_tested':False,'samples':[]}
code='''import json, os, time
from pathlib import Path
start = time.monotonic()
with open("heartbeat.ndjson", "w", encoding="utf-8") as f:
    for i in range(67):
        f.write(json.dumps({"tick": i, "elapsed": round(time.monotonic()-start, 3), "pid": os.getpid()})+"\\n")
        f.flush()
        os.fsync(f.fileno())
        if i < 66:
            time.sleep(5)
Path("done.json").write_text(json.dumps({"ticks":67,"elapsed_seconds":round(time.monotonic()-start,3),"complete":True}), encoding="utf-8")
print("BACKGROUND_AGENT_OK ticks=67")
'''
try:
    d.emulator_only();d.authenticate()
    if any(x.get('running') for x in d.rpc('session/list',{'_request':{}})['items']):
        raise RuntimeError('Another Agent is active; refusing lifecycle interaction')
    original_default=next(n['user'] for n in d.rpc('settings/describe',{})['namespaces'] if n['ns']=='agent-default-model')
    d.shell('run-as',PKG,'mkdir','-p',rel)
    created=d.rpc('session/create',{'request':{'cwd':cwd,'agentPreset':'standard'}})
    sid=created['sessionId'];report['session_id']=sid
    d.rpc('session/selectModel',{'request':{'sessionId':sid,'provider':'local-qwen','model':'qwen38-flash-next'}})
    prompt='这是安卓后台稳定性验收，只操作当前工作区。请用 write 将下面的代码原样保存为 heartbeat.py，再用 Bash 运行 python3 heartbeat.py，并将执行超时设置为至少360000毫秒。如果工具返回运行中的进程，请继续等待直到它完成，单次等待尽量30秒以上。不要缩短sleep或更改循环次数，不要提前结束任务。最后读取 done.json 确认，然后回复 BACKGROUND_AGENT_OK ticks=67。\n```python\n'+code+'```'
    accepted=d.rpc('session/prompt',{'request':{'sessionId':sid,'requestId':run_id,'mode':'queue','content':[{'type':'text','text':prompt}]}})
    assert accepted.get('accepted') is True
    deadline=time.monotonic()+120
    while time.monotonic()<deadline:
        if d.exists(rel+'/heartbeat.ndjson') and d.read(rel+'/heartbeat.ndjson').strip():break
        time.sleep(2)
    else:raise RuntimeError('Agent did not start heartbeat within 120 seconds')
    report['app_pid']=d.app_pid();report['engine_pids']=d.engine_pids()
    screen_changed=True
    d.shell('input','keyevent','3')
    d.shell('input','keyevent','223')
    locked_at=time.monotonic()
    while time.monotonic()-locked_at<390:
        time.sleep(20)
        rows=[json.loads(x) for x in d.read(rel+'/heartbeat.ndjson').decode().splitlines() if x]
        power=d.shell('dumpsys','power')
        row={'seconds':round(time.monotonic()-locked_at,1),'ticks':len(rows),'app_pid':d.app_pid(),
             'engine_pids':d.engine_pids(),'http_status':d.status(),
             'screen_asleep':'mWakefulness=Asleep' in power or 'mWakefulness=Dozing' in power}
        report['samples'].append(row)
        print(json.dumps(row),flush=True)
        if d.exists(rel+'/done.json'):break
    else:raise RuntimeError('Heartbeat did not finish')
    done=json.loads(d.read(rel+'/done.json'))
    rows=[json.loads(x) for x in d.read(rel+'/heartbeat.ndjson').decode().splitlines() if x]
    assert [x['tick'] for x in rows]==list(range(67)),'Missing or reordered ticks'
    assert done['complete'] and done['ticks']==67 and done['elapsed_seconds']>=330
    max_gap=max(b['elapsed']-a['elapsed'] for a,b in zip(rows,rows[1:]))
    assert max_gap<20,'Long execution gap while backgrounded'
    assert all(x['screen_asleep'] and x['http_status']==401 and x['app_pid']==report['app_pid'] and x['engine_pids']==report['engine_pids'] for x in report['samples'])
    assert report['samples'][-1]['seconds']>=300
    # Let the actual Agent read the result and complete its turn.
    deadline=time.monotonic()+90
    while time.monotonic()<deadline:
        own=next(x for x in d.rpc('session/list',{'_request':{}})['items'] if x['sessionId']==sid)
        if not own['running']:break
        time.sleep(2)
    else:raise RuntimeError('Agent did not finish after heartbeat completion')
    events=[r.get('event',{}) for r in d.session_records(sid)]
    texts=[b.get('text','') for e in events if e.get('type')=='assistant/message'
           for b in e['data']['message']['content'] if b.get('type')=='text']
    ends=[e['data']['reason'] for e in events if e.get('type')=='turn/end']
    assert ends[-1]['kind']=='completed' and any('BACKGROUND_AGENT_OK' in t and '67' in t for t in texts)
    report.update(passed=True,done=done,max_heartbeat_gap_seconds=round(max_gap,3),agent_turn_finished=True,
                  final_reply_verified='BACKGROUND_AGENT_OK ticks=67',turn_end_reason=ends[-1])
except Exception as error:
    report.update(passed=False,error=str(error))
finally:
    # Restore screen/app even if a diagnostic assertion fails; never clear data.
    if screen_changed:
        d.shell('input','keyevent','224',check=False)
        d.shell('am','start','-n',PKG+'/.MainActivity',check=False)
    if original_default is not None:
        try:d.rpc('settings/replace',{'ns':'agent-default-model','section':original_default})
        except Exception as error:report.update(passed=False,cleanup_error=str(error))
    d.close()
    (ROOT/'artifacts').mkdir(exist_ok=True)
    (ROOT/'artifacts/agent-background-stability.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    print(json.dumps({k:v for k,v in report.items() if k!='samples'},ensure_ascii=False,indent=2))
if not report.get('passed'):raise SystemExit(1)
