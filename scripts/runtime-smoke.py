#!/usr/bin/env python3
"""Keyless on-device runtime probe, confined to a dedicated app-private folder.

This checks the embedded Node and tools, not model-driven Agent tool dispatch.
Source env.sh first; pass an adb serial. No credentials are read.
"""
import json
import pathlib
import shlex
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
(ROOT / 'artifacts').mkdir(exist_ok=True)
(ROOT / 'logs').mkdir(exist_ok=True)
serial = sys.argv[1] if len(sys.argv) > 1 else 'emulator-5580'
pkg = 'com.dsharnessmobile.shell'
prefix = f'/data/data/{pkg}/files/usr'
work = f'/data/data/{pkg}/files/smoke-work'
js = r'''
const fs = require('node:fs');
const cp = require('node:child_process');
const { Worker } = require('node:worker_threads');
const { DatabaseSync } = require('node:sqlite');
const root = process.env.DSH_SMOKE_WORK;
fs.mkdirSync(root, { recursive: true });
fs.writeFileSync(root + '/roundtrip.txt', '安卓文件验证\n');
if (fs.readFileSync(root + '/roundtrip.txt', 'utf8') !== '安卓文件验证\n') throw Error('file mismatch');
const db = new DatabaseSync(':memory:');
const sqlite = db.prepare('SELECT 6 * 7 AS value').get().value;
db.close();
if (sqlite !== 42) throw Error('sqlite mismatch');
const bash = cp.execFileSync(process.env.DSH_SMOKE_PREFIX + '/bin/bash', ['-c', 'printf runtime-bash-ok'], {encoding:'utf8'});
if (bash !== 'runtime-bash-ok') throw Error('bash mismatch');
const git = cp.execFileSync(process.env.DSH_SMOKE_PREFIX + '/bin/git', ['--version'], {encoding:'utf8'}).trim();
const worker = new Worker("require('node:worker_threads').parentPort.postMessage(42)", {eval:true});
worker.on('error', e => { console.error(e.message); process.exitCode=1; });
worker.on('message', value => {
  if (value !== 42) throw Error('worker mismatch');
  console.log(JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,
    file_roundtrip:true,sqlite:true,worker:true,bash:true,git,workspace:root}));
});
'''
env = {
    'DSH_SMOKE_PREFIX': prefix, 'DSH_SMOKE_WORK': work,
    'PATH': prefix + '/bin:/system/bin', 'LD_LIBRARY_PATH': prefix + '/lib',
    'LD_PRELOAD': prefix + '/lib/libtermux-exec-ld-preload.so',
    'TERMUX_EXEC__SYSTEM_LINKER_EXEC__MODE': 'force',
    'TERMUX_EXEC__EXECVE_CALL__INTERCEPT': '1',
    'TERMUX__ROOTFS': f'/data/data/{pkg}/files', 'TERMUX__PREFIX': prefix,
    'TERMUX_APP__DATA_DIR': f'/data/user/0/{pkg}',
    'TERMUX_APP__LEGACY_DATA_DIR': f'/data/data/{pkg}',
    'OPENSSL_CONF': prefix + '/etc/tls/openssl.cnf',
}
script = 'set -eu\n' + '\n'.join('export ' + k + '=' + shlex.quote(v) for k, v in env.items())
script += '\nexec /system/bin/linker64 ' + shlex.quote(prefix + '/bin/node') + ' -e ' + shlex.quote(js) + '\n'
result = subprocess.run(['adb', '-s', serial, 'shell', '-T', 'run-as', pkg, '/system/bin/sh'],
                        input=script, capture_output=True, text=True, timeout=60)
log = ROOT / 'logs' / f'runtime-smoke-{serial}.log'
log.write_text(result.stdout + result.stderr)
if result.returncode:
    print(result.stdout + result.stderr)
    raise SystemExit(result.returncode)
row = json.loads(next(line for line in result.stdout.splitlines() if line.startswith('{')))
(ROOT / 'artifacts' / f'runtime-smoke-{serial}.json').write_text(json.dumps(row, indent=2))
print(json.dumps(row, indent=2))
