#!/usr/bin/env python3
"""Probe authentication with an ephemeral port; never persist launch tokens."""
import argparse
import json
from lib.dsh_device import Device, ROOT

parser = argparse.ArgumentParser()
parser.add_argument('serial')
args = parser.parse_args()
d = Device(args.serial)
try:
    d.authenticate()
    assert d.status() == 401
    with d.opener.open(d.base + '/', timeout=10) as response:
        assert response.status == 200 and '<html' in response.read().decode().lower()
    with d.opener.open(d.base + '/api/android/privilege/status', timeout=10) as response:
        assert response.status == 200
        status = json.load(response)
    report = {'unauthenticated_root': 401, 'token_exchange_root': 200,
              'android_plugin_status': 200, 'android_plugin_response_keys': sorted(status),
              'tokens_persisted': False}
    safe = ''.join(c if c.isalnum() or c in '._-' else '_' for c in args.serial)
    (ROOT / 'artifacts').mkdir(exist_ok=True)
    (ROOT / 'artifacts' / f'http-smoke-{safe}.json').write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
finally:
    d.close()
