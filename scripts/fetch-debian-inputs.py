#!/usr/bin/env python3
"""Fetch digest-pinned official Debian OCI layers and Termux proot dependencies.

--resolve deliberately refreshes the lock; ordinary invocation only consumes it.
Downloads are disposable; docs/debian-inputs.lock.json is the rebuild recipe.
"""
import gzip
import hashlib
import json
import pathlib
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
DEST = ROOT / 'downloads/debian'
LOCK = ROOT / 'docs/debian-inputs.lock.json'
REPO = 'https://packages.termux.dev/apt/termux-main/'
REGISTRY = 'https://registry-1.docker.io/v2/library/debian/'
DEST.mkdir(parents=True, exist_ok=True)

def get(url, headers=None):
    return urllib.request.urlopen(urllib.request.Request(url, headers=headers or {}), timeout=90)

token = json.load(get('https://auth.docker.io/token?service=registry.docker.io&scope=repository:library/debian:pull'))['token']
auth = {'Authorization': 'Bearer ' + token,
        'Accept': 'application/vnd.oci.image.index.v1+json, application/vnd.oci.image.manifest.v1+json'}

if '--resolve' in sys.argv:
    raw = get(REGISTRY + 'manifests/bookworm-slim', auth).read()
    index = json.loads(raw)
    lock = {'schema': 1, 'distribution': 'debian:bookworm-slim',
            'index_sha256': hashlib.sha256(raw).hexdigest(), 'architectures': {}}
    for abi, debarch, termarch in [('x86_64', 'amd64', 'x86_64'), ('arm64', 'arm64', 'aarch64')]:
        manifest_id = next(m['digest'] for m in index['manifests']
                           if m['platform']['architecture'] == debarch and m['platform']['os'] == 'linux')
        manifest_raw = get(REGISTRY + 'manifests/' + manifest_id, auth).read()
        assert hashlib.sha256(manifest_raw).hexdigest() == manifest_id.split(':')[1]
        manifest = json.loads(manifest_raw)
        assert len(manifest['layers']) == 1, 'Only a single-layer official rootfs is supported'
        layer = manifest['layers'][0]
        packages = gzip.decompress(get(REPO + f'dists/stable/main/binary-{termarch}/Packages.gz').read()).decode()
        selected = []
        for block in packages.split('\n\n'):
            fields = dict(line.split(': ', 1) for line in block.splitlines() if ': ' in line and not line.startswith(' '))
            if fields.get('Package') in ['proot', 'libtalloc', 'libandroid-shmem']:
                selected.append({'package': fields['Package'], 'version': fields['Version'],
                                 'url': REPO + fields['Filename'], 'sha256': fields['SHA256']})
        assert len(selected) == 3
        lock['architectures'][abi] = {'manifest': manifest_id, 'rootfs': {
            'url': REGISTRY + 'blobs/' + layer['digest'],
            'sha256': layer['digest'].split(':')[1], 'bytes': layer['size']}, 'packages': selected}
    LOCK.write_text(json.dumps(lock, indent=2) + '\n')
else:
    lock = json.loads(LOCK.read_text())

for abi, config in lock['architectures'].items():
    folder = DEST / abi
    folder.mkdir(exist_ok=True)
    for item in [dict(config['rootfs'], filename='rootfs.tar.gz'), *config['packages']]:
        path = folder / item.get('filename', item['url'].rsplit('/', 1)[-1])
        if path.exists() and hashlib.file_digest(path.open('rb'), 'sha256').hexdigest() == item['sha256']:
            print('verified', abi, path.name, flush=True)
            continue
        partial = path.with_suffix(path.suffix + '.part')
        with get(item['url'], auth if item['url'].startswith(REGISTRY) else None) as source, partial.open('wb') as target:
            while block := source.read(1024 * 1024):
                target.write(block)
        assert hashlib.file_digest(partial.open('rb'), 'sha256').hexdigest() == item['sha256'], path.name
        partial.replace(path)
        print('downloaded', abi, path.name, path.stat().st_size, flush=True)
