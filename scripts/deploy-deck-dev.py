#!/usr/bin/env python3
"""Debug-only iteration overlay; final delivery must rebuild the APK snapshot."""
import pathlib, subprocess, sys, json, hashlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from lib.dsh_device import Device,PKG
d=Device(sys.argv[1]); assert not d.exists('files/.snapshot-transaction'), 'Snapshot transaction active'
manifest=json.loads((ROOT/'.tools/deck-patches/manifest.json').read_text())
files={}
for name in manifest:
    files['files/usr/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/'+name+'/lib/client.js']=ROOT/'.tools/deck-patches'/f'{name}.js'
for short in ['dsh-client-ui-voice-deck','dsh-client-input-gamepad','dsh-android-voice-input']:
    p=ROOT/'android-shell/plugins'/short;name=json.loads((p/'package.json').read_text())['name']
    for source in [p/'package.json',*sorted((p/'lib').rglob('*'))]:
        if source.is_file():files['files/home/.dsh/profiles/web/node_modules/'+name+'/'+source.relative_to(p).as_posix()]=source
receipts={}
for target,source in files.items():
    data=source.read_bytes()
    temporary='/data/local/tmp/dsh-deck-development-upload'
    d.command('push',str(source),temporary)
    d.command('shell','run-as',PKG,'mkdir','-p',str(pathlib.PurePosixPath(target).parent))
    d.command('shell','run-as',PKG,'cp',temporary,target+'.deck-next')
    d.command('shell','run-as',PKG,'chmod','600',target+'.deck-next')
    d.command('shell','run-as',PKG,'mv',target+'.deck-next',target)
    digest=hashlib.sha256(data).hexdigest();assert d.file_digest(target)==digest
    receipts[target]=digest
(ROOT/'artifacts/deck-dev-overlay.json').write_text(json.dumps(receipts,indent=2))
d.command('shell','rm','-f',temporary)
d.command('shell','am','force-stop',PKG)
d.command('shell','am','start','-n',PKG+'/.MainActivity')
print('Verified debug overlay:',len(files),'files; engine restarted. Rebuild APK before delivery.')
