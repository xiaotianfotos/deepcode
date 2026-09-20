#!/usr/bin/env python3
"""Build the optional native Qwen aligner, pinned CPU ARM64 / 16 KiB ELF.
Source env.sh first. Model weights remain in user storage, never in the APK.
"""
import argparse,hashlib,json,os,pathlib,re,shutil,subprocess
p=argparse.ArgumentParser();p.add_argument("--vulkan",action="store_true");args=p.parse_args()
ROOT=pathlib.Path(__file__).resolve().parents[1]
SOURCE=ROOT/'.tools/qwen3-aligner-cpp';REV='6dcc586e5073fd6e85ee5728e75f0903d6c70c6c';GGML='9be313313c8ecb9488911bd64550190e3ed80f38'
def run(args):subprocess.run(list(map(str,args)),check=True,cwd=ROOT)
if not SOURCE.exists():run(['git','clone','--recurse-submodules','https://github.com/predict-woo/qwen3-asr.cpp.git',SOURCE])
assert subprocess.check_output(['git','-C',str(SOURCE),'rev-parse','HEAD'],text=True).strip()==REV
assert subprocess.check_output(['git','-C',str(SOURCE/'ggml'),'rev-parse','HEAD'],text=True).strip()==GGML
# Keep upstream sources untouched: only adapt its CMake policy in a disposable build source tree.
original=subprocess.check_output(['git','-C',str(SOURCE),'show',REV+':CMakeLists.txt'],text=True)
staged=ROOT/'.tools/qwen3-aligner-android-source';staged.mkdir(exist_ok=True)
for name in ['include','cli','ggml','third_party']:
 link=staged/name
 if not link.exists():link.symlink_to(SOURCE/name,target_is_directory=True)
src_stage=staged/'src'
if src_stage.is_symlink():src_stage.unlink()
src_stage.mkdir(exist_ok=True)
for original_file in (SOURCE/'src').iterdir():
 link=src_stage/original_file.name
 if original_file.name!='forced_aligner.cpp' and not link.exists():link.symlink_to(original_file)
forced=(SOURCE/'src/forced_aligner.cpp').read_text()
# GGML classifies Mali as IGPU. Upstream asks only for discrete GPU and silently falls back to CPU.
for needle,replacement in [
 ('state_.backend_gpu = ggml_backend_init_by_type(GGML_BACKEND_DEVICE_TYPE_GPU, nullptr);', 'state_.backend_gpu = ggml_backend_init_by_type(GGML_BACKEND_DEVICE_TYPE_GPU, nullptr);\n    if (!state_.backend_gpu) state_.backend_gpu = ggml_backend_init_by_type(GGML_BACKEND_DEVICE_TYPE_IGPU, nullptr);'),
 ('ggml_backend_dev_t gpu_dev = ggml_backend_dev_by_type(GGML_BACKEND_DEVICE_TYPE_GPU);', 'ggml_backend_dev_t gpu_dev = ggml_backend_dev_by_type(GGML_BACKEND_DEVICE_TYPE_GPU);\n    if (!gpu_dev) gpu_dev = ggml_backend_dev_by_type(GGML_BACKEND_DEVICE_TYPE_IGPU);')]:
 assert forced.count(needle)==1;forced=forced.replace(needle,replacement)
