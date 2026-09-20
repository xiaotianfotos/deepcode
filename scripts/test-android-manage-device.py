#!/usr/bin/env python3
"""Run management contract tests using the tablet's installed DSH tools, without UI actions."""
import argparse
import json
import pathlib
import shlex
import subprocess
import uuid
from lib.dsh_device import Device, PKG, ROOT


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('serial')
    args = parser.parse_args()
    device = Device(args.serial)
    if device.shell('getprop', 'ro.product.device') != 'yingtian':
        raise RuntimeError('Expected the authorized tablet')
    base = f'/data/user/0/{PKG}/files'
    root = base + '/home/tmp/manage-contract-' + uuid.uuid4().hex
    package = ROOT / 'android-shell/plugins/dsh-android-manage'
    core = base + '/usr/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-tools/lib/index.js'
    def shell(command):
        return device.command('shell', 'run-as', PKG, 'sh', '-c', shlex.quote(command), timeout=60)
    try:
        shell(f'mkdir -p {root}/lib {root}/test')
        files = ['lib/index.js', 'lib/screen.js', 'lib/ime.js', 'lib/ui-tree.js',
                 'test/harness.test.mjs', 'test/ui-tree.test.mjs']
        for name in files:
            content = (package / name).read_bytes()
            if name == 'lib/index.js':
                content = content.replace(b'"@deepseek-ai/dsh-tools"', json.dumps(core).encode())
            subprocess.run(device.adb + ['shell', 'run-as', PKG, 'sh', '-c', shlex.quote('cat > ' + root + '/' + name)],
                           input=content, check=True, timeout=15, capture_output=True)
        result = shell(f'LD_LIBRARY_PATH={base}/usr/lib DSH_REAL_TOOLS=1 TMPDIR={root} {base}/usr/bin/node --test {root}/test/*.test.mjs')
        print(result.stdout.decode())
    finally:
        shell('rm -rf ' + root)
        device.close()


if __name__ == '__main__':
    main()
