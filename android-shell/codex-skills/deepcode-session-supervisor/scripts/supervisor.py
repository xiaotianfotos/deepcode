#!/usr/bin/env python3
"""Device-local, three-worker DeepCode monitor. Standard library only.

Run using the DeepCode Termux Python (same app UID), not adb shell:
  python supervisor.py --manifest /absolute/jobs.json status
  python supervisor.py --manifest /absolute/jobs.json history --job hockey
  python supervisor.py --manifest /absolute/jobs.json send --job hockey \
      --mode queue --message-file /absolute/feedback.txt
  python supervisor.py --manifest /absolute/jobs.json watch --seconds 40

Manifest: {"jobs": [{"key": "hockey", "id": "session-...",
  "workspace": "/storage/emulated/0/work/...", "package": "com.example.hockey"}, ...]}
Exactly three distinct workers; never include the supervisor itself. This helper
does not grant an OS security boundary to a full-access agent. It restricts its
own API surface; no model/settings changes, arbitrary RPC, or ADB are exposed.
"""
import argparse
import json
import pathlib
import re
import sys
import time
import urllib.error
import urllib.request
import uuid
import xml.etree.ElementTree as ET

BASE = 'http://127.0.0.1:3080'
AUTH = pathlib.Path('/data/user/0/com.dsharnessmobile.shell/shared_prefs/dsh_engine_auth.xml')
LIMIT = 16 * 1024 * 1024


class Failure(Exception):
    """Only fixed, non-sensitive messages may cross the CLI boundary."""


class Cursor(Failure):
    def __init__(self, value):
        self.value = value


class WatchEnded(Failure):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise Failure('Engine redirect refused')


def read_bounded(path, maximum):
    try:
        with path.open('rb') as stream:
            value = stream.read(maximum + 1)
        if len(value) > maximum:
            raise Failure('Input exceeds size limit')
        return value.decode('utf-8')
    except (OSError, UnicodeError):
        raise Failure('Cannot read input file') from None


def absolute_path(value):
    path = pathlib.Path(value)
    if not path.is_absolute():
        raise Failure('An absolute file path is required')
    return path


def load_manifest(path):
    try:
        value = json.loads(read_bounded(absolute_path(path), 65536))
        rows = value['jobs']
        if not isinstance(rows, list) or len(rows) != 3:
            raise ValueError()
        jobs = {}
        ids = set()
        for row in rows:
            key, sid, workspace, package = (row[k] for k in ('key', 'id', 'workspace', 'package'))
            if not all(isinstance(v, str) for v in (key, sid, workspace, package)):
                raise ValueError()
            if not re.fullmatch(r'[a-z][a-z0-9_-]{0,39}', key):
                raise ValueError()
            if not re.fullmatch(r'session-[A-Za-z0-9-]{1,100}', sid):
                raise ValueError()
            if not pathlib.PurePosixPath(workspace).is_absolute() or len(workspace) > 512:
                raise ValueError()
            if any(ord(c) < 32 for c in workspace) or '..' in pathlib.PurePosixPath(workspace).parts:
                raise ValueError()
            if not re.fullmatch(r'[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+', package):
                raise ValueError()
            if key in jobs or sid in ids:
                raise ValueError()
            jobs[key] = dict(key=key, id=sid, workspace=workspace, package=package)
            ids.add(sid)
        return jobs
    except (KeyError, TypeError, ValueError):
        raise Failure('Manifest must contain exactly three unique valid workers') from None


