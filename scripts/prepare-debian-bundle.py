#!/usr/bin/env python3
"""Create ABI-specific relocatable assets from the locked, verified inputs."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
abi = sys.argv[1]
lock = json.loads((ROOT / 'docs/debian-inputs.lock.json').read_text())
spec = lock['architectures'][abi]
inputs = ROOT / 'downloads/debian' / abi
bundle = ROOT / '.tools/debian-bundle' / abi
bundle.mkdir(parents=True, exist_ok=True)
for package in spec['packages']:
    source = inputs / package['url'].rsplit('/', 1)[-1]
    with source.open('rb') as stream:
        assert hashlib.file_digest(stream, 'sha256').hexdigest() == package['sha256']
    extract = ROOT / '.tools/debian-inputs' / abi
    extract.mkdir(parents=True, exist_ok=True)
    subprocess.run(['dpkg-deb', '-x', str(source), str(extract)], check=True)
source = inputs / 'rootfs.tar.gz'
with source.open('rb') as stream:
    assert hashlib.file_digest(stream, 'sha256').hexdigest() == spec['rootfs']['sha256']
shutil.copyfile(source, bundle / source.name)
native = ROOT / '.tools/debian-inputs' / abi / 'data/data/com.termux/files/usr'
for relative in ['bin/proot', 'lib/libtalloc.so', 'lib/libandroid-shmem.so',
                 'libexec/proot/loader', 'libexec/proot/loader32']:
    target = bundle / 'runtime' / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(native / relative, target)
    target.chmod(0o700)
apk_abi = 'arm64-v8a' if abi == 'arm64' else 'x86_64'
jni = ROOT / 'android-shell/app/src/main/jniLibs' / apk_abi
jni.mkdir(parents=True, exist_ok=True)
shutil.copyfile(native / 'libexec/proot/loader', jni / 'libdsh_proot_loader.so')
# Store a real file instead of relying on an APK extractor to retain this alias.
shutil.copyfile(bundle / 'runtime/lib/libtalloc.so', bundle / 'runtime/lib/libtalloc.so.2')
notice = '''Debian rootfs: official docker.io/library/debian, digest pinned in manifest.json.
Package copyrights/licenses are retained under rootfs /usr/share/doc and /usr/share/common-licenses.
Debian source packages: https://sources.debian.org/ and the distribution source repositories.
PRoot: GPL-2.0-or-later, https://github.com/termux/proot
libtalloc: LGPL-3.0-or-later, https://talloc.samba.org/
libandroid-shmem: BSD-3-Clause, https://github.com/termux/libandroid-shmem
Termux build recipes and patches: https://github.com/termux/termux-packages
See docs/debian-inputs.lock.json and docs/DEBIAN.md in the application source repository.
'''
(bundle / 'THIRD_PARTY_NOTICES.txt').write_text(notice)
for relative in ['share/doc/proot/copyright', 'share/doc/libtalloc/copyright', 'share/doc/libandroid-shmem/copyright']:
    source = native / relative
    target = bundle / 'licenses' / (source.parent.name + '.txt')
    target.parent.mkdir(exist_ok=True)
    # Termux copyright symlinks point into the same extracted usr tree.
    if source.is_symlink() and str(source.readlink()).startswith('/data/data/com.termux/files/usr/'):
        source = native / str(source.readlink()).removeprefix('/data/data/com.termux/files/usr/')
    if source.exists():
        shutil.copyfile(source, target)
for license in ['GPL-2', 'LGPL-3']:
    shutil.copyfile(Path('/usr/share/common-licenses') / license, bundle / 'licenses' / (license + '.txt'))
manifest = {'schema': 1, 'abi': abi, 'distribution': lock['distribution'],
            'rootfs_sha256': spec['rootfs']['sha256'], 'source': spec,
            'enforcement': 'partial', 'native_files': {}}
for file in sorted((bundle / 'runtime').rglob('*')):
    if file.is_file():
        manifest['native_files'][str(file.relative_to(bundle))] = hashlib.sha256(file.read_bytes()).hexdigest()
(bundle / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps({'abi': abi, 'bundle': str(bundle), 'rootfs_bytes': (bundle/'rootfs.tar.gz').stat().st_size}))
