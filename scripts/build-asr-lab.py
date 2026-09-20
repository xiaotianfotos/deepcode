#!/usr/bin/env python3
"""Build the pinned Android ARM64 ASR engine and standalone APK. Source env.sh."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
SDK = Path(os.environ['ANDROID_HOME'])
NDK = SDK / 'ndk/27.2.12479018'
PROJECT = ROOT / 'asr-lab'
SOURCES = {
    'llama.cpp': ('ggml-org/llama.cpp', 'df750f76bb6126566621803b69ddaeb993be5b08'),
    'asr-vulkan-headers': ('KhronosGroup/Vulkan-Headers', 'ee2ec5fd83dafce291024683b50dc89219333076'),
    'asr-spirv-headers': ('KhronosGroup/SPIRV-Headers', '496543121ce6419f23d6fa5d7194ba66c36212d2'),
}
def run(args):
    subprocess.run([str(a) for a in args], check=True, cwd=ROOT)
for directory, (repo, revision) in SOURCES.items():
    dest = ROOT / '.tools' / directory
    if not dest.exists():
        run(['git', 'init', dest])
        run(['git', '-C', dest, 'remote', 'add', 'origin', 'https://github.com/' + repo + '.git'])
        run(['git', '-C', dest, 'fetch', '--depth', '1', 'origin', revision])
        run(['git', '-C', dest, 'checkout', '--detach', 'FETCH_HEAD'])
    actual = subprocess.check_output(['git', '-C', str(dest), 'rev-parse', 'HEAD'], text=True).strip()
    if actual != revision:
        raise SystemExit('Source revision mismatch: ' + directory)
prefix = ROOT / '.tools/asr-spirv-install'
run(['cmake', '-S', ROOT/'.tools/asr-spirv-headers', '-B', ROOT/'.tools/asr-spirv-headers/build', '-DCMAKE_INSTALL_PREFIX='+str(prefix)])
run(['cmake', '--install', ROOT/'.tools/asr-spirv-headers/build'])
build = ROOT / '.tools/asr-llama-build'
run(['cmake', '-S', ROOT/'.tools/llama.cpp', '-B', build, '-G', 'Ninja',
     '-DCMAKE_TOOLCHAIN_FILE='+str(NDK/'build/cmake/android.toolchain.cmake'),
     '-DANDROID_ABI=arm64-v8a', '-DANDROID_PLATFORM=android-29', '-DANDROID_STL=c++_static',
     '-DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON',
     '-DCMAKE_BUILD_TYPE=Release', '-DBUILD_SHARED_LIBS=OFF', '-DGGML_NATIVE=OFF', '-DGGML_OPENMP=OFF',
     '-DGGML_VULKAN=ON', '-DGGML_CPU_KLEIDIAI=OFF', '-DLLAMA_OPENSSL=OFF', '-DLLAMA_BUILD_TESTS=OFF', '-DLLAMA_BUILD_EXAMPLES=OFF',
     '-DLLAMA_BUILD_APP=OFF', '-DLLAMA_BUILD_UI=OFF', '-DLLAMA_USE_PREBUILT_UI=OFF',
     '-DVulkan_INCLUDE_DIR='+str(ROOT/'.tools/asr-vulkan-headers/include'),
     '-DVulkan_LIBRARY='+str(NDK/'toolchains/llvm/prebuilt/linux-x86_64/sysroot/usr/lib/aarch64-linux-android/29/libvulkan.so'),
     '-DVulkan_GLSLC_EXECUTABLE='+str(NDK/'shader-tools/linux-x86_64/glslc'),
     '-DSPIRV-Headers_DIR='+str(prefix/'share/cmake/SPIRV-Headers'),
     '-DCMAKE_CXX_FLAGS=-I'+str(prefix/'include')])
run(['cmake', '--build', build, '--target', 'llama-server', 'llama-mtmd-cli', '-j', '6'])
native = PROJECT / 'app/src/main/jniLibs/arm64-v8a/libasr_server.so'
native.parent.mkdir(parents=True, exist_ok=True)
shutil.copyfile(build/'bin/llama-server', native)
run([NDK/'toolchains/llvm/prebuilt/linux-x86_64/bin/llvm-strip', '--strip-debug', native])
elf = subprocess.check_output([NDK/'toolchains/llvm/prebuilt/linux-x86_64/bin/llvm-readelf', '-lW', native], text=True)
loads = [line for line in elf.splitlines() if line.strip().startswith('LOAD ')]
if not loads or any(int(line.split()[-1], 16) < 16384 for line in loads):
    raise SystemExit('Native executable must have 16 KiB-aligned ELF LOAD segments')
licenses = PROJECT / 'app/src/main/assets/licenses'
licenses.mkdir(parents=True, exist_ok=True)
shutil.copyfile(ROOT/'.tools/llama.cpp/LICENSE', licenses/'llama.cpp-MIT.txt')
shutil.copyfile(NDK/'NOTICE', licenses/'android-ndk-NOTICE.txt')
shutil.copyfile(NDK/'NOTICE.toolchain', licenses/'android-ndk-toolchain-NOTICE.txt')
for name in ['cpp-httplib', 'miniaudio', 'nlohmann', 'stb', 'minja']:
    folder = ROOT/'.tools/llama.cpp/vendor'/name
    if folder.is_dir():
        for candidate in folder.glob('*'):
            if candidate.name.upper().startswith(('LICENSE', 'COPYING')):
                shutil.copyfile(candidate, licenses/(name+'-'+candidate.name))
(PROJECT/'local.properties').write_text('sdk.dir='+str(SDK)+'\n')
run([ROOT/'android-shell/gradlew', '-p', PROJECT, ':app:assembleDebug', '--offline', '--console=plain', '--max-workers=4'])
out = ROOT/'artifacts/qwen-asr-lab-v0.1.0.apk'
shutil.copyfile(PROJECT/'app/build/outputs/apk/debug/app-debug.apk', out)
run([SDK/'build-tools/35.0.0/apksigner', 'verify', '--verbose', out])
run([SDK/'build-tools/35.0.0/zipalign', '-c', '-P', '16', '4', out])
receipt = {'apk': str(out), 'bytes': out.stat().st_size, 'sha256': hashlib.file_digest(out.open('rb'), 'sha256').hexdigest(),
           'sources': SOURCES, 'ndk': NDK.name, 'abi': 'arm64-v8a', 'gpu': 'Vulkan',
           'binarySha256': hashlib.file_digest(native.open('rb'), 'sha256').hexdigest(), 'elfLoadAlignmentBytes': 16384}
out.with_suffix('.json').write_text(json.dumps(receipt, indent=2)+'\n')
print(json.dumps(receipt, indent=2))