class Supervisor:
    def __init__(self, manifest):
        self.jobs = load_manifest(manifest)
        try:
            prefs = ET.fromstring(read_bounded(AUTH, 65536))
            cookie = next(n.text for n in prefs if n.get('name') == 'cookie')
            if not cookie or '\n' in cookie or '\r' in cookie:
                raise ValueError()
        except (ET.ParseError, StopIteration, ValueError):
            raise Failure('DeepCode authentication cookie unavailable') from None
        self._secrets = [cookie] + [part.split('=', 1)[-1].strip() for part in cookie.split(';')]
        self._opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
        self._opener.addheaders = [('Cookie', cookie)]
        self.deadline = None

    def text(self, value, limit=500):
        if not isinstance(value, str):
            return ''
        # Scrub before truncating so truncation cannot expose half a credential.
        for secret in self._secrets:
            if secret:
                value = value.replace(secret, '[redacted]')
        value = re.sub(r'(?is)<(?:think|reasoning)>.*?(?:</(?:think|reasoning)>|$)', '[reasoning omitted]', value)
        value = re.sub(r'(?i)data:[^\s)]+', '[media omitted]', value)
        value = re.sub(r'(?i)(?:authorization|cookie)\s*[:=][^\n]*', '[credential omitted]', value)
        value = re.sub(r'''(?ix)["']?(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|token)["']?\s*[:=]\s*["']?[^\s,"'&}]+''', '[credential omitted]', value)
        value = re.sub(r'(?i)\bBearer\s+\S+|\bsk-[A-Za-z0-9_-]+', '[credential omitted]', value)
        value = re.sub(r'[A-Za-z0-9+/=_-]{80,}', '[long encoded value omitted]', value)
        value = re.sub(r'[\x00-\x08\x0b-\x1f\x7f]', '', value)
        return value[:limit] + ('…' if len(value) > limit else '')

    def job(self, key):
        if key not in self.jobs:
            raise Failure('Worker is not in the manifest allowlist')
        return self.jobs[key]

    def _rpc(self, method, args):
        # Validate even internal calls, so future wrappers cannot silently expand access.
        allowed_ids = {job['id'] for job in self.jobs.values()}
        if method == 'session/list':
            valid = args == {'_request': {}}
        elif method == 'session/page':
            request = args.get('request', {})
            address = request.get('address', {})
            valid = (set(args) == {'request'} and set(request) == {'address', 'throughSeq', 'maxMessages'}
                     and set(address) == {'kind', 'sessionId'} and address.get('kind') == 'session'
                     and address.get('sessionId') in allowed_ids and request.get('maxMessages') == 50
                     and type(request.get('throughSeq')) is int)
        elif method == 'session/prompt':
            request = args.get('request', {})
            content = request.get('content', [])
            valid = (set(args) == {'request'}
                     and set(request) == {'sessionId', 'requestId', 'mode', 'content'}
                     and request.get('sessionId') in allowed_ids and request.get('mode') in ('queue', 'steer')
                     and isinstance(content, list) and len(content) == 1
                     and set(content[0]) == {'type', 'text'} and content[0].get('type') == 'text'
                     and isinstance(content[0].get('text'), str) and 0 < len(content[0]['text']) <= 12000)
        else:
            valid = False
        if not valid:
            raise Failure('RPC outside supervisor allowlist refused')
        body = {'type': 'client-request', 'rpcId': 'supervisor-' + uuid.uuid4().hex,
                'method': method, 'payload': {'args': args}}
        request = urllib.request.Request(BASE + '/api/' + method, data=json.dumps(body).encode(),
                                         headers={'Content-Type': 'application/json'})
        timeout = 4
        if self.deadline is not None:
            remaining = self.deadline - time.monotonic()
            if remaining <= 0:
                raise WatchEnded()
            timeout = min(timeout, remaining)
        try:
            with self._opener.open(request, timeout=timeout) as response:
                raw = response.read(LIMIT + 1)
            if len(raw) > LIMIT:
                raise Failure('Engine response exceeds bounded history limit')
            result = json.loads(raw).get('result', {})
        except (OSError, ValueError, urllib.error.URLError):
            raise Failure('Local engine request failed; check DeepCode is running') from None
        if result.get('ok') is not True:
            # Only parse the pinned rc.1 cursor diagnostic; never print raw RPC errors.
            error = result.get('error', {})
            match = re.search(r'is past cursor (-?\d+)', str(error.get('message', '')))
            if method == 'session/page' and match:
                raise Cursor(int(match.group(1)))
            raise Failure('Engine rejected the bounded worker request')
        return result.get('value')

    def records(self, key):
        job = self.job(key)
        request = {'address': {'kind': 'session', 'sessionId': job['id']},
                   'throughSeq': 2147483647, 'maxMessages': 50}
        try:
            self._rpc('session/page', {'request': request})
            raise Failure('Pinned history cursor protocol changed')
        except Cursor as cursor:
            request['throughSeq'] = cursor.value
        result = self._rpc('session/page', {'request': request})
        if not isinstance(result, dict) or not isinstance(result.get('records'), list):
            raise Failure('Unexpected history response')
        return result['records'][-50:]

    def history(self, key):
        self.job(key)
        return self._project_history(self.records(key))

    def _project_history(self, records):
        output = []
        for row in records:
            event = row.get('event', {})
            kind, data = event.get('type'), event.get('data', {})
            if kind not in ('assistant/message', 'tool/call', 'tool/result', 'turn/end', 'turn/start', 'error'):
                continue
            item = {'type': kind, 'seq': event.get('seq'), 'time': event.get('time')}
            if kind == 'assistant/message':
                blocks = data.get('message', {}).get('content', [])
                item['text'] = self.text('\n'.join(b.get('text', '') for b in blocks if b.get('type') == 'text'))
                if not item['text']:
                    continue
            elif kind == 'tool/call':
                item['tool'] = self.text(data.get('name'), 100)
            elif kind == 'tool/result':
                # Tool content/arguments/meta may carry secrets, base64 or reasoning.
                item['completed'] = True
            elif kind == 'turn/end':
                item['reason'] = self.text(data.get('reason'), 100)
            elif kind == 'error':
                item['error'] = 'Worker reported an error; inspect its dedicated chat'
            output.append(item)
        return output[-50:]

    def status(self, key=None):
        keys = [self.job(key)['key']] if key is not None else list(self.jobs)
        listing = self._rpc('session/list', {'_request': {}})
        if not isinstance(listing, dict) or not isinstance(listing.get('items'), list):
            raise Failure('Unexpected session list response')
        # Never serialize other sessions, their titles or model configuration.
        items = {row.get('sessionId'): row for row in listing['items'] if row.get('sessionId') in {self.jobs[k]['id'] for k in keys}}
        output = []
        for worker in keys:
            job = self.jobs[worker]
            item = items.get(job['id'])
            status = {'job': worker, 'id': job['id'], 'exists': item is not None}
            if item is not None:
                records = self.records(worker)
                events = self._project_history(records)
                status.update(running=bool(item.get('running')), updatedAt=item.get('updatedAt'), recent=events[-5:])
                status['lastAssistant'] = next((e['text'] for e in reversed(events) if e['type'] == 'assistant/message'), '')
                status['lastEventTime'] = events[-1].get('time') if events else None
                # Streaming/reasoning chunks are activity even though their contents
                # are intentionally absent from the human-readable projection.
                activity = next((row['event'] for row in reversed(records)
                                 if isinstance(row.get('event'), dict)), {})
                status['lastActivitySeq'] = activity.get('seq') if type(activity.get('seq')) is int else None
                status['lastActivityTime'] = activity.get('time') if type(activity.get('time')) in (int, float) else None
            output.append(status)
        return output

    def send(self, key, message_file, mode):
        job = self.job(key)
        if mode not in ('queue', 'steer'):
            raise Failure('Send requires an explicit queue or steer mode')
        message = read_bounded(absolute_path(message_file), 12000).strip()
        if not message:
            raise Failure('Feedback is empty')
        request_id = uuid.uuid4().hex
        result = self._rpc('session/prompt', {'request': {'sessionId': job['id'], 'requestId': request_id,
                          'mode': mode, 'content': [{'type': 'text', 'text': message}]}})
        if not isinstance(result, dict) or result.get('accepted') is not True:
            raise Failure('Worker did not acknowledge feedback')
        return {'job': key, 'accepted': True, 'mode': mode, 'requestId': request_id}


