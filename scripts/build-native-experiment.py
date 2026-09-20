#!/usr/bin/env python3
"""Build native-only changes using a SHA-verified donor APK's runtime and assets.

Use an installed, backed-up APK as --baseline. This avoids reverting independent
plugin work or forcing snapshot extraction during a native lifecycle experiment.
Requires the existing SDK/JDK/Gradle cache and the matching local signing key.
"""
import argparse
import hashlib
import json
import pathlib
import shutil
import subprocess
import zipfile
import importlib.util

ROOT = pathlib.Path(__file__).resolve().parents[1]


def digest(path):
    with path.open('rb') as handle:
        return hashlib.file_digest(handle, 'sha256').hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline', type=pathlib.Path, required=True)
    parser.add_argument('--sha256', required=True)
    parser.add_argument('--speech-services', action='store_true', help='Include configurable speech plugin and matching input UI')
    parser.add_argument('--live-host', type=pathlib.Path)
    parser.add_argument('--live-host-sha256')
    args = parser.parse_args()
    assert bool(args.live_host) == bool(args.live_host_sha256), 'Both Live host arguments are required'
    assert digest(args.baseline) == args.sha256, 'Donor APK hash mismatch'
    work = ROOT / 'artifacts/native-experiment' / args.sha256
    runtime = work / 'runtime'
    runtime.mkdir(parents=True, exist_ok=True)
    retained = {}
    with zipfile.ZipFile(args.baseline) as source:
        assert source.testzip() is None
        for name in source.namelist():
            if name.endswith('/') or not name.startswith(('assets/', 'lib/')):
                continue
            relative = pathlib.PurePosixPath(name)
            assert '..' not in relative.parts
            output = runtime / ('jniLibs/' + name[4:] if name.startswith('lib/') else name)
            output.parent.mkdir(parents=True, exist_ok=True)
            data = source.read(name)
            output.write_bytes(data)
            retained[name] = hashlib.sha256(data).hexdigest()
    live_assets = {}
    if args.live_host:
        spec = importlib.util.spec_from_file_location('live_assets', ROOT / 'scripts/prepare-live-experiment.py')
        module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
        live_assets = module.prepare(runtime, args.live_host, args.live_host_sha256)
    if args.speech_services:
        for name in ['dsh-speech-services','dsh-android-voice-input']:
            subprocess.run(['npm','run','build'],cwd=ROOT/'android-shell/plugins'/name,check=True)
        spec=importlib.util.spec_from_file_location('speech_assets',ROOT/'scripts/stage-speech-services.py')
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        live_assets.update(module.stage(runtime/'assets'))
        data=(ROOT/'android-shell/plugins/dsh-android-voice-input/lib/client.js').read_bytes()
        (runtime/'assets/patched/voice-input-client.js').write_bytes(data)
        live_assets['assets/patched/voice-input-client.js']=hashlib.sha256(data).hexdigest()
    spec=importlib.util.spec_from_file_location('startup_assets',ROOT/'scripts/stage-startup-appearance.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    live_assets.update(module.stage(runtime/'assets'))
    spec=importlib.util.spec_from_file_location('task_notification_assets',ROOT/'scripts/stage-task-notifications.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    live_assets.update(module.stage(runtime/'assets'))
    spec=importlib.util.spec_from_file_location('remote_assets',ROOT/'scripts/stage-xiaomi-remote.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    live_assets.update(module.stage(runtime/'assets'))
    command = ['./gradlew' , ':app:assembleDebug', '-PruntimeAbi=arm64-v8a',
               '-PversionNameSuffix=' + ('-gpt-live' if args.live_host else '-background-voice'), f'-PexperimentRuntimeDir={runtime}', '--console=plain']
    subprocess.run(command, cwd=ROOT / 'android-shell', check=True)
    apk = work / 'deepcode-background-voice.apk'
    shutil.copyfile(ROOT / 'android-shell/app/build/outputs/apk/debug/app-debug.apk', apk)
    with zipfile.ZipFile(apk) as result:
        assert result.testzip() is None
        for name, sha in (retained | live_assets).items():
            assert hashlib.sha256(result.read(name)).hexdigest() == sha, f'Runtime changed: {name}'
    receipt = {'baselineSha256': args.sha256, 'liveAssets': live_assets, 'liveHostBaselineSha256': args.live_host_sha256, 'apk': str(apk), 'sha256': digest(apk),
               'bytes': apk.stat().st_size, 'retainedRuntimeFiles': len(retained),
               'snapshotSha256': retained['assets/snapshot.tar.xz'], 'command': command}
    (work / 'build.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps(receipt, indent=2))


if __name__ == '__main__':
    main()
