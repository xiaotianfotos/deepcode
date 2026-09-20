#!/usr/bin/env python3
"""Build the pinned Android shell with a verified, unchanged release runtime.

Source scripts/env.sh first. Run ABIs sequentially: Gradle shares one assets tree.
This does not rebuild the embedded Node/Termux/plugin snapshot from source.
"""
import hashlib
import json
import os
import pathlib
import shutil
import subprocess
import sys
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
(ROOT / 'artifacts').mkdir(exist_ok=True)
(ROOT / 'logs').mkdir(exist_ok=True)
REPO = ROOT / 'android-shell'
abi = sys.argv[1] if len(sys.argv) > 1 else 'x86_64'
if abi not in ('arm64', 'x86_64'):
    raise SystemExit('Expected arm64 or x86_64')
codex = '--codex' in sys.argv[2:]
if codex and abi != 'arm64':
    raise SystemExit('Codex Android runtime currently requires arm64')
voice_debug = '--voice-debug' in sys.argv[2:] or codex
deck_ui = '--deck-ui' in sys.argv[2:]
client_plugins = voice_debug or deck_ui
if voice_debug and abi != 'arm64':
    raise SystemExit('Voice preview currently requires arm64')
debian = '--debian' in sys.argv[2:] or client_plugins
storage = '--storage' in sys.argv[2:] or debian
adapter = '--fs-adapter' in sys.argv[2:] or storage
variant = '-codex' if codex else '-voice-debug' if voice_debug else '-deck-ui' if deck_ui else '-debian' if debian else '-storage' if storage else '-fs-adapter' if adapter else ''
build_label = 'local-codex' if codex else 'local-voice-debug' if voice_debug else 'local-deck-ui' if deck_ui else 'local-debian' if debian else 'local-storage' if storage else 'local-fs-adapter' if adapter else 'local-baseline'
snapshot = ROOT / ('.tools/codex-adapter' if codex else '.tools/voice-debug-adapter' if voice_debug else '.tools/deck-ui-adapter' if deck_ui else '.tools/debian-adapter' if debian else '.tools/storage-adapter' if storage else '.tools/fs-adapter' if adapter else 'downloads') / f'snapshot-{abi}.tar.xz'
with snapshot.open('rb') as stream:
    digest = hashlib.file_digest(stream, 'sha256').hexdigest()
assert digest == snapshot.with_name(snapshot.name + '.sha256').read_text().strip()
commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=REPO, text=True).strip()
gates_file = ROOT / 'artifacts' / f'gates-{abi}{variant}.json'
gates = json.loads(gates_file.read_text()) if gates_file.exists() else {}
if (not isinstance(gates, dict) or gates.get('snapshot_sha256') != digest
        or gates.get('source_commit') != commit):
    subprocess.run([sys.executable, str(ROOT / 'scripts/check-runtime.py'), abi, *(['--codex'] if codex else ['--voice-debug'] if voice_debug else ['--deck-ui'] if deck_ui else ['--debian'] if debian else ['--storage'] if storage else ['--fs-adapter'] if adapter else [])], check=True)
    gates = json.loads(gates_file.read_text())
assert all(r['exit_code'] == 0 for r in gates['results']), 'Runtime gates failed'

assets = REPO / 'app/src/main/assets'
# A different snapshot must not be appended into the previous ABI's incremental
# APK: the old compressed payload can remain as unreachable bytes in the ZIP.
for generated in ['app/build/intermediates/assets', 'app/build/outputs/apk/debug',
                  'app/build/intermediates/incremental/packageDebug']:
    shutil.rmtree(REPO / generated, ignore_errors=True)
shutil.copyfile(snapshot, assets / 'snapshot.tar.xz')
(assets / 'snapshot.sha256').write_text(digest)
for file in (REPO / 'LICENSES').glob('*.txt'):
    shutil.copyfile(file, assets / 'licenses' / file.name)
shutil.copyfile(REPO / 'THIRD_PARTY_NOTICES.md', assets / 'licenses/THIRD_PARTY_NOTICES.md')
(REPO / 'local.properties').write_text('sdk.dir=' + os.environ['ANDROID_HOME'] + '\n')

if client_plugins:
    subprocess.run([sys.executable,str(ROOT/'scripts/stage-speech-services.py')],check=True)
    subprocess.run([sys.executable,str(ROOT/'scripts/stage-startup-appearance.py')],check=True)
    subprocess.run([sys.executable,str(ROOT/'scripts/stage-task-notifications.py')],check=True)
    subprocess.run([sys.executable,str(ROOT/'scripts/stage-xiaomi-remote.py')],check=True)

native_target = REPO / 'app/src/main/jniLibs/arm64-v8a/libdsh_voice_server.so'
if codex:
    subprocess.run([sys.executable, str(ROOT / 'scripts/prepare-codex-runtime.py')], check=True)
