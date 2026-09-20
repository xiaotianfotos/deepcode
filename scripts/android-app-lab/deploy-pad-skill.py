#!/usr/bin/env python3
"""Stage the app-development skill and SDK inputs; do not replace the APK."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'scripts/lib'))
from dsh_device import Device

p=argparse.ArgumentParser(description=__doc__);p.add_argument('serial');a=p.parse_args()
d=Device(a.serial)
out=ROOT/'docs/validation/2026-09-11-pad-app-dev';out.mkdir(parents=True,exist_ok=True)
try:
    assert d.shell('getprop','ro.product.device')=='yingtian'
    assert not d.exists('files/.snapshot-transaction')
    bootstrap='files/home/.dsh/android-app-lab/bootstrap'
    skill='files/home/.dsh/codex-android/home/skills/android-app-dev'
    receipt={}
    def stage(source,target):
        data=source.read_bytes();digest=hashlib.sha256(data).hexdigest()
        temporary='/data/local/tmp/deepcode-app-dev-'+digest[:16]
        d.command('push',str(source),temporary,timeout=120)
        try:
            d.command('shell','run-as','com.dsharnessmobile.shell','mkdir','-p',str(Path(target).parent))
            d.command('shell','run-as','com.dsharnessmobile.shell','cp',temporary,target)
            if d.file_digest(target)!=digest: raise RuntimeError('Transfer SHA mismatch: '+target)
        finally: d.command('shell','rm','-f',temporary,check=False)
        receipt[target]={'bytes':len(data),'sha256':digest}
    for source in (ROOT/'android-shell/codex-skills/android-app-dev').rglob('*'):
        if source.is_file() and '__pycache__' not in source.parts:
            stage(source,skill+'/'+str(source.relative_to(ROOT/'android-shell/codex-skills/android-app-dev')))
    for name,source in [('android.jar',ROOT/'.tools/android-sdk/platforms/android-36/android.jar'),
                        ('d8.jar',ROOT/'.tools/android-sdk/build-tools/35.0.0/lib/d8.jar'),
                        ('build-app.sh',ROOT/'scripts/android-app-lab/build-app.sh')]:
        stage(source,bootstrap+'/'+name)
    with tempfile.TemporaryDirectory(prefix='deepcode-pad-bootstrap-') as scratch:
        script=Path(scratch)/'install-toolchain.sh'
        script.write_text((ROOT/'scripts/android-app-lab/install-toolchain.sh').read_text().replace('zip android-framework-res','zip android-framework-res python3-pil'))
        stage(script,bootstrap+'/install-toolchain.sh')
    imagegen='files/home/.dsh/codex-android/home/skills/.system/imagegen/SKILL.md'
    assert d.exists(imagegen),'Bundled imagegen skill missing; inspect before proceeding'
    receipt[imagegen]={'existing':True,'sha256':d.file_digest(imagegen)}
    (out/'deployment.json').write_text(json.dumps(receipt,indent=2)+'\n')
    print('Pad skill + SDK staged and verified; existing system imagegen preserved.')
finally:d.close()
