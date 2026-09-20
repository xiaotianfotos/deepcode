#!/usr/bin/env python3
"""Download checksum-pinned ModelScope GGUF models. No runtime conversion."""
import concurrent.futures
import hashlib
import json
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT/'.tools/asr-models'
DEST.mkdir(parents=True, exist_ok=True)
def download(model):
    path = DEST/model['filename']
    if not path.exists():
        url = f"https://modelscope.cn/models/{model['repo']}/resolve/{model['revision']}/{model['filename']}"
        part = path.with_suffix('.part')
        with urllib.request.urlopen(url, timeout=120) as response, part.open('wb') as target:
            while data := response.read(8*1024*1024): target.write(data)
        if part.stat().st_size != model['bytes'] or hashlib.file_digest(part.open('rb'),'sha256').hexdigest() != model['sha256']:
            raise RuntimeError('Download checksum mismatch: '+str(part))
        part.rename(path)
    if path.stat().st_size != model['bytes'] or hashlib.file_digest(path.open('rb'),'sha256').hexdigest() != model['sha256']:
        raise RuntimeError('Cached model mismatch: '+str(path))
    print('Verified:',path)
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    list(pool.map(download, json.loads((ROOT/'asr-lab/models.json').read_text())))
