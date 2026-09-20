#!/usr/bin/env python3
"""Verify an Agent-started guest HTTP service while the emulator is asleep."""
import json
import time
import urllib.request
from lib.dsh_device import Device, ROOT

d = Device('emulator-5580')
d.emulator_only()
port = int(d.command('forward', 'tcp:0', 'tcp:9088').stdout)
report = {'scenario': 'guest-http-screen-off', 'samples': [], 'engine_before': d.engine_pids()}
try:
    d.shell('input', 'keyevent', '223')
    time.sleep(0.5)
    power = d.shell('dumpsys', 'power')
    assert 'mWakefulness=Asleep' in power, 'Emulator did not enter asleep state'
    report['wakefulness'] = 'Asleep'
    started = time.monotonic()
    for i in range(13):
        with urllib.request.urlopen(f'http://127.0.0.1:{port}/debian-node.json', timeout=5) as response:
            data = json.load(response)
            assert response.status == 200 and data['result'] == 42 and data['platform'] == 'linux'
        report['samples'].append({'elapsed': round(time.monotonic()-started, 2), 'http': 200})
        if i < 12: time.sleep(5)
    report.update(engine_after=d.engine_pids(), elapsed=round(time.monotonic()-started, 2))
    assert report['engine_before'] == report['engine_after']
    report['passed'] = True
finally:
    d.shell('input', 'keyevent', '224')
    d.command('forward', '--remove', f'tcp:{port}', check=False)
    (ROOT/'artifacts/debian-server-background.json').write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