else:
    for name in ['libdsh_codex.so', 'libdsh_codex_host.so', 'libdsh_codex_identity.so', 'libc++_shared.so', 'libdsh_codex_launcher.so', 'libdsh_codex_shell.so']:
        (native_target.parent / name).unlink(missing_ok=True)
if voice_debug:
    subprocess.run([sys.executable, str(ROOT / 'scripts/build-voice-vad.py')], check=True)
    vad_receipt = json.loads((ROOT / 'artifacts/voice-vad-build.json').read_text())
    subprocess.run([sys.executable, str(ROOT / 'scripts/build-voice-engine.py')], check=True)
    asr_receipt = json.loads((ROOT / 'artifacts/voice-engine.json').read_text())
    native_digest = asr_receipt['files']['libdsh_voice_server.so']['sha256']
    assert asr_receipt['elfLoadAlignmentBytes'] == 16384
else:
    (native_target.parent / 'libdsh_vad.so').unlink(missing_ok=True)
    native_target.unlink(missing_ok=True)
    (native_target.parent / 'libdsh_voice_compat.so').unlink(missing_ok=True)

# Independent Gradle tasks use Gradle's parallel scheduler. ABI builds themselves
# must be serial because both consume app/src/main/assets/snapshot.tar.xz.
command = ['./gradlew', ':app:assembleDebug', '--parallel', '--max-workers=8',
           '--console=plain', f'-PversionNameSuffix=-{build_label}']
if debian:
    command.append('-PruntimeAbi=' + ('arm64-v8a' if abi == 'arm64' else 'x86_64'))
if abi == 'x86_64' and (not adapter or storage):
    command.insert(2, ':app:testDebugUnitTest')
print('Building shell', abi, flush=True)
subprocess.run(command, cwd=REPO, check=True)
output = ROOT / 'artifacts' / f'dsh-v0.13.3-{build_label}-{abi}.apk'
shutil.copyfile(REPO / 'app/build/outputs/apk/debug/app-debug.apk', output)
with zipfile.ZipFile(output) as apk:
    payload_bytes = sum(entry.compress_size for entry in apk.infolist())
    assert output.stat().st_size - payload_bytes < 32 * 1024 * 1024, 'Excess stale ZIP payload'
    if voice_debug:
        assert 'lib/arm64-v8a/libdsh_vad.so' in apk.namelist()
        assert hashlib.sha256(apk.read('lib/arm64-v8a/libdsh_voice_server.so')).hexdigest() == native_digest
        assert hashlib.sha256(apk.read('lib/arm64-v8a/libdsh_voice_compat.so')).hexdigest() == asr_receipt['files']['libdsh_voice_compat.so']['sha256']
    with apk.open('assets/snapshot.tar.xz') as stream:
        assert hashlib.file_digest(stream, 'sha256').hexdigest() == digest
    assert apk.read('assets/snapshot.sha256').decode().strip() == digest
with output.open('rb') as stream:
    apk_digest = hashlib.file_digest(stream, 'sha256').hexdigest()
output.with_suffix('.apk.sha256').write_text(apk_digest + '  ' + output.name + '\n')
build_tools = pathlib.Path(os.environ['ANDROID_HOME']) / 'build-tools/35.0.0'
subprocess.run([str(build_tools / 'apksigner'), 'verify', '--verbose', str(output)], check=True)
subprocess.run([str(build_tools / 'zipalign'), '-c', '-P', '16', '4', str(output)], check=True)
badging = subprocess.check_output([str(build_tools / 'aapt'), 'dump', 'badging', str(output)], text=True)
(ROOT / 'artifacts' / f'badging-{abi}{variant}.txt').write_text(badging)
receipt = {'abi': abi, 'source_commit': commit, 'runtime_origin': 'upstream release v0.13.3' + (' plus fs/storage adapters and Debian execution plugin' if debian else ' plus fs and storage adapters' if storage else ' plus fs adapter overlay' if adapter else ''),
           'runtime_rebuilt': False, 'snapshot_sha256': digest,
           'apk_sha256': apk_digest, 'apk_bytes': output.stat().st_size,
           'apk': str(output), 'gradle_command': command}
if voice_debug:
    receipt['voice_engine'] = asr_receipt
    receipt['voice_vad'] = vad_receipt
    receipt['runtime_origin'] += ' plus voice-input/performance client plugins'
if codex:
    receipt['codex_runtime'] = json.loads((ROOT / 'artifacts/codex-runtime.json').read_text())
(ROOT / 'artifacts' / f'build-{abi}{variant}.json').write_text(json.dumps(receipt, indent=2))
print(json.dumps(receipt, indent=2), flush=True)
