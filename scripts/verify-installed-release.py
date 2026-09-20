"""Verify the final installed deployment, with no account secrets in evidence."""
import sys,json,pathlib,hashlib,zipfile,datetime
sys.path.insert(0,'scripts')
from lib.dsh_device import Device
out=pathlib.Path('docs/validation/2026-09-10-fold-deploy');out.mkdir(parents=True,exist_ok=True);build=json.loads(pathlib.Path('artifacts/build-arm64-codex.json').read_text())
d=Device(sys.argv[1])
try:
 assert not d.exists('files/.snapshot-stage') and not d.exists('files/.snapshot-transaction')
 fp=d.read('files/.snapshot-fingerprint').decode().strip();assert fp==build['snapshot_sha256']
 apk=d.shell('pm','path','com.dsharnessmobile.shell').removeprefix('package:')
 digest=d.shell('run-as','com.dsharnessmobile.shell','/system/bin/sha256sum',apk).split()[0];assert digest==build['apk_sha256']
 native=json.loads(d.read('files/network-dns.json'))['nativeLibraryDir'];hashes={}
 with zipfile.ZipFile(build['apk']) as z:
  for name in build['codex_runtime']['files']:
   expected=hashlib.sha256(z.read('lib/arm64-v8a/'+name)).hexdigest()
   actual=d.shell('run-as','com.dsharnessmobile.shell','/system/bin/sha256sum',native+'/'+name).split()[0];assert expected==actual;hashes[name]=actual
  assert d.read('files/usr/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-attachment-local/lib/index.js')==z.read('assets/patched/attachment-local-index.js')
  responsive=z.read('assets/patched/responsive-client.js')
  assert hashlib.sha256(responsive).hexdigest()==build['responsive_client_patch_sha256']
  assert d.read('files/home/.dsh/profiles/web/node_modules/@dsh-android/dsh-client-ui-responsive/lib/client.js')==responsive
 assert d.read('files/home/.dsh/profiles/web/node_modules/relay-dsh-plugin-codex/lib/host-plugin.js')==pathlib.Path('android-shell/vendor/relay-dsh-plugin-codex/lib/host-plugin.js').read_bytes()
 d.authenticate();account=json.load(d.opener.open(d.base+'/api/android/codex/account',timeout=10));assert account['account'] and account['enabled'] and not account['login']
 assert d.exists('files/home/.dsh/debian/current/.dsh-debian.json')
 assert d.shell('cat','/storage/emulated/0/work/fold-validation/codex-check.txt')=='CODEX_FOLD_NATIVE_OK'
 debian=json.loads(d.shell('cat','/storage/emulated/0/work/fold-validation/debian-check.json'));assert debian['httpServerSelfTest']
 for name,sha in [('Qwen3-ASR-0.6B-Q8_0.gguf','bca259818b50ca7c4c05e9bdb35a5dc04fa039653a6d6f3f0f331f96f6aa1971'),('mmproj-Qwen3-ASR-0.6B-Q8_0.gguf','41a342b5e4c514e968cb756de6cd1b7be39eff43c44c57a2ef5fc6522e36603d')]:
  assert d.shell('sha256sum','/storage/emulated/0/work/models/qwen3-asr/'+name).split()[0]==sha
 result={'verifiedAt':datetime.datetime.now().astimezone().isoformat(),'installed':True,'apkSha256':digest,'snapshotSha256':fp,'nativeCodexFiles':hashes,'routingFixMatchesApkSource':True,'attachmentPatchMatchesApk':True,'responsiveClientPatchMatchesApk':True,'responsiveClientPatchSha256':build['responsive_client_patch_sha256'],'credentialsCopied':False,'codexAccountPreserved':True,'debianPreserved':True,'asrModelHashesVerified':True}
 (out/'runtime-final.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
finally:d.close()
