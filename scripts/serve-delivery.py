#!/usr/bin/env python3
"""Serve only the prepared APK handoff directory on the LAN."""
import argparse
import functools
import http.server
import json
from lib.dsh_device import ROOT

parser=argparse.ArgumentParser()
parser.add_argument('--port',type=int,default=8766)
parser.add_argument('--release',default='fs-adapter-preview-20260908')
args=parser.parse_args()
if '/' in args.release or args.release in ('.','..'):raise SystemExit('Expected release directory name')
manifest=json.loads((ROOT/'releases'/args.release/'manifest.json').read_text())
directory=ROOT/'artifacts/delivery'/manifest['id']
if not (directory/'SHA256SUMS').exists():raise SystemExit('Run prepare-delivery.py first')
allowed={x['filename'] for x in manifest['files']}|{'manifest.json','SHA256SUMS','INSTALL.zh-CN.txt'}
class Handler(http.server.SimpleHTTPRequestHandler):
    def send_head(self):
        from urllib.parse import unquote,urlsplit
        path=unquote(urlsplit(self.path).path)
        if path not in ['/'] and path.removeprefix('/') not in allowed:
            self.send_error(404)
            return None
        return super().send_head()
    def end_headers(self):
        self.send_header('Cache-Control','no-cache')
        super().end_headers()
handler=functools.partial(Handler,directory=str(directory))
print(f'Serving verified delivery on 0.0.0.0:{args.port}',flush=True)
http.server.ThreadingHTTPServer(('0.0.0.0',args.port),handler).serve_forever()
