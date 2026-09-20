#!/usr/bin/env python3
"""Exercise native build orchestration without downloads, an SDK, or compilation."""
import base64
from contextlib import redirect_stdout
import hashlib
import io
import json
import os
from pathlib import Path
import runpy
import shutil
import tempfile
import unittest
from unittest.mock import patch
import tarfile


SCRIPTS = Path(__file__).resolve().parent
LLAMA = 'df750f76bb6126566621803b69ddaeb993be5b08'
ALIGNER = '6dcc586e5073fd6e85ee5728e75f0903d6c70c6c'
GGML = '9be313313c8ecb9488911bd64550190e3ed80f38'
ELF = '  LOAD 0x000000 0x000000 0x000000 0x000100 0x000100 R E 0x4000\n'


class NativeFirstBuildTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / 'checkout'
        (self.root / 'scripts').mkdir(parents=True)
        self.sdk = Path(self.temp.name) / 'external-sdk'
        self.ndk = self.sdk / 'ndk/27.2.12479018'
        self.commands = []

    def write(self, relative, content=b'fixture'):
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content.encode() if isinstance(content, str) else content)
        return path

    def invoke(self, script, args=(), run=None, output=None):
        dest = self.root / 'scripts' / script
        shutil.copyfile(SCRIPTS / script, dest)
        with patch.dict(os.environ, {'ANDROID_HOME': str(self.sdk)}), \
             patch('sys.argv', [str(dest), *args]), \
             patch('subprocess.run', side_effect=run or self.record), \
             patch('subprocess.check_output', side_effect=output or self.output), \
             redirect_stdout(io.StringIO()):
            return runpy.run_path(str(dest), run_name='__main__')

    def record(self, args, **kwargs):
        command = list(map(str, args))
        self.commands.append(command)
        return command

    def output(self, args, **kwargs):
        command = self.record(args, **kwargs)
        if 'llvm-readelf' in command[0]:
            return ELF
        if command[-2:] == ['status', '--porcelain']:
            return ''
        if command[-2:] == ['rev-parse', 'HEAD']:
            return {
                'llama.cpp': LLAMA,
                'asr-vulkan-headers': 'ee2ec5fd83dafce291024683b50dc89219333076',
                'asr-spirv-headers': '496543121ce6419f23d6fa5d7194ba66c36212d2',
                'libfvad': '532ab666c20d3cfda38bca63abbb0f152706c369',
                'qwen3-aligner-cpp': ALIGNER,
                'ggml': GGML,
            }[Path(command[2]).name]
        raise AssertionError(command)

    def test_native_only_creates_honest_receipt_without_gradle(self):
        self.ndk.mkdir(parents=True)
        for name in ('NOTICE', 'NOTICE.toolchain'):
            (self.ndk / name).write_text('NDK notice')

        def run(args, **kwargs):
            command = self.record(args, **kwargs)
            if command[:2] == ['git', 'init']:
                destination = Path(command[2])
                self.assertTrue(destination.parent.is_dir())
                destination.mkdir()
                (destination / 'LICENSE').write_text('license')
            if command[:2] == ['cmake', '--build']:
                self.write('.tools/asr-llama-build/bin/llama-server')

        self.invoke('build-asr-lab.py', ['--native-only'], run=run)
        receipt = json.loads((self.root / 'artifacts/qwen-asr-lab-v0.1.0.json').read_text())
        self.assertEqual(receipt['buildMode'], 'native-only')
        self.assertEqual(receipt['binarySha256'], hashlib.sha256(b'fixture').hexdigest())
        self.assertTrue({'apk', 'bytes', 'sha256'}.isdisjoint(receipt))
        self.assertFalse(any('gradlew' in command[0] for command in self.commands))
        self.assertFalse((self.root / 'asr-lab/local.properties').exists())
        self.assertTrue(any(str(self.ndk) in ' '.join(c) for c in self.commands))

    def test_voice_engine_prepares_public_native_baseline(self):
        def run(args, **kwargs):
            command = self.record(args, **kwargs)
            if command[-1] == '--native-only':
                self.assertEqual(Path(command[1]).name, 'build-asr-lab.py')
                self.write('.tools/llama.cpp/ggml/src/ggml-cpu/CMakeLists.txt',
                           'set(KLEIDIAI_COMMIT_TAG "v1.24.0")')
                compat = self.write('asr-lab/app/src/main/jniLibs/arm64-v8a/libasr_server.so')
                self.write('asr-lab/app/src/main/assets/licenses/llama.cpp-MIT.txt')
                self.write('artifacts/qwen-asr-lab-v0.1.0.json', json.dumps({
                    'binarySha256': hashlib.sha256(compat.read_bytes()).hexdigest(),
                    'sources': {'llama.cpp': ['ggml-org/llama.cpp', LLAMA]}}))
            if command[:2] == ['cmake', '--build']:
                self.write('.tools/asr-kleidiai-build/bin/llama-server')
                self.write('.tools/asr-kleidiai-build/_deps/kleidiai-src/LICENSES/Apache.txt')
                self.write('.tools/asr-kleidiai-build/_deps/kleidiai-src/kai/kernel.c',
                           '// SPDX-FileCopyrightText: Test fixture')

        self.invoke('build-voice-engine.py', run=run)
        self.assertEqual(self.commands[0][-1], '--native-only')
        self.assertTrue((self.root / 'android-shell/app/src/main/assets/licenses/voice-KleidiAI-NOTICE.txt').is_file())
        self.assertTrue((self.root / 'android-shell/app/src/main/jniLibs/arm64-v8a/libdsh_voice_server.so').is_file())
        self.assertTrue(any(str(self.ndk) in ' '.join(c) for c in self.commands))
        # A verified receipt can also stage into absent Android output directories.
        shutil.rmtree(self.root / 'android-shell/app/src/main')
        self.commands.clear()
        self.invoke('build-voice-engine.py', ['--stage-only'])
        self.assertEqual(self.commands, [])
        self.assertTrue((self.root / 'android-shell/app/src/main/assets/voice-engine.json').is_file())

    def test_aligner_checks_out_pin_before_recursive_submodules(self):
        class StopBeforeBuild(Exception):
            pass

        def run(args, **kwargs):
            command = self.record(args, **kwargs)
            if command[:2] == ['git', 'clone']:
                destination = Path(command[-1])
                self.assertTrue(destination.parent.is_dir())
                destination.mkdir()

        def output(args, **kwargs):
            if 'show' in args:
                raise StopBeforeBuild()
            return self.output(args, **kwargs)

        with self.assertRaises(StopBeforeBuild):
            self.invoke('build-forced-aligner.py', run=run, output=output)
        self.assertEqual(self.commands[0][1:3], ['clone', '--no-checkout'])
        self.assertEqual(self.commands[1][-3:], ['checkout', '--detach', ALIGNER])
        self.assertEqual(self.commands[3][-4:], ['submodule', 'update', '--init', '--recursive'])
        self.assertEqual(Path(self.commands[4][2]).name, 'ggml')

    def test_vad_creates_missing_output_parents(self):
        def run(args, **kwargs):
            command = self.record(args, **kwargs)
            if command[:2] == ['git', 'clone']:
                self.assertTrue(Path(command[-1]).parent.is_dir())
                for name in ('LICENSE', 'PATENTS', 'AUTHORS'):
                    self.write('.tools/libfvad/' + name)
            if command[:2] == ['cmake', '--build']:
                self.write('.tools/voice-vad-build/out/libdsh_vad.so')

        self.invoke('build-voice-vad.py', run=run)
        self.assertTrue((self.root / 'artifacts/voice-vad-build.json').is_file())
        self.assertTrue((self.root / 'android-shell/app/src/main/assets/licenses/voice-libfvad-LICENSE').is_file())
        self.assertTrue(any(str(self.ndk) in ' '.join(c) for c in self.commands))

    def test_aligner_refuses_existing_unpinned_checkout(self):
        (self.root / '.tools/qwen3-aligner-cpp').mkdir(parents=True)
        with self.assertRaises(AssertionError):
            self.invoke('build-forced-aligner.py', output=lambda *args, **kwargs: 'wrong revision')
        self.assertEqual(self.commands, [])

    def test_codex_runtime_creates_missing_parents_and_uses_external_sdk(self):
        archive = io.BytesIO()
        with tarfile.open(fileobj=archive, mode='w:gz') as tar:
            for name in ('bin/codex.bin', 'bin/codex-code-mode-host', 'bin/libc++_shared.so', 'LICENSE', 'NOTICE'):
                content = b'codex-code-mode-host\0codex-code-mode-host' if name == 'bin/codex.bin' else b'fixture'
                entry = tarfile.TarInfo('package/' + name)
                entry.size = len(content)
                tar.addfile(entry, io.BytesIO(content))
        data = archive.getvalue()
        self.write('android-shell/plugins/dsh-android-codex/runtime-lock.json', json.dumps({
            'version': 'fixture', 'sha256': hashlib.sha256(data).hexdigest(),
            'dist': {'tarball': 'https://example.invalid/fixture.tgz',
                     'integrity': 'sha512-' + base64.b64encode(hashlib.sha512(data).digest()).decode()}}))

        def run(args, **kwargs):
            command = self.record(args, **kwargs)
            self.assertTrue(command[0].startswith(str(self.ndk) + '/'))
            Path(command[command.index('-o') + 1]).write_bytes(b'compiled fixture')

        with patch('urllib.request.urlopen', return_value=io.BytesIO(data)):
            self.invoke('prepare-codex-runtime.py', run=run)
        receipt = json.loads((self.root / 'artifacts/codex-runtime.json').read_text())
        self.assertEqual(len(receipt['files']), 6)
        self.assertEqual(receipt['host_filename_patch']['occurrences'], 2)
        self.assertTrue((self.root / 'android-shell/app/src/main/assets/licenses/codex-LICENSE.txt').is_file())


if __name__ == '__main__':
    unittest.main()
