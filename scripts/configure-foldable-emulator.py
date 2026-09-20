#!/usr/bin/env python3
"""Install pinned AOSP dual-display mappings on this project's dedicated AVD."""
import hashlib,subprocess,time
from pathlib import Path
from lib.dsh_device import Device,ROOT,PKG
serial='emulator-5582';d=Device(serial)
try:
 d.emulator_only()
 avd=d.command('emu','avd','name').stdout.decode().splitlines()[0]
 assert avd=='dsh_foldable_api35', 'Refusing a different AVD'
 assert not d.exists('files/.snapshot-stage'), 'Initial runtime extraction is active'
 if d.app_pid():
  d.authenticate(timeout=10)
  assert not any(s['running'] for s in d.rpc('session/list',{'_request':{}})['items']), 'An Agent is active'
 d.command('root');d.command('wait-for-device')
 changed=False
 for group,name in [('devicestate','device_state_configuration.xml'),('displayconfig','display_layout_configuration.xml')]:
  local=ROOT/'scripts/fixtures/pixel-fold'/name;remote='/data/system/'+group+'/'+name
  before=d.command('shell','cat',remote,check=False)
  if before.returncode==0 and before.stdout==local.read_bytes():continue
  d.command('shell','mkdir','-p','/data/system/'+group)
  d.command('push',str(local),remote)
  d.command('shell','chown','system:system',remote)
  d.command('shell','chmod','644',remote)
  d.command('shell','restorecon',remote)
  assert d.command('shell','cat',remote).stdout==local.read_bytes()
  changed=True
 if changed:d.command('reboot')
 print('Configuration verified; reboot requested.' if changed else 'Configuration already matches.')
finally:d.close()
