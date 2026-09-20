#!/usr/bin/env python3
"""Local HTTP fixture tests; never contacts a device or production engine."""
import contextlib
import http.server
import importlib.util
import io
import json
import os
import pathlib
import tempfile
import threading
import unittest
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('supervisor', ROOT / 'android-shell/codex-skills/deepcode-session-supervisor/scripts/supervisor.py')
MOD = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MOD)


class Handler(http.server.BaseHTTPRequestHandler):
    requests = []
    records = []
    listing = []

    def log_message(self, *args):
        pass

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        args, method = body['payload']['args'], body['method']
        self.requests.append((method, args, self.headers.get('Cookie')))
        if method == 'session/list':
            result = {'ok': True, 'value': {'items': self.listing}}
        elif method == 'session/page':
            if args['request']['throughSeq'] > 70:
                result = {'ok': False, 'error': {'message': 'session page through seq is past cursor 70'}}
            else:
                result = {'ok': True, 'value': {'records': self.records}}
        elif method == 'session/prompt':
            result = {'ok': True, 'value': {'accepted': True}}
        else:
            result = {'ok': False, 'error': {'message': 'secret-unfiltered-error'}}
        payload = json.dumps({'result': result}).encode()
        self.send_response(200)
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


class Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        directory = pathlib.Path(self.tmp.name)
        self.manifest = directory / 'manifest.json'
        self.jobs = [{'key': k, 'id': 'session-' + k, 'workspace': '/storage/emulated/0/work/' + k,
                      'package': 'com.deepcode.' + k} for k in ('hockey', 'tanks', 'four')]
        self.manifest.write_text(json.dumps({'jobs': self.jobs}))
        self.auth = directory / 'auth.xml'
        self.auth.write_text('<map><string name="cookie">auth=session-secret-value</string><string name="unrelated">must-not-output</string></map>')
        self.feedback = directory / 'feedback.txt'
        self.feedback.write_text('Please validate physics; do not change the selected model.')
        for target, value in [('BASE', 'http://127.0.0.1:' + str(self.server.server_port)), ('AUTH', self.auth)]:
            item = patch.object(MOD, target, value)
            item.start()
            self.addCleanup(item.stop)
        Handler.requests = []
        Handler.listing = [dict(sessionId=j['id'], running=True, updatedAt=100) for j in self.jobs]
        Handler.listing.append(dict(sessionId='session-private', running=True, title='PRIVATE'))
        Handler.records = [{'event': {'type': 'assistant/message', 'time': 100, 'seq': i,
                                      'data': {'message': {'content': [{'type': 'text', 'text': 'Ready'}]}}}} for i in range(70)]
        self.client = MOD.Supervisor(str(self.manifest))

    def test_status_scoped_cursor_and_bounded_history(self):
        result = self.client.status()
        self.assertEqual(len(result), 3)
        self.assertNotIn('PRIVATE', json.dumps(result))
        self.assertTrue(result[0]['running'])
        pages = [args['request'] for method, args, _ in Handler.requests if method == 'session/page']
        self.assertEqual([p['throughSeq'] for p in pages], [2147483647, 70] * 3)
        self.assertTrue(all(p['maxMessages'] == 50 for p in pages))
        self.assertTrue(all(cookie == 'auth=session-secret-value' for _, _, cookie in Handler.requests))
        self.assertEqual(len(self.client.history('hockey')), 50)

    def test_unknown_worker_rejected_before_network(self):
        for action in (lambda: self.client.status('private'), lambda: self.client.history('private'),
                       lambda: self.client.send('private', str(self.feedback), 'queue')):
            with self.assertRaises(MOD.Failure):
                action()
        self.assertEqual(Handler.requests, [])

    def test_streaming_activity_uses_same_page_without_content(self):
        Handler.records = [
            {'event': {'type': 'tool/call', 'seq': 300, 'time': 100, 'data': {'name': 'Bash'}}},
            {'event': {'type': 'assistant/reasoning', 'seq': 6700, 'time': 500,
                       'data': {'text': 'PRIVATE-STREAMING-THOUGHT'}}},
            {'type': 'checkpoint', 'data': {'text': 'PRIVATE-CHECKPOINT'}}]
        result = self.client.status('hockey')[0]
        self.assertEqual(result['lastEventTime'], 100)
        self.assertEqual(result['lastActivitySeq'], 6700)
        self.assertEqual(result['lastActivityTime'], 500)
        self.assertNotIn('PRIVATE-', json.dumps(result))
        self.assertEqual([method for method, _, _ in Handler.requests],
                         ['session/list', 'session/page', 'session/page'])

    def test_activity_absent_or_non_numeric_is_not_output(self):
        for records in ([], [{'event': {'type': 'assistant/reasoning', 'seq': 'PRIVATE-SEQ',
                                      'time': 'PRIVATE-TIME', 'data': {'text': 'PRIVATE-TEXT'}}}]):
            Handler.records = records
            result = self.client.status('hockey')[0]
            self.assertIsNone(result['lastActivitySeq'])
            self.assertIsNone(result['lastActivityTime'])
            self.assertNotIn('PRIVATE-', json.dumps(result))

    def test_arbitrary_rpc_and_model_change_rejected(self):
        for method in ('settings/replace', 'session/selectModel', 'commands/execute', 'session/create'):
            with self.assertRaises(MOD.Failure):
                self.client._rpc(method, {})
        with self.assertRaises(MOD.Failure):
            self.client._rpc('session/page', {'request': {'address': {'kind': 'session', 'sessionId': 'session-private'},
                                                            'throughSeq': 0, 'maxMessages': 50}})
        self.assertEqual(Handler.requests, [])

    def test_feedback_modes_preserve_model(self):
        for mode in ('queue', 'steer'):
            result = self.client.send('tanks', str(self.feedback), mode)
            self.assertTrue(result['accepted'])
            method, args, _ = Handler.requests[-1]
            self.assertEqual(method, 'session/prompt')
            self.assertEqual(args['request']['mode'], mode)
            self.assertEqual(args['request']['sessionId'], 'session-tanks')
            self.assertEqual(set(args['request']), {'sessionId', 'requestId', 'mode', 'content'})
        with self.assertRaises(MOD.Failure):
            self.client.send('tanks', str(self.feedback), 'automatic')

    def test_privacy_projection(self):
        Handler.records = [
            {'event': {'type': 'assistant/reasoning', 'data': {'text': 'PRIVATE-THOUGHT'}}},
            {'event': {'type': 'tool/call', 'data': {'name': 'Bash', 'arguments': {'secret': 'PRIVATE-ARGUMENT'}}}},
            {'event': {'type': 'tool/result', 'data': {'message': {'content': [{'text': 'PRIVATE-RESULT'}]}, 'meta': {'password': 'PRIVATE-META'}}}},
            {'event': {'type': 'assistant/message', 'data': {'message': {'content': [
                {'type': 'reasoning', 'text': 'PRIVATE-THOUGHT'}, {'type': 'text', 'text': 'Ready session-secret-value api_key="PRIVATE-KEY" <think>PRIVATE-THOUGHT</think> data:image/png;base64,AAAA ' + 'B' * 200}]}}}},
            {'event': {'type': 'error', 'data': {'message': 'PRIVATE-ERROR'}}}]
        output = json.dumps(self.client.history('four'))
        for forbidden in ('PRIVATE-', 'session-secret-value', 'B' * 80, 'AAAA', 'must-not-output'):
            self.assertNotIn(forbidden, output)
        self.assertIn('Ready', output)
        self.assertIn('Bash', output)

    def test_no_proxy(self):
        with patch.dict(os.environ, {'http_proxy': 'http://127.0.0.1:1', 'HTTP_PROXY': 'http://127.0.0.1:1', 'no_proxy': '', 'NO_PROXY': ''}):
            client = MOD.Supervisor(str(self.manifest))
            self.assertEqual(len(client.status('four')), 1)

    def test_manifest_validation(self):
        for jobs in (self.jobs[:2], self.jobs + self.jobs[:1], [self.jobs[0]] * 3):
            self.manifest.write_text(json.dumps({'jobs': jobs}))
            with self.assertRaises(MOD.Failure):
                MOD.load_manifest(str(self.manifest))
        with self.assertRaises(MOD.Failure):
            MOD.load_manifest('relative.json')

    def test_message_limit_and_watch_limit(self):
        self.feedback.write_text('x' * 12001)
        with self.assertRaises(MOD.Failure):
            self.client.send('tanks', str(self.feedback), 'queue')
        with patch.object(MOD.sys, 'argv', ['supervisor.py', '--manifest', str(self.manifest), 'watch', '--seconds', '46']):
            with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as error:
                MOD.main()
            self.assertEqual(error.exception.code, 2)
        self.client.deadline = 0
        with self.assertRaises(MOD.WatchEnded):
            self.client.status()
        self.assertEqual(Handler.requests, [])


if __name__ == '__main__':
    unittest.main()
