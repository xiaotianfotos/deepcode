#!/usr/bin/env python3
"""Read-only install preflight for an explicitly selected device."""
import argparse
import hashlib
import json
from lib.dsh_device import Device, ROOT, PKG

parser=argparse.ArgumentParser()
parser.add_argument('serial')
parser.add_argument('--manifest',default=str(ROOT/'releases/fs-adapter-preview-20260908/manifest.json'))
args=parser.parse_args()
manifest=json.loads(open(args.manifest).read())
device=Device(args.serial)
props={key:device.shell('getprop',key) for key in ['ro.product.model','ro.product.cpu.abilist','ro.build.version.sdk','ro.build.version.release','ro.mi.os.version.name','ro.kernel.qemu']}
abis=props['ro.product.cpu.abilist'].split(',')
selected=next((f for abi in abis for f in manifest['files'] if f['android_abi']==abi),None)
sdk=int(props['ro.build.version.sdk'])
compatible=selected is not None and sdk>=manifest['min_sdk']
report={'serial':args.serial,'device':props,'page_size':device.shell('getconf','PAGE_SIZE'),
        'compatible_abi_and_sdk':compatible,'selected_apk':selected['filename'] if selected else None,
        'expected_version':manifest['version_name'],'physical_device':props['ro.kernel.qemu']!='1',
        'hyperos_and_page_size_verified':False}
if selected:
    apk=ROOT/'artifacts'/selected['filename']
    if apk.exists():
        with apk.open('rb') as f: digest=hashlib.file_digest(f,'sha256').hexdigest()
        report['local_apk_verified']=digest==selected['sha256'] and apk.stat().st_size==selected['bytes']
    else: report['local_apk_verified']=False
package=device.shell('dumpsys','package',PKG,check=False)
report['installed_version']=[x.strip() for x in package.splitlines() if 'versionName=' in x or 'versionCode=' in x]
report['snapshot_transaction_active']=device.exists('files/.snapshot-transaction')
report['snapshot_fingerprint']=device.read('files/.snapshot-fingerprint').decode().strip() if device.exists('files/.snapshot-fingerprint') else None
report['ready_for_install']=compatible and report.get('local_apk_verified',False) and not report['snapshot_transaction_active']
report['limits']='ABI/SDK compatibility is not physical-device acceptance; 16 KB pages and HyperOS need actual tests.'
safe=''.join(c if c.isalnum() or c in '._-' else '_' for c in args.serial)
(ROOT/'artifacts').mkdir(exist_ok=True)
(ROOT/'artifacts'/f'preflight-{safe}.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps(report,ensure_ascii=False,indent=2))
raise SystemExit(0 if report['ready_for_install'] else 1)
