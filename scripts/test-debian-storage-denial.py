#!/usr/bin/env python3
"""Exercise denied/missing project admission, restoring emulator state in finally."""
import json
import subprocess
import sys
import uuid
from lib.dsh_device import Device, ROOT, PKG

d = Device('emulator-5580')
d.emulator_only()
d.authenticate()
report = {'scenario':'debian-project-admission', 'checks':[]}
def restart():
    d.shell('am','force-stop',PKG)
    for pid in d.engine_pids():
        d.command('shell','run-as',PKG,'kill','-TERM',str(pid),check=False)
    import time
    for _ in range(40):
        if not d.engine_pids(): break
        time.sleep(0.1)
    assert not d.engine_pids(), 'Previous engine survived permission transition'
    d.shell('am','start','-n',PKG+'/.MainActivity')
    d.opener=None
    d.authenticate(timeout=120)
def refused(root):
    filename='debian-denied-'+uuid.uuid4().hex[:8]+'.txt'
    try:
        sid=d.rpc('session/create', {'request':{'cwd':root,'agentPreset':'standard'}})['sessionId']
    except RuntimeError as e:
        assert any(code in str(e) for code in ['EACCES','EPERM','ENOENT']), str(e)
        report['checks'].append({'root':root,'refused':True,'error':str(e)})
        return
    prompt=ROOT/'artifacts'/('permission-'+uuid.uuid4().hex+'.txt')
    prompt.write_text('这是存储权限拒绝验收。请尝试且只尝试调用 debian_exec，执行 printf denied > /workspace/'+filename+'。预期因 EACCES/Permission denied/ENOENT 等存储错误失败，不要绕过、提权或重试，也不要改用其他工具。仅在确实收到预期的权限或目录不存在错误时只回复 DEBIAN_TEST_OK；如果命令成功或其他错误，报告实际结果。')
    result=subprocess.run([sys.executable,str(ROOT/'scripts/test-debian-agent.py'),d.serial,
        '--root',root,'--session',sid,'--prompt-file',str(prompt),'--timeout','120','--label','debian-storage-denied'],capture_output=True,text=True,timeout=150)
    receipt=json.loads(result.stdout)
    assert result.returncode==0 and receipt['passed'] and receipt['tools']==['debian_exec'], receipt
    assert d.command('shell','test','-e',root+'/'+filename,check=False).returncode!=0
    report['checks'].append({'root':root,'admitted':True,'tool_refused':True,'output_absent':True,'agent_run':receipt['run_id']})
try:
    assert not any(s['running'] for s in d.rpc('session/list', {'_request':{}})['items'])
    d.shell('appops','set','--uid',PKG,'MANAGE_EXTERNAL_STORAGE','ignore')
    d.shell('appops','set',PKG,'MANAGE_EXTERNAL_STORAGE','ignore')
    report['denied_appop'] = d.shell('appops','get','--uid',PKG,'MANAGE_EXTERNAL_STORAGE')
    assert 'ignore' in report['denied_appop']
    try:
        restart()
        refused('/storage/emulated/0/Documents/DSH-storage-test')
    finally:
        d.shell('appops','set','--uid',PKG,'MANAGE_EXTERNAL_STORAGE','allow')
        d.shell('appops','set',PKG,'MANAGE_EXTERNAL_STORAGE','allow')
        restart()
    # The dedicated virtual disk was created for this project's storage tests.
    volumes=d.shell('sm','list-volumes','public')
    volume=next(line.split()[0] for line in volumes.splitlines() if '86FB-1E11' in line)
    d.shell('sm','unmount',volume)
    try:
        refused('/storage/86FB-1E11/DSH-storage-test')
    finally:
        d.shell('sm','mount',volume)
    report['passed']=True
finally:
    d.close()
    (ROOT/'artifacts/debian-storage-denial.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    print(json.dumps(report,ensure_ascii=False,indent=2))
