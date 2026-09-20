#!/usr/bin/env python3
"""Prepare an immutable, checksum-verified local APK delivery directory."""
import argparse
import hashlib
import json
import pathlib
import shutil
from lib.dsh_device import ROOT

parser=argparse.ArgumentParser();parser.add_argument('--release',default='fs-adapter-preview-20260908');args=parser.parse_args()
if '/' in args.release or args.release in ('.','..'):raise SystemExit('Expected release directory name')
source=ROOT/'releases'/args.release
manifest=json.loads((source/'manifest.json').read_text())
dest=ROOT/'artifacts/delivery'/manifest['id']
dest.mkdir(parents=True,exist_ok=True)
def digest(path):
    with path.open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()
for item in manifest['files']:
    original=ROOT/'artifacts'/item['filename']
    if original.stat().st_size!=item['bytes'] or digest(original)!=item['sha256']:
        raise RuntimeError('Input APK differs from release manifest: '+item['filename'])
    output=dest/item['filename']
    if output.exists():
        if digest(output)!=item['sha256']:
            raise RuntimeError('Existing delivery differs; choose a new delivery ID')
    else:
        partial=output.with_suffix('.part')
        shutil.copyfile(original,partial)
        if digest(partial)!=item['sha256']:raise RuntimeError('Delivery copy checksum mismatch')
        partial.replace(output)
# Copies, not hardlinks: rebuilding artifacts must not alter an existing delivery.
shutil.copyfile(source/'manifest.json',dest/'manifest.json')
shutil.copyfile(source/'INSTALL.zh-CN.txt',dest/'INSTALL.zh-CN.txt')
(dest/'SHA256SUMS').write_text(''.join(item['sha256']+'  '+item['filename']+'\n' for item in manifest['files']))
print(dest)
