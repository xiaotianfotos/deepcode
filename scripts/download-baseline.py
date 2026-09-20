#!/usr/bin/env python3
"""Fetch pinned public inputs; verify before atomically accepting each file."""
import concurrent.futures
import hashlib
import json
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[1]
DEST = ROOT / 'downloads'


def valid(path, item):
    if not path.is_file():
        return False
    if item.get('size') and path.stat().st_size != item['size']:
        return False
    if not item.get('digest'):
        raise ValueError(f"No published checksum for {item['name']}")
    algorithm, expected = item['digest'].split(':', 1)
    with path.open('rb') as stream:
        actual = hashlib.file_digest(stream, algorithm).hexdigest()
    return actual == expected


def fetch(item):
    path = DEST / item['name']
    if valid(path, item):
        return f'VERIFIED cached {path.name}'
    partial = path.with_name(path.name + '.part')
    subprocess.run(['curl', '--fail', '--location', '--retry', '3',
                    '--connect-timeout', '30', '--silent', '--show-error',
                    '--output', str(partial), item['url']], check=True)
    if not valid(partial, item):
        raise ValueError(f"Checksum/size mismatch: {path.name}")
    partial.replace(path)
    return f'VERIFIED downloaded {path.name} ({path.stat().st_size} bytes)'


if __name__ == '__main__':
    DEST.mkdir(parents=True, exist_ok=True)
    items = json.loads((ROOT / 'docs' / 'download-sources.json').read_text())
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for future in concurrent.futures.as_completed([pool.submit(fetch, i) for i in items]):
            print(future.result(), flush=True)