def emit(value):
    print(json.dumps(value, ensure_ascii=False), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', required=True)
    commands = parser.add_subparsers(dest='command', required=True)
    commands.add_parser('status').add_argument('--job')
    commands.add_parser('history').add_argument('--job', required=True)
    send = commands.add_parser('send')
    send.add_argument('--job', required=True)
    send.add_argument('--mode', choices=('queue', 'steer'), required=True)
    send.add_argument('--message-file', required=True)
    watch = commands.add_parser('watch')
    watch.add_argument('--job')
    watch.add_argument('--seconds', type=int, choices=range(1, 46), default=40, metavar='1..45')
    args = parser.parse_args()
    try:
        client = Supervisor(args.manifest)
        if args.command == 'status':
            emit(client.status(args.job))
        elif args.command == 'history':
            emit({'job': args.job, 'events': client.history(args.job)})
        elif args.command == 'send':
            emit(client.send(args.job, args.message_file, args.mode))
        else:
            deadline, previous = time.monotonic() + args.seconds, None
            client.deadline = deadline
            while time.monotonic() < deadline:
                try:
                    current = client.status(args.job)
                except WatchEnded:
                    break
                except Failure:
                    if time.monotonic() >= deadline:
                        break
                    raise
                if current != previous:
                    emit({'changed': current})
                    previous = current
                remaining = deadline - time.monotonic()
                if remaining > 0:
                    time.sleep(min(5, remaining))
            emit({'watchEnded': True})
    except Failure as error:
        emit({'error': str(error)})
        return 1
    except KeyboardInterrupt:
        emit({'cancelled': True})
        return 130
    except Exception:
        emit({'error': 'Unexpected local response; no raw diagnostic printed'})
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
