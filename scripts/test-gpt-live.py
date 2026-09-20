#!/usr/bin/env python3
"""Physical GPT Live test: UI start, background RTP, mute, stop and thread identity.

Use a dedicated Codex validation chat on the unlocked tablet. No sample audio is
played: this checks microphone transport, not speech understanding. Evidence belongs in .local.
"""
import argparse
import json
import pathlib
import re
import subprocess
import time
import xml.etree.ElementTree as ET
from lib.dsh_device import Device, PKG


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('serial')
    parser.add_argument('--session', required=True)
    parser.add_argument('--output', type=pathlib.Path, required=True)
    parser.add_argument('--seconds', type=int, default=90)
    args = parser.parse_args()
    assert args.seconds >= 65
    args.output.mkdir(parents=True, exist_ok=True)
    d = Device(args.serial)
    samples = []
    started = False
    receiver = PKG + '/.BackgroundVoiceTestReceiver'

    def broadcast(action):
        d.shell('am', 'broadcast', '-n', receiver, '-a', 'voice.test.' + action)

    def status():
        broadcast('LIVE_STATUS')
        value = json.loads(d.read('files/live-voice-test.json'))
        samples.append({'at': time.monotonic(), **value})
        return value

    def backend():
        return json.load(d.opener.open(d.base + '/api/android/codex/live', timeout=10))

    def click(label):
        d.shell('uiautomator', 'dump', '/data/local/tmp/live-voice-ui.xml')
        root = ET.fromstring(d.shell('cat', '/data/local/tmp/live-voice-ui.xml'))
        for n in root.iter('node'):
            if n.get('text') == label and n.get('enabled') == 'true':
                a, b, c, e = map(int, re.findall(r'\d+', n.get('bounds')))
                d.shell('input', 'tap', str((a+c)//2), str((b+e)//2))
                return
        raise AssertionError('Missing visible control: ' + label)

    def open_controls():
        d.shell('am', 'start', '-n', PKG + '/.MainActivity')
        time.sleep(1)
        # Live controls are internal: other apps cannot request automatic capture.
        code = """import {connect} from './scripts/lib/android-cdp.mjs';
const c=await connect(process.argv[1]);try{await c.evaluate('androidBridge.liveVoiceOpen('+JSON.stringify(process.argv[2])+')')}finally{c.close()}"""
        subprocess.run(['node', '--input-type=module', '-e', code, args.serial, args.session], check=True)
        time.sleep(1)

    try:
        assert d.shell('getprop', 'ro.product.device') == 'yingtian'
        assert not d.exists('files/.snapshot-transaction') and not d.exists('files/.snapshot-stage')
        d.authenticate()
        items = d.rpc('session/list', {'_request': {}})['items']
        assert any(i['sessionId'] == args.session for i in items)
        assert not any(i.get('running') for i in items)
        assert backend()['active'] is None, 'Existing Live session must not be interrupted'
        assert not status()['serviceAlive']
        links = json.loads(d.read('files/home/.dsh/codex-android/session-links.json'))
        original = links['sessions'][args.session]
        open_controls()
        click('开启 GPT Live')
        started = True
        deadline = time.monotonic() + 75
        while time.monotonic() < deadline:
            s = status()
            assert s['phase'] not in ('error', 'closed'), s
            if s['phase'] in ('listening', 'working'):
                break
            time.sleep(.5)
        else:
            raise AssertionError('Live connection timed out')
        thread = s['codexThreadId']
        assert thread == (original if isinstance(original, str) else original['threadId'])
        (args.output / 'session.png').write_bytes(d.command('exec-out', 'screencap', '-p').stdout)
        d.shell('input', 'keyevent', '3')
        focus = '\n'.join(l for l in d.shell('dumpsys', 'window').splitlines() if 'mCurrentFocus=' in l)
        assert 'Launcher' in focus, focus
        before = status()
        deadline = time.monotonic() + args.seconds
        while time.monotonic() < deadline:
            time.sleep(2)
            s = status()
            assert s['phase'] in ('listening', 'working') and s['serviceAlive'], s
            assert s['sessionId'] == args.session and s['codexThreadId'] == thread
        assert s['capturedSamples'] > before['capturedSamples'] + 16000 * args.seconds
        assert s['sentAudioPackets'] > before['sentAudioPackets']
        (args.output / 'background.png').write_bytes(d.command('exec-out', 'screencap', '-p').stdout)
        print('Background microphone, outbound RTP and original thread verified', flush=True)
        open_controls()
        click('静音 / 继续收音')
        time.sleep(2)
        assert status()['muted'] is True
        d.shell('input', 'keyevent', '3')
        time.sleep(3)
        assert status()['muted'] is True
        (args.output / 'muted.png').write_bytes(d.command('exec-out', 'screencap', '-p').stdout)
        open_controls()
        click('静音 / 继续收音')
        time.sleep(2)
        assert status()['muted'] is False
        click('结束语音和当前任务')
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            if not status()['serviceAlive'] and backend()['active'] is None:
                break
            time.sleep(1)
        else:
            raise AssertionError('Live ownership was not released')
        assert 'DeepCode GPT Live' not in d.shell('dumpsys', 'window', 'windows')
        current = json.loads(d.read('files/home/.dsh/codex-android/session-links.json'))
        assert current['sessions'][args.session] == original, 'Live changed the persistent thread binding'
        report = {'passed': True, 'backgroundSeconds': args.seconds, 'codexThreadId': thread,
                  'realtimeSessionId': s.get('realtimeSessionId'), 'lastBackgroundState': s,
                  'muteResume': True, 'released': True, 'focus': focus}
        (args.output / 'result.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
        print(json.dumps(report, ensure_ascii=False), flush=True)
    finally:
        if started:
            broadcast('STOP_LIVE')
        (args.output / 'samples.json').write_text(json.dumps(samples, ensure_ascii=False, indent=2))
        broadcast('CLEANUP')
        d.close()


if __name__ == '__main__':
    main()
