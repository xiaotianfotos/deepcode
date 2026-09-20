"""Rebuild the shell and guarded responsive UI patch, retaining the verified snapshot."""
import subprocess,pathlib,json,hashlib,shutil,zipfile,os
root=pathlib.Path(__file__).resolve().parents[1];receipt=root/'artifacts/build-arm64-codex.json';b=json.loads(receipt.read_text())
source=root/'android-shell/app/src/main/assets/snapshot.tar.xz'
assert hashlib.file_digest(source.open('rb'),'sha256').hexdigest()==b['snapshot_sha256'],'Rebuild the overlay and baseline first'
subprocess.run(['python3',str(root/'android-shell/scripts/retired_plugins.py'),str(source)],check=True)
subprocess.run(['python3',str(root/'scripts/build-voice-engine.py'),'--stage-only'],check=True)
voice_engine=json.loads((root/'artifacts/voice-engine.json').read_text())
ui=root/'android-shell/dsh-client-ui-responsive'
subprocess.run(['npm','run','build'],cwd=ui,check=True)
ui_bytes=(ui/'lib/client.js').read_text().replace(str(ui)+'/', '').encode()
ui_version=json.loads((ui/'package.json').read_text())['version']
ui_name={'0.1.13':'responsive-client','0.3.3':'responsive-client-033'}[ui_version]
ui_asset=root/f'android-shell/app/src/main/assets/patched/{ui_name}.js'
ui_asset.write_bytes(ui_bytes)
deck=root/'android-shell/plugins/dsh-client-ui-voice-deck'
subprocess.run(['npm','run','build'],cwd=deck,check=True)
deck_bytes=(deck/'lib/client.js').read_bytes()
(root/'android-shell/app/src/main/assets/patched/voice-deck-client.js').write_bytes(deck_bytes)
voice=root/'android-shell/plugins/dsh-android-voice-input'
subprocess.run(['npm','run','build'],cwd=voice,check=True)
subprocess.run(['npm','run','build'],cwd=root/'android-shell/plugins/dsh-speech-services',check=True)
subprocess.run(['python3',str(root/'scripts/stage-speech-services.py')],check=True)
subprocess.run(['npm','run','build'],cwd=root/'android-shell/plugins/dsh-codex-live',check=True)
subprocess.run(['python3',str(root/'scripts/stage-codex-live.py')],check=True)
subprocess.run(['python3',str(root/'scripts/stage-startup-appearance.py')],check=True)
subprocess.run(['python3',str(root/'scripts/stage-task-notifications.py')],check=True)
subprocess.run(['python3',str(root/'scripts/stage-xiaomi-remote.py')],check=True)
subprocess.run(['python3',str(root/'scripts/patch-voice-deck.py')],cwd=root,check=True)
subprocess.run(['python3',str(root/'scripts/patch-model-catalog.py')],cwd=root,check=True)
subprocess.run(['node','--test',str(root/'scripts/test-model-catalog.mjs')],cwd=root,check=True)
subprocess.run(['python3',str(root/'scripts/patch-attachment-session.py')],cwd=root,check=True)
session_patches={
 'model-catalog-host':(root/'android-shell/app/src/main/assets/patched/model-catalog-host.js').read_bytes(),
 'host-picker-session':(root/'android-shell/dsh-host-web-compat/lib/index.js').read_bytes(),
 'voice-input-client':(voice/'lib/client.js').read_bytes(),
 'conversation-session-client':(root/'.tools/deck-patches/dsh-client-ui-conversation.js').read_bytes(),
 'attachment-session-client':(root/'android-shell/app/src/main/assets/patched/attachment-session-client.js').read_bytes(),
}
for name,data in session_patches.items():(root/f'android-shell/app/src/main/assets/patched/{name}.js').write_bytes(data)
codex_image_bytes=(root/'android-shell/vendor/relay-dsh-plugin-codex/lib/host-plugin.js').read_bytes()
(root/'android-shell/app/src/main/assets/patched/codex-image-input.js').write_bytes(codex_image_bytes)
command=['./gradlew',':app:assembleDebug','-PruntimeAbi=arm64-v8a','-PversionNameSuffix=-local-codex','--console=plain']
subprocess.run(command,cwd=root/'android-shell',check=True)
output=pathlib.Path(b['apk']);shutil.copyfile(root/'android-shell/app/build/outputs/apk/debug/app-debug.apk',output)
with zipfile.ZipFile(output) as z:
 with z.open('assets/snapshot.tar.xz') as f:assert hashlib.file_digest(f,'sha256').hexdigest()==b['snapshot_sha256']
 assert z.read(f'assets/patched/{ui_name}.js')==ui_bytes
 assert z.read('assets/patched/voice-deck-client.js')==deck_bytes
 for name,data in session_patches.items():assert z.read(f'assets/patched/{name}.js')==data
 assert z.read('assets/patched/codex-image-input.js')==codex_image_bytes
 for relative in ['package.json','LICENSE','THIRD-PARTY-NOTICES.txt','lib/index.js','lib/client.js']:
  assert z.read('assets/plugins/dsh-speech-services/'+relative)==(root/'android-shell/plugins/dsh-speech-services'/relative).read_bytes()
 for relative in ['package.json','LICENSE','lib/index.js','lib/client.js']:
  assert z.read('assets/plugins/dsh-startup-appearance/'+relative)==(root/'android-shell/plugins/dsh-startup-appearance'/relative).read_bytes()
  assert z.read('assets/plugins/dsh-xiaomi-remote/'+relative)==(root/'android-shell/plugins/dsh-xiaomi-remote'/relative).read_bytes()
 for name,meta in voice_engine['files'].items():
  assert hashlib.sha256(z.read('lib/arm64-v8a/'+name)).hexdigest()==meta['sha256']
 for name,sha in voice_engine['licenses'].items():
  assert hashlib.sha256(z.read('assets/licenses/'+name)).hexdigest()==sha
for tool,args in [('apksigner',['verify','--verbose']),('zipalign',['-c','-P','16','4'])]:subprocess.run([os.environ['ANDROID_HOME']+'/build-tools/35.0.0/'+tool,*args,str(output)],stdout=subprocess.DEVNULL,check=True)
b['previousApkSha256']=b['apk_sha256'];b['apk_sha256']=hashlib.file_digest(output.open('rb'),'sha256').hexdigest();b['apk_bytes']=output.stat().st_size;b['shell_rebuild_command']=command
b['fold_source_sha256']={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in (root/'android-shell/app/src/main/java/com/dsharnessmobile/shell').glob('Fold*')}
b['responsive_client_patch_sha256']=hashlib.sha256(ui_bytes).hexdigest()
b['voice_deck_client_patch_sha256']=hashlib.sha256(deck_bytes).hexdigest()
b['session_input_patch_sha256']={name:hashlib.sha256(data).hexdigest() for name,data in session_patches.items()}
b['codex_image_input_patch_sha256']=hashlib.sha256(codex_image_bytes).hexdigest()
b['voice_engine']=voice_engine
receipt.write_text(json.dumps(b,indent=2)+'\n');output.with_suffix('.apk.sha256').write_text(b['apk_sha256']+'  '+output.name+'\n')
print('Verified rebuilt APK',b['apk_sha256'])
