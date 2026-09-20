#!/usr/bin/env python3
"""Verify installed APK, runtime fingerprint and managed client bundles."""
import json,sys
from pathlib import Path
from lib.dsh_device import Device,PKG,ROOT
physical=sys.argv[1];checks=[]
for serial,abi,variant,base in [('emulator-5582','x86_64','deck-ui','.tools/deck-ui-adapter'),(physical,'arm64','voice-debug','.tools/voice-debug-adapter')]:
 d=Device(serial)
 try:
  build=json.loads((ROOT/f'artifacts/build-{abi}-{variant}.json').read_text());overlay=json.loads((ROOT/base/f'overlay-{abi}.json').read_text())
  assert not d.exists('files/.snapshot-transaction') and not d.exists('files/.snapshot-stage')
  assert d.read('files/.snapshot-fingerprint').decode().strip()==build['snapshot_sha256']
  apk=d.shell('pm','path',PKG).splitlines()[0].removeprefix('package:');installed=d.shell('sha256sum',apk).split()[0];assert installed==build['apk_sha256']
  files={}
  for name,expected in overlay['overlay_files'].items():
   if '/lib/client.js' not in name and not name.endswith('dsh-client-fold-transition/package.json'):continue
   actual=d.shell('run-as',PKG,'/system/bin/sha256sum','files/'+name).split()[0];assert actual==expected,name;files[name]=actual
  checks.append({'serial':serial,'abi':abi,'apk':build['apk'],'apk_sha256':installed,'snapshot_sha256':build['snapshot_sha256'],'client_files_verified':files})
 finally:d.close()
(ROOT/'docs/validation/2026-09-10-foldable/release-receipt.json').write_text(json.dumps(checks,indent=2)+'\n')
print(json.dumps([{'abi':x['abi'],'client_files':len(x['client_files_verified']),'installed_apk_verified':True}for x in checks]))
