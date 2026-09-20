#!/usr/bin/env python3
"""Restore and verify the pinned Android runtime; never run npm install scripts."""
import base64, hashlib, io, json, pathlib, shutil, tarfile, urllib.request, subprocess, os
ROOT=pathlib.Path(__file__).resolve().parents[1]
lock=json.loads((ROOT/'android-shell/plugins/dsh-android-codex/runtime-lock.json').read_text())
cache=ROOT/'.tools/codex-integration';cache.mkdir(exist_ok=True)
archive=cache/'android-runtime.tgz'
if not archive.exists():
    partial=archive.with_suffix('.part')
    with urllib.request.urlopen(lock['dist']['tarball'],timeout=60) as source, partial.open('wb') as target:shutil.copyfileobj(source,target)
    partial.replace(archive)
data=archive.read_bytes()
assert hashlib.sha256(data).hexdigest()==lock['sha256'], 'Runtime checksum mismatch'
assert 'sha512-'+base64.b64encode(hashlib.sha512(data).digest()).decode()==lock['dist']['integrity']
target=ROOT/'android-shell/app/src/main/jniLibs/arm64-v8a';target.mkdir(parents=True,exist_ok=True)
licenses=ROOT/'android-shell/app/src/main/assets/licenses'
manifest={'version':lock['version'],'source':lock['dist']['tarball'],'archive_sha256':lock['sha256'],'files':{}}
with tarfile.open(fileobj=io.BytesIO(data),mode='r:gz') as tar:
    for source,name in [('package/bin/codex.bin','libdsh_codex.so'),('package/bin/codex-code-mode-host','libdsh_codex_host.so'),('package/bin/libc++_shared.so','libc++_shared.so')]:
        value=tar.extractfile(source).read()
        if name=='libdsh_codex.so':
            # Android extracts executable APK libraries only as lib*.so. Codex
            # resolves its sibling helper by a fixed name, with no path override
            # in this pinned release. Change only equal-length filename bytes.
            old=b'codex-code-mode-host';new=b'libdsh_codex_host.so'
            assert len(old)==len(new) and value.count(old)==2
            manifest['host_filename_patch']={'from':old.decode(),'to':new.decode(),
                'occurrences':2,'original_sha256':hashlib.sha256(value).hexdigest()}
            value=value.replace(old,new)
        (target/name).write_bytes(value);(target/name).chmod(0o755)
        manifest['files'][name]=hashlib.sha256(value).hexdigest()
    for name in ['LICENSE','NOTICE']:(licenses/('codex-'+name+'.txt')).write_bytes(tar.extractfile('package/'+name).read())
with (licenses/'codex-NOTICE.txt').open('a') as notice:
    notice.write('\nDSH Android packaging modifications (2026-09-10):\n'
        'The pinned codex.bin has two equal-length helper filename strings changed\n'
        'from codex-code-mode-host to libdsh_codex_host.so for APK native extraction.\n'
        'The unmodified archive and patched binary hashes are recorded in the build\n'
        'receipt. App-owned launcher and shell-identity adapters are separate files.\n')
compiler=pathlib.Path(os.environ.get('ANDROID_HOME',ROOT/'.tools/android-sdk'))/'ndk/27.2.12479018/toolchains/llvm/prebuilt/linux-x86_64/bin/aarch64-linux-android26-clang'
identity='libdsh_codex_identity.so'
subprocess.run([str(compiler),'-O2','-fPIC','-shared','-Wl,-z,max-page-size=16384',str(ROOT/'android-shell/app/src/main/cpp/codex/shell_identity.c'),'-ldl','-o',str(target/identity)],check=True)
manifest['files'][identity]=hashlib.sha256((target/identity).read_bytes()).hexdigest()
for name,flags in [('libdsh_codex_launcher.so',[]),('libdsh_codex_shell.so',['-DDSH_CODEX_SHELL'])]:
    subprocess.run([str(compiler),'-O2','-fPIE','-pie','-Wl,-z,max-page-size=16384',*flags,str(ROOT/'android-shell/app/src/main/cpp/codex/launcher.c'),'-o',str(target/name)],check=True)
    manifest['files'][name]=hashlib.sha256((target/name).read_bytes()).hexdigest()
(ROOT/'artifacts/codex-runtime.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(manifest,indent=2))
