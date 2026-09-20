#!/usr/bin/env python3
"""Verify an Agent-requested rebuild preserves old software and project bytes."""
import json
import subprocess
import sys
from lib.dsh_device import Device, ROOT

d=Device('emulator-5580'); d.emulator_only(); d.authenticate()
report={'scenario':'debian-rebuild','passed':False}
try:
    assert not any(s['running'] for s in d.rpc('session/list', {'_request':{}})['items'])
    current='files/home/.dsh/debian/current'
    before=d.shell('run-as','com.dsharnessmobile.shell','readlink',current)
    project='/storage/emulated/0/Documents/DSH-storage-test'
    checksum=d.shell('sha256sum',project+'/debian-media-test.mp4').split()[0]
    prompt=ROOT/'artifacts/debian-rebuild-prompt.txt'
    prompt.write_text('请只调用 debian_install(reset=true,background=false) 重建测试环境，保留旧版本。然后 debian_exec 执行 test -r /workspace/debian-media-test.mp4 && cat /etc/debian_version。都成功后仅回复 DEBIAN_TEST_OK，不要安装软件或使用其他工具。')
    result=subprocess.run([sys.executable,str(ROOT/'scripts/test-debian-agent.py'),d.serial,'--root',project,'--prompt-file',str(prompt),'--label','debian-rebuild-agent'],capture_output=True,text=True,timeout=660)
    agent=json.loads(result.stdout); assert result.returncode==0 and agent['passed'],agent
    after=d.shell('run-as','com.dsharnessmobile.shell','readlink',current)
    assert before!=after
    assert d.exists('files/home/.dsh/debian/'+before+'/usr/bin/ffmpeg'), 'Previous software was lost'
    assert not d.exists(current+'/usr/bin/ffmpeg'), 'New generation did not start clean'
    assert d.shell('sha256sum',project+'/debian-media-test.mp4').split()[0]==checksum
    report.update(generation_before=before,generation_after=after,old_software_preserved=True,new_environment_clean=True,project_sha256_unchanged=checksum,agent_run=agent['run_id'],passed=True)
finally:
    d.close()
    (ROOT/'artifacts/debian-rebuild.json').write_text(json.dumps(report,indent=2))
    print(json.dumps(report,indent=2))
