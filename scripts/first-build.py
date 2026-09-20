#!/usr/bin/env python3
"""Build a first ARM64 DeepCode APK from public inputs, without a donor APK.

Run bootstrap-android-host.py first. All phases operate only in this checkout;
no device is contacted. --phase allows resuming after a reported failure.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
ANDROID = ROOT / 'android-shell'
WORK = ROOT / '.tools/first-build'
ARCHIVE = ROOT / 'downloads/snapshot-arm64-0140.tar.xz'
BASE_SHA = 'ed24dfcc004725dee4c41e6b9d139fa10e97455af270187794f838327caec28f'
BASE_URL = 'https://github.com/kelai141/dsh-mobile-apk/releases/download/v0.14.0-preview/snapshot-arm64.tar.xz'
ASSETS = ANDROID / 'app/src/main/assets'
NATIVE = ANDROID / 'app/src/main/jniLibs/arm64-v8a'
PLUGINS = ['dsh-shell-termux', 'dsh-client-ui-responsive',
    *['plugins/' + p for p in ['dsh-android-bridge','dsh-android-manage',
    'dsh-android-linux-env','dsh-android-file-open','dsh-android-browser','dsh-android-vdisplay','dsh-model-capability',
    'dsh-android-fs','dsh-android-debian','dsh-android-codex','dsh-codex-live',
    'dsh-speech-services','dsh-startup-appearance','dsh-xiaomi-remote',
    'dsh-client-input-gamepad','dsh-client-ui-voice-deck','dsh-client-fold-transition',
    'dsh-android-voice-input','dsh-android-performance','dsh-task-notifications']]]


def digest(path):
    with Path(path).open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()


def run(argv, cwd=ROOT):
    print('+', ' '.join(map(str, argv)), flush=True)
    subprocess.run(list(map(str, argv)), cwd=cwd, check=True)


def script(name, *args):
    run([sys.executable, ROOT/'scripts'/name, *args])


def fetch_base():
    ARCHIVE.parent.mkdir(exist_ok=True)
    if not ARCHIVE.exists():
        temporary = ARCHIVE.with_suffix('.part')
        with urllib.request.urlopen(BASE_URL, timeout=120) as response, temporary.open('wb') as output:
            shutil.copyfileobj(response, output)
        if digest(temporary) != BASE_SHA:
            raise RuntimeError('Public snapshot checksum mismatch')
        temporary.replace(ARCHIVE)
    if digest(ARCHIVE) != BASE_SHA:
        raise RuntimeError('Cached snapshot checksum mismatch; do not bypass the lock')


def plugins():
    for folder in PLUGINS:
        directory = ANDROID/folder
        run(['npm','ci','--legacy-peer-deps','--ignore-scripts','--no-audit','--no-fund'], directory)
        run(['npm','run','build'], directory)


def inputs():
    fetch_base()
    script('fetch-debian-inputs.py', '--abi', 'arm64')
    script('prepare-debian-bundle.py', 'arm64')


def native():
    script('prepare-codex-runtime.py')
    script('build-voice-vad.py')
    script('build-voice-engine.py')
    script('build-forced-aligner.py')
    script('build-forced-aligner.py', '--vulkan')
    script('prepare-forced-aligner-apk.py')


def copy_package(source, profile):
    meta = json.loads((source/'package.json').read_text())
    dest = profile/'node_modules'/meta['name']
    dest.mkdir(parents=True, exist_ok=True)
    for item in source.iterdir():
        if item.name in ('lib','presets','skills') and item.is_dir():
            shutil.copytree(item, dest/item.name, dirs_exist_ok=True, ignore=shutil.ignore_patterns('*.map','__pycache__'))
        elif item.name in ('package.json','LICENSE','SOURCE.json','THIRD-PARTY-NOTICES.txt','cordis.patch.yml'):
            shutil.copy2(item, dest/item.name)


def pack_runtime(runtime, target):
    # Android extraction expects private file modes; public base is hash-pinned.
    # Tar preserves existing Termux symlinks without following them on the host.
    def private_mode(info):
        info.uid = info.gid = 0
        info.uname = info.gname = ''
        if info.isdir(): info.mode = 0o700
        elif info.isfile():
            with (runtime/info.name).open('rb') as f: prefix = f.read(4)
            info.mode = 0o700 if prefix.startswith((b'\x7fELF', b'#!')) else 0o600
        return info
    temporary = WORK/'snapshot.tar'
    with tarfile.open(temporary, 'w', dereference=False) as archive:
        for directory in ('usr','home'):
            archive.add(runtime/directory, arcname=directory, filter=private_mode)
    with target.with_suffix('.part').open('wb') as output:
        subprocess.run(['xz','-T4','-3','-c',str(temporary)],stdout=output,check=True)
    target.with_suffix('.part').replace(target)
    temporary.unlink()


def clean_runtime_sources(modules):
    for file in (modules/'@dsh-android').rglob('*.map'):
        if file.is_file() and not file.is_symlink(): file.unlink()
    for file in modules.rglob('*.js'):
        # npm package names may themselves end in .js (for example tesseract.js).
        if file.is_symlink() or not file.is_file(): continue
        content = file.read_text(errors='strict')
        if str(ROOT) in content: file.write_text(content.replace(str(ROOT)+'/', ''))


def assemble():
    fetch_base()
    runtime = WORK/'runtime'
    # Delete only this script's declared disposable extraction; no external donor.
    if runtime.is_symlink(): raise RuntimeError('Runtime staging must not be a symlink')
    if runtime.exists(): shutil.rmtree(runtime)
    runtime.mkdir(parents=True)
    run(['tar','--no-same-owner','-xJf',ARCHIVE,'-C',runtime])
    profile = runtime/'home/.dsh/profiles/web'
    for folder in PLUGINS: copy_package(ANDROID/folder, profile)
    copy_package(ANDROID/'dsh-host-web-compat', profile)
    for folder in ['dsh-undo-savepoint','dshmarketplace-plugin']:
        copy_package(ANDROID/'vendor'/folder, profile)
    run(['node','scripts/patches/apply-patches.mjs',profile/'node_modules','--scope','vendor','--apply'],ANDROID)
    run(['node','scripts/patches/apply-patches.mjs',runtime,'--scope','engine','--apply'],ANDROID)
    script('stage-upstream-experiment.py','--abi','arm64','--archive',ARCHIVE,'--runtime',runtime,'--assets',ASSETS)
    script('stage-codex-live.py')
    bundle = ROOT/'.tools/debian-bundle/arm64'
    if not (bundle/'manifest.json').exists(): raise RuntimeError('Run inputs phase before assemble')
    shutil.copytree(bundle,runtime/'usr/share/dsh-debian',dirs_exist_ok=True)
    # Optional skills are source inputs, not account state or server credentials.
    skills = runtime/'home/.dsh/codex-android/home/skills'
    for source in (ANDROID/'codex-skills').iterdir():
        if source.is_dir() and source.name != 'say':
            shutil.copytree(source,skills/source.name,ignore=shutil.ignore_patterns('__pycache__'),dirs_exist_ok=True)
    clean_runtime_sources(profile/'node_modules')
    pack_runtime(runtime, ASSETS/'snapshot.tar.xz')
    (ASSETS/'snapshot.sha256').write_text(digest(ASSETS/'snapshot.tar.xz')+'\n')
    for license in (ANDROID/'LICENSES').glob('*.txt'):
        shutil.copy2(license,ASSETS/'licenses'/license.name)
    shutil.copy2(ANDROID/'THIRD_PARTY_NOTICES.md',ASSETS/'licenses/THIRD_PARTY_NOTICES.md')


def verify_runtime():
    snapshot = ASSETS/'snapshot.tar.xz'
    if digest(snapshot) != (ASSETS/'snapshot.sha256').read_text().strip():
        raise RuntimeError('Snapshot receipt mismatch')
    checks = ['check-engine-overlay.mjs','check-snapshot-file-modes.mjs','check-snapshot-secrets.mjs']
    for check in checks: run(['node','scripts/'+check,snapshot],ANDROID)
    run(['node','scripts/check-third-party.mjs','x','--tar',snapshot],ANDROID)
    run(['node','scripts/elf-check.mjs',snapshot,'arm64'],ANDROID)
    run([sys.executable,'scripts/retired_plugins.py',snapshot],ANDROID)
    required = ['libdsh_codex.so','libdsh_codex_host.so','libc++_shared.so',
                'libdsh_codex_launcher.so','libdsh_codex_shell.so','libdsh_codex_identity.so',
                'libdsh_proot_loader.so','libdsh_voice_server.so','libdsh_voice_compat.so',
                'libdsh_vad.so','libdsh_aligner.so','libdsh_aligner_vulkan.so']
    for name in required:
        if not (NATIVE/name).is_file(): raise RuntimeError('Missing native payload: '+name)
    return {name:digest(NATIVE/name) for name in required}


def apk():
    expected_native = verify_runtime()
    sdk = Path(os.environ['ANDROID_HOME'])
    (ANDROID/'local.properties').write_text('sdk.dir='+str(sdk)+'\n')
    # Prevent APK incremental packaging from retaining a previous snapshot.
    for name in ['app/build/intermediates/assets','app/build/intermediates/incremental/packageDebug','app/build/outputs/apk/debug']:
        shutil.rmtree(ANDROID/name,ignore_errors=True)
    run(['./gradlew',':app:testDebugUnitTest',':app:assembleDebug','-PruntimeAbi=arm64-v8a',
         '-PversionNameSuffix=-deepcode-source','--console=plain','--max-workers=4'],ANDROID)
    target = ROOT/'artifacts/deepcode-source-arm64.apk'
    shutil.copy2(ANDROID/'app/build/outputs/apk/debug/app-debug.apk',target)
    with zipfile.ZipFile(target) as archive:
        with archive.open('assets/snapshot.tar.xz') as f:
            if hashlib.file_digest(f,'sha256').hexdigest()!=digest(ASSETS/'snapshot.tar.xz'):
                raise RuntimeError('Packaged snapshot differs')
        for name,sha in expected_native.items():
            if hashlib.sha256(archive.read('lib/arm64-v8a/'+name)).hexdigest()!=sha:
                raise RuntimeError('Packaged native differs: '+name)
    run([sdk/'build-tools/35.0.0/apksigner','verify','--verbose',target])
    run([sdk/'build-tools/35.0.0/zipalign','-c','-P','16','4',target])
    receipt = {'schema':1,'source_commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),
               'source_dirty':bool(subprocess.check_output(['git','status','--porcelain'],cwd=ROOT)),
               'abi':'arm64','apk':str(target.relative_to(ROOT)),'apk_sha256':digest(target),
               'snapshot_sha256':digest(ASSETS/'snapshot.tar.xz'),'native_sha256':expected_native,
               'base_url':BASE_URL,'base_sha256':BASE_SHA,'models_included':False,
               'device_toolchain_installed':False,'cloud_accounts_included':False}
    (ROOT/'artifacts/first-build.json').write_text(json.dumps(receipt,indent=2)+'\n')
    print('Verified source APK:', target)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--phase',choices=['all','plugins','inputs','native','assemble','verify','apk'],default='all')
    args=parser.parse_args()
    WORK.mkdir(parents=True,exist_ok=True)
    (ROOT/'artifacts').mkdir(exist_ok=True)
    os.environ['npm_config_cache']=str(ROOT/'.tools/npm-cache')
    os.environ['GRADLE_USER_HOME']=str(ROOT/'.tools/gradle')
    actions={'plugins':plugins,'inputs':inputs,'native':native,'assemble':assemble,'verify':verify_runtime,'apk':apk}
    try:
        for name,action in actions.items():
            if args.phase==name or (args.phase=='all' and name!='verify'): action()
    except (OSError,subprocess.CalledProcessError,RuntimeError) as error:
        print('FIRST_BUILD_BLOCKED:',error,file=sys.stderr)
        return 1
    return 0

if __name__=='__main__': sys.exit(main())
