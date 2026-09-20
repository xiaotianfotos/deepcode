#!/usr/bin/env python3
"""Build/stage the production CPU KleidiAI ASR plus verified compatibility engine."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT/'artifacts/voice-engine'
RECEIPT = ROOT/'artifacts/voice-engine.json'
REVISION = 'df750f76bb6126566621803b69ddaeb993be5b08'
parser = argparse.ArgumentParser()
parser.add_argument('--stage-only', action='store_true')
args = parser.parse_args()
ndk = Path(os.environ['ANDROID_HOME'])/'ndk/27.2.12479018'
tool = ndk/'toolchains/llvm/prebuilt/linux-x86_64/bin'
digest = lambda p: hashlib.file_digest(p.open('rb'), 'sha256').hexdigest()

if not args.stage_only:
    source = ROOT/'.tools/llama.cpp'
    assert subprocess.check_output(['git', '-C', str(source), 'rev-parse', 'HEAD'], text=True).strip() == REVISION
    assert not subprocess.check_output(['git', '-C', str(source), 'status', '--porcelain'], text=True).strip()
    # Keep the known Vulkan-capable engine available without enabling Vulkan in
    # the default CPU-only build. It is independently built by build-asr-lab.py.
    old = json.loads((ROOT/'artifacts/qwen-asr-lab-v0.1.0.json').read_text())
    compat = ROOT/'asr-lab/app/src/main/jniLibs/arm64-v8a/libasr_server.so'
    assert digest(compat) == old['binarySha256'], 'Rebuild the compatibility engine with build-asr-lab.py'
    assert old['sources']['llama.cpp'][1] == REVISION
    build = ROOT/'.tools/asr-kleidiai-build'
    command = ['cmake', '-S', str(source), '-B', str(build), '-G', 'Ninja',
        '-DCMAKE_TOOLCHAIN_FILE='+str(ndk/'build/cmake/android.toolchain.cmake'),
        '-DANDROID_ABI=arm64-v8a', '-DANDROID_PLATFORM=android-29', '-DANDROID_STL=c++_static',
        '-DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON', '-DCMAKE_BUILD_TYPE=Release',
        '-DBUILD_SHARED_LIBS=OFF', '-DGGML_NATIVE=OFF', '-DGGML_OPENMP=OFF',
        '-DGGML_VULKAN=OFF', '-DGGML_CPU_KLEIDIAI=ON', '-DLLAMA_OPENSSL=OFF',
        '-DLLAMA_BUILD_TESTS=ON', '-DLLAMA_BUILD_EXAMPLES=OFF', '-DLLAMA_BUILD_APP=OFF',
        '-DLLAMA_BUILD_UI=OFF', '-DLLAMA_USE_PREBUILT_UI=OFF']
    subprocess.run(command, check=True)
    subprocess.run(['cmake', '--build', str(build), '--target', 'llama-server', '-j', '6'], check=True)
    kai = build/'_deps/kleidiai-src'
    assert 'set(KLEIDIAI_COMMIT_TAG "v1.24.0")' in (source/'ggml/src/ggml-cpu/CMakeLists.txt').read_text()
    OUT.mkdir(parents=True, exist_ok=True)
    files = {}
    for name, src in [('libdsh_voice_server.so', build/'bin/llama-server'), ('libdsh_voice_compat.so', compat)]:
        dest = OUT/name
        shutil.copyfile(src, dest)
        subprocess.run([str(tool/'llvm-strip'), '--strip-debug', str(dest)], check=True)
        elf = subprocess.check_output([str(tool/'llvm-readelf'), '-lW', str(dest)], text=True)
        loads = [s for s in elf.splitlines() if s.strip().startswith('LOAD ')]
        assert loads and all(int(s.split()[-1],16) >= 16384 for s in loads)
        files[name] = {'sha256': digest(dest), 'bytes': dest.stat().st_size}
    licenses = OUT/'licenses'
    licenses.mkdir(exist_ok=True)
    for src in (ROOT/'asr-lab/app/src/main/assets/licenses').iterdir():
        if src.is_file(): shutil.copyfile(src, licenses/('voice-'+src.name))
    for src in (kai/'LICENSES').glob('*.txt'):
        shutil.copyfile(src, licenses/('voice-KleidiAI-'+src.name))
    copyrights = set()
    for src in (kai/'kai').rglob('*'):
        if src.suffix in ['.c', '.h', '.S']:
            copyrights.update(line.strip('/ *') for line in src.read_text().splitlines() if 'SPDX-FileCopyrightText:' in line)
    (licenses/'voice-KleidiAI-NOTICE.txt').write_text(
        'KleidiAI v1.24.0 — https://github.com/ARM-software/kleidiai/tree/v1.24.0\n'
        'Unmodified Arm CPU micro-kernels; per-file Apache-2.0 / BSD-3-Clause licenses.\n'+
        '\n'.join(sorted(copyrights))+'\n')
    data = {'schemaVersion': 1, 'llamaRevision': REVISION, 'kleidiaiVersion': '1.24.0',
        'abi': 'arm64-v8a', 'ndk': ndk.name, 'elfLoadAlignmentBytes': 16384,
        'default': 'kleidiai-cpu', 'sme': 'runtime detection; no forced architecture',
        'compatibility': 'legacy CPU (Vulkan-capable binary)', 'cmake': command, 'files': files,
        'licenses': {p.name:digest(p) for p in licenses.iterdir() if p.is_file()}}
    RECEIPT.write_text(json.dumps(data,indent=2)+'\n')

data = json.loads(RECEIPT.read_text())
assert data['llamaRevision'] == REVISION and data['kleidiaiVersion'] == '1.24.0'
native = ROOT/'android-shell/app/src/main/jniLibs/arm64-v8a'
assets = ROOT/'android-shell/app/src/main/assets'
native.mkdir(parents=True, exist_ok=True)
for name, meta in data['files'].items():
    assert digest(OUT/name) == meta['sha256']
    shutil.copyfile(OUT/name, native/name)
    (native/name).chmod(0o755)
for name, sha in data['licenses'].items():
    assert digest(OUT/'licenses'/name) == sha
    shutil.copyfile(OUT/'licenses'/name, assets/'licenses'/name)
(assets/'voice-engine.json').write_text(json.dumps({k:v for k,v in data.items() if k!='cmake'},indent=2)+'\n')
print('Verified production ASR engines staged:', ', '.join(data['files']))
