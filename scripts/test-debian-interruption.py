#!/usr/bin/env python3
"""Crash an idle Agent host with a guest server running; verify no orphan/replay."""
import json
import time
import urllib.request
from lib.dsh_device import Device, ROOT, PKG

d = Device('emulator-5580')
d.emulator_only()
source = sorted((ROOT/'artifacts').glob('debian-crash-server-*.json'), key=lambda p:p.stat().st_mtime)[-1]
source_report = json.loads(source.read_text())
result = json.loads(source_report['results'][0]['message']['content'][0]['content'][0]['text'])
task_id = result['taskId']
record_path = f'files/home/.dsh/debian/jobs/{task_id}.state.json'
d.authenticate()
assert not any(s['running'] for s in d.rpc('session/list', {'_request':{}})['items'])
before = d.engine_pids()
assert len(before) == 1
port = int(d.command('forward','tcp:0','tcp:9088').stdout)
report = {'scenario':'host-crash-stops-guest', 'engine_before':before, 'task_id':task_id}
try:
    with urllib.request.urlopen(f'http://127.0.0.1:{port}/debian-node.json',timeout=3) as r:
        assert r.status == 200
    started = time.monotonic()
    d.command('shell','run-as',PKG,'kill','-9',str(before[0]))
    for _ in range(60):
        state = json.loads(d.read(record_path))
        if state['status'] == 'interrupted': break
        time.sleep(0.25)
    assert state['status'] == 'interrupted', state
    try:
        urllib.request.urlopen(f'http://127.0.0.1:{port}/',timeout=2)
        raise AssertionError('Orphan guest server still responds')
    except OSError: pass
    report.update(task_state=state, guest_stopped_seconds=round(time.monotonic()-started,2))
    d.opener = None
    d.authenticate(timeout=90)
    report['engine_after'] = d.engine_pids()
    assert report['engine_after'] != before and report['engine_after']
    assert json.loads(d.read(record_path))['status'] == 'interrupted'
    try:
        urllib.request.urlopen(f'http://127.0.0.1:{port}/',timeout=2)
        raise AssertionError('Guest was silently replayed')
    except OSError: pass
    report.update(recovery_seconds=round(time.monotonic()-started,2), no_replay=True, passed=True)
finally:
    d.command('forward','--remove',f'tcp:{port}',check=False)
    d.close()
    (ROOT/'artifacts/debian-interruption.json').write_text(json.dumps(report,indent=2))
    print(json.dumps(report,indent=2))