diagnostic='''
    if (getenv("QWEN_DIAGNOSTICS")) {
        int gpu_nodes = 0, cpu_nodes = 0;
        for (int i = 0; i < ggml_graph_n_nodes(gf); ++i) {
            ggml_tensor * node = ggml_graph_node(gf, i);
            if (node->op != GGML_OP_MUL_MAT) continue;
            ggml_backend_t backend = ggml_backend_sched_get_tensor_backend(state_.sched, node);
            if (backend == state_.backend_gpu && backend != nullptr) ++gpu_nodes; else ++cpu_nodes;
        }
        fprintf(stderr, "ALIGNER_MATMUL gpu=%d cpu=%d backend=%s weights=%s\\n", gpu_nodes, cpu_nodes,
            state_.backend_gpu ? ggml_backend_name(state_.backend_gpu) : "none", ggml_backend_buffer_name(model_.buffer));
    }
'''
pattern=r'(    if \(ggml_backend_sched_graph_compute\(state_\.sched, gf\) != GGML_STATUS_SUCCESS\) \{.*?\n    \})'
forced,count=re.subn(pattern,lambda m:m[0]+diagnostic,forced,flags=re.S);assert count==3
(src_stage/'forced_aligner.cpp').write_text(forced)
cmake=original.replace('set(BUILD_SHARED_LIBS ON)','option(BUILD_SHARED_LIBS "Shared libraries" OFF)').replace('add_library(qwen3-asr SHARED','add_library(qwen3-asr STATIC').replace('-O3 -march=native','-O3')
cli=(SOURCE/'cli/main.cpp').read_text()
needle='ggml_log_set(ggml_log_callback_quiet, nullptr);';assert cli.count(needle)==1
cli=cli.replace(needle,'if (getenv("QWEN_DIAGNOSTICS") == nullptr) '+needle)
(staged/'diagnostic-main.cpp').write_text(cli)
cmake=cmake.replace('        cli/main.cpp','        diagnostic-main.cpp')
(staged/'CMakeLists.txt').write_text(cmake)
ndk=pathlib.Path(os.environ['ANDROID_HOME'])/'ndk/27.2.12479018';build=ROOT/('.tools/qwen3-aligner-android-vulkan' if args.vulkan else '.tools/qwen3-aligner-android-static')
gpu_flags=[]
if args.vulkan:
 gpu_flags=['-DVulkan_INCLUDE_DIR='+str(ROOT/'.tools/asr-vulkan-headers/include'),'-DVulkan_LIBRARY='+str(ndk/'toolchains/llvm/prebuilt/linux-x86_64/sysroot/usr/lib/aarch64-linux-android/29/libvulkan.so'),'-DVulkan_GLSLC_EXECUTABLE='+str(ndk/'shader-tools/linux-x86_64/glslc'),'-DSPIRV-Headers_DIR='+str(ROOT/'.tools/asr-spirv-install/share/cmake/SPIRV-Headers'),'-DCMAKE_CXX_FLAGS=-I'+str(ROOT/'.tools/asr-spirv-install/include')]
run(['cmake','-S',staged,'-B',build,'-G','Ninja','-DCMAKE_TOOLCHAIN_FILE='+str(ndk/'build/cmake/android.toolchain.cmake'),'-DANDROID_ABI=arm64-v8a','-DANDROID_PLATFORM=android-29','-DANDROID_STL=c++_static','-DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON','-DCMAKE_BUILD_TYPE=Release','-DBUILD_SHARED_LIBS=OFF','-DQWEN3_ASR_TEST=OFF','-DGGML_NATIVE=OFF','-DGGML_OPENMP=OFF','-DGGML_VULKAN='+('ON' if args.vulkan else 'OFF')]+gpu_flags)
run(['cmake','--build',build,'--target','qwen3-asr-cli','-j','6'])
dest=ROOT/('artifacts/aligner-lab/libdsh_aligner_vulkan.so' if args.vulkan else 'artifacts/aligner-lab/libdsh_aligner.so');dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(build/'qwen3-asr-cli',dest);dest.chmod(0o755)
run([ndk/'toolchains/llvm/prebuilt/linux-x86_64/bin/llvm-strip','--strip-debug',dest])
elf=subprocess.check_output([str(ndk/'toolchains/llvm/prebuilt/linux-x86_64/bin/llvm-readelf'),'-lW',str(dest)],text=True)
loads=[line for line in elf.splitlines() if line.strip().startswith('LOAD ')];assert loads and all(int(line.split()[-1],16)>=16384 for line in loads)
licenses=ROOT/'asr-lab/forced-aligner/licenses';licenses.mkdir(parents=True,exist_ok=True)
for src,name in [(SOURCE/'LICENSE','qwen3-asr-cpp-LICENSE.txt'),(SOURCE/'ggml/LICENSE','qwen3-aligner-ggml-LICENSE.txt')]:shutil.copyfile(src,licenses/name)
receipt={'source':'https://github.com/predict-woo/qwen3-asr.cpp','revision':REV,'ggmlRevision':GGML,'ndk':ndk.name,'abi':'arm64-v8a','backend':'Vulkan' if args.vulkan else 'CPU','optimization':'Release O3; portable ARM64','sha256':hashlib.file_digest(dest.open('rb'),'sha256').hexdigest(),'bytes':dest.stat().st_size,'elfLoadAlignmentBytes':16384,'sourceAdaptation':'Static linking; portable ARM64; IGPU device fallback in ForcedAligner; opt-in backend/matmul diagnostics'}
(ROOT/('artifacts/forced-aligner-native-vulkan.json' if args.vulkan else 'artifacts/forced-aligner-native.json')).write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt))
