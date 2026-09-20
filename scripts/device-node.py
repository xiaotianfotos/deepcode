#!/usr/bin/env python3
"""Run a local JavaScript probe with the APK's actual Node environment."""
import pathlib
import shlex
import subprocess
import sys

if len(sys.argv) != 3:
    raise SystemExit('Usage: python scripts/device-node.py SERIAL LOCAL_JS_FILE')
serial, source = sys.argv[1:]
pkg = 'com.dsharnessmobile.shell'
root = f'/data/data/{pkg}/files'
prefix = root + '/usr'
env = {
    'PATH': prefix + '/bin:/system/bin', 'LD_LIBRARY_PATH': prefix + '/lib',
    'LD_PRELOAD': prefix + '/lib/libtermux-exec-ld-preload.so',
    'TERMUX_EXEC__SYSTEM_LINKER_EXEC__MODE': 'force',
    'TERMUX_EXEC__EXECVE_CALL__INTERCEPT': '1',
    'TERMUX__ROOTFS': root, 'TERMUX__PREFIX': prefix,
    'TERMUX_APP__DATA_DIR': f'/data/user/0/{pkg}',
    'TERMUX_APP__LEGACY_DATA_DIR': f'/data/data/{pkg}',
    'OPENSSL_CONF': prefix + '/etc/tls/openssl.cnf',
    'HOME': root + '/home', 'TMPDIR': prefix + '/tmp',
}
script = 'set -eu\n' + '\n'.join('export ' + k + '=' + shlex.quote(v) for k, v in env.items())
script += '\ncd ' + shlex.quote(prefix + '/lib/node_modules/@deepseek-ai/dsh')
script += '\nexec /system/bin/linker64 ' + shlex.quote(prefix + '/bin/node')
script += ' --input-type=module -e ' + shlex.quote(pathlib.Path(source).read_text()) + '\n'
result = subprocess.run(['adb', '-s', serial, 'shell', '-T', 'run-as', pkg, '/system/bin/sh'], input=script, text=True)
raise SystemExit(result.returncode)
