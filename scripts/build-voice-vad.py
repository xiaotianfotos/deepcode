#!/usr/bin/env python3
"""Build the pinned WebRTC VAD JNI library with the local Android NDK."""
import hashlib,json,os,subprocess,shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
REV='532ab666c20d3cfda38bca63abbb0f152706c369'
source=ROOT/'.tools/libfvad';ndk=Path(os.environ['ANDROID_HOME'])/'ndk/27.2.12479018'
def run(args):subprocess.run([str(a) for a in args],check=True)
source.parent.mkdir(parents=True,exist_ok=True)
if not source.exists():run(['git','clone','https://github.com/dpirch/libfvad.git',source])
run(['git','-C',source,'checkout','--detach',REV])
assert subprocess.check_output(['git','-C',source,'rev-parse','HEAD'],text=True).strip()==REV
build=ROOT/'.tools/voice-vad-build';build.mkdir(parents=True,exist_ok=True)
(build/'CMakeLists.txt').write_text(f'''cmake_minimum_required(VERSION 3.10)
project(dsh_voice_vad C)
add_subdirectory("{source}" fvad)
add_library(dsh_vad SHARED "{ROOT}/android-shell/app/src/main/cpp/voice-vad/vad_jni.c")
target_link_libraries(dsh_vad PRIVATE fvad)
''')
run(['cmake','-S',build,'-B',build/'out','-G','Ninja','-DCMAKE_TOOLCHAIN_FILE='+str(ndk/'build/cmake/android.toolchain.cmake'),'-DANDROID_ABI=arm64-v8a','-DANDROID_PLATFORM=android-26','-DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON','-DCMAKE_BUILD_TYPE=Release'])
run(['cmake','--build',build/'out','--target','dsh_vad','-j','4'])
out=ROOT/'android-shell/app/src/main/jniLibs/arm64-v8a/libdsh_vad.so';out.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(build/'out/libdsh_vad.so',out)
licenses=ROOT/'android-shell/app/src/main/assets/licenses'
licenses.mkdir(parents=True,exist_ok=True)
for name in ['LICENSE','PATENTS','AUTHORS']:shutil.copyfile(source/name,licenses/('voice-libfvad-'+name))
receipt={'source':'https://github.com/dpirch/libfvad','revision':REV,'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'bytes':out.stat().st_size,'mode':2,'sampleRate':16000,'frameMs':20}
(ROOT/'artifacts').mkdir(parents=True,exist_ok=True)
(ROOT/'artifacts/voice-vad-build.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt))
