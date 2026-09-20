#!/usr/bin/env python3
"""Request one concise utterance from the local DeepCode speech plugin."""
import argparse
import json
import os
import pathlib
import sys
import urllib.request
import xml.etree.ElementTree as ET

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise ValueError('Redirect refused')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--text', default='')
    parser.add_argument('--phase', choices=['ack','progress','result'], default='progress')
    parser.add_argument('--status', action='store_true')
    args = parser.parse_args()
    text = args.text.strip()
    if not args.status and (not text or len(text) > 160):
        parser.error('Use one short sentence, at most 160 characters; do not split long answers.')
    thread = os.environ.get('CODEX_THREAD_ID', '')
    if not thread:
        parser.error('Current Codex thread identity is unavailable; reply with text instead.')
    try:
        auth = pathlib.Path('/data/user/0/com.dsharnessmobile.shell/shared_prefs/dsh_engine_auth.xml')
        prefs = ET.fromstring(auth.read_text())
        cookie = next(n.text for n in prefs if n.get('name') == 'cookie')
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
        opener.addheaders = [('Cookie', cookie)]
        url = 'http://127.0.0.1:3080/api/android/speech'
        with opener.open(url, timeout=10) as response:
            config = json.load(response)
        body = json.dumps(dict(action='say', threadId=thread, text=text, phase='status' if args.status else args.phase,
                               csrf=config['csrf'], revision=config['revision'])).encode()
        request = urllib.request.Request(url, body, {'Content-Type': 'application/json'})
        with opener.open(request, timeout=10) as response:
            result = json.load(response)
        print(json.dumps(result, ensure_ascii=False))
    except Exception:
        print('Speech unavailable or refused. Continue with a text reply; do not retry automatically.', file=sys.stderr)
        return 1
    return 0

if __name__ == '__main__':
    sys.exit(main())
