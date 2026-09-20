#!/usr/bin/env python3
"""Physical background microphone/ASR test, using only a visible UI start.

Requires the experiment debug APK and its bundled fixed speech fixture. No root,
instrumentation identity, microphone permission grant, or injected ASR results.
--session must be a dedicated validation session. Evidence stays in .local/.
"""
import argparse
import json
import pathlib
import re
import time
import xml.etree.ElementTree as ET
from lib.dsh_device import Device, PKG


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('serial')
    parser.add_argument('--session', required=True)
    parser.add_argument('--output', type=pathlib.Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    d = Device(args.serial)
    samples = []
    receiver = PKG + '/.BackgroundVoiceTestReceiver'

    def broadcast(action):
        return d.shell('am', 'broadcast', '-n', receiver, '-a', 'voice.test.' + action)

    def status():
        broadcast('STATUS')
        return json.loads(d.read('files/background-voice-test.json'))

    def click(label):
        xml = d.shell('uiautomator', 'dump', '/data/local/tmp/background-voice-ui.xml')
        xml = d.shell('cat', '/data/local/tmp/background-voice-ui.xml')
        for node in ET.fromstring(xml).iter('node'):
            if node.get('text') == label:
                x1, y1, x2, y2 = map(int, re.findall(r'\d+', node.get('bounds')))
                d.shell('input', 'tap', str((x1 + x2) // 2), str((y1 + y2) // 2))
                return
        raise AssertionError('Missing visible control: ' + label)

    try:
        assert d.shell('getprop', 'ro.product.device') == 'yingtian'
        assert not d.exists('files/.snapshot-transaction')
        d.authenticate(timeout=15)
        items = d.rpc('session/list', {'_request': {}})['items']
        assert any(i['sessionId'] == args.session for i in items)
        assert not any(i.get('running') for i in items), 'Another Agent is running'
        def user_messages():
            events = [r.get('event', r) for r in d.session_records(args.session)]
            return [e.get('seq') for e in events if e.get('type') == 'user/message']
        before_messages = user_messages()
        d.shell('am', 'start', '-n', PKG + '/.BackgroundVoiceActivity', '--es', 'sessionId', args.session)
        time.sleep(2)
        click('开始后台收音')
        deadline = time.monotonic() + 100
        retried_start = False
        while time.monotonic() < deadline:
            state = status()
            if state['phase'] == 'recording':
                break
            assert state['phase'] != 'error', state.get('error')
            if state['phase'] == 'idle' and not retried_start:
                time.sleep(1)
                click('开始后台收音')
                retried_start = True
            time.sleep(.3)
        else:
            raise AssertionError('Microphone never became ready')
        # HOME must precede the actual physical speech playback.
        d.shell('input', 'keyevent', '3')
        window = d.shell('dumpsys', 'window')
        focus = '\n'.join(line for line in window.splitlines() if 'mCurrentFocus=' in line)
        assert focus and 'BackgroundVoiceActivity' not in focus and 'MainActivity' not in focus, focus
        broadcast('PLAY')
        started = time.monotonic()
        while time.monotonic() - started < 130:
            state = status()
            samples.append({'atSeconds': round(time.monotonic() - started, 2), **state})
            if state['phase'] in ('done', 'error', 'canceled') and not state['serviceAlive']:
                break
            time.sleep(.5)
        assert state['phase'] == 'done', state
        assert state['textLength'] > 0 and state['speechDetected']
        assert state['sessionId'] == args.session
        assert not state['serviceAlive'], 'Microphone service did not stop'
        assert not next(i for i in d.rpc('session/list', {'_request': {}})['items'] if i['sessionId'] == args.session).get('running'), 'Unexpected auto-submit'
        assert user_messages() == before_messages, 'A message was submitted without confirmation'
        d.shell('am', 'start', '-n', PKG + '/.BackgroundVoiceActivity', '--es', 'sessionId', args.session)
        time.sleep(1)
        (args.output / 'result.png').write_bytes(d.command('exec-out', 'screencap', '-p').stdout)
        report = {'passed': True, 'source': 'physical speaker -> microphone while HOME -> local ASR -> review draft',
                  'foregroundWindowDuringPlayback': focus, 'lastState': state, 'samples': samples}
        (args.output / 'microphone.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
        print(json.dumps({'passed': True, 'audioMs': state['audioMs'], 'textLength': state['textLength'], 'requestMs': state['requestMs']}))
    finally:
        (args.output / 'samples.json').write_text(json.dumps(samples, ensure_ascii=False, indent=2))
        d.command('shell', 'am', 'stopservice', '-n', PKG + '/.BackgroundVoiceService', check=False)
        broadcast('CLEANUP')
        d.close()


if __name__ == '__main__':
    main()
