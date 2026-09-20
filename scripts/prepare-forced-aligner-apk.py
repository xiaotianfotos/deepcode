#!/usr/bin/env python3
"""Stage verified ARM64 aligner executables and licenses for the next APK build."""
import hashlib
import json
from pathlib import Path
import shutil

root = Path(__file__).resolve().parents[1]
for suffix, binary in [('', 'libdsh_aligner.so'), ('-vulkan', 'libdsh_aligner_vulkan.so')]:
    receipt = json.loads((root / f'artifacts/forced-aligner-native{suffix}.json').read_text())
    source = root / 'artifacts/aligner-lab' / binary
    assert receipt['abi'] == 'arm64-v8a' and receipt['elfLoadAlignmentBytes'] == 16384
    assert hashlib.file_digest(source.open('rb'), 'sha256').hexdigest() == receipt['sha256']
    target = root / 'android-shell/app/src/main/jniLibs/arm64-v8a' / binary
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target)
    target.chmod(0o755)
for source in (root / 'asr-lab/forced-aligner/licenses').glob('*.txt'):
    shutil.copyfile(source, root / 'android-shell/app/src/main/assets/licenses' / source.name)
print('Verified aligners staged; rebuild APK using scripts/rebuild-codex-shell.py')
