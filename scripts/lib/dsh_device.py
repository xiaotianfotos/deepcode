"""Shared debug-device access. Authentication stays in memory, reports never contain tokens."""
import hashlib
import http.cookiejar
import json
import pathlib
import re
import subprocess
import time
import urllib.error
import urllib.request
import uuid
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parents[2]
PKG = 'com.dsharnessmobile.shell'

class Device:
    def __init__(self, serial):
        self.serial = serial
        self.adb = ['adb', '-s', serial]
        self.base = None
        self.opener = None
        self.port = None

    def command(self, *args, check=True, timeout=30):
        return subprocess.run(self.adb + list(args), capture_output=True, timeout=timeout, check=check)

    def shell(self, *args, check=True):
        return self.command('shell', *args, check=check).stdout.decode().strip()

    def read(self, path):
        return self.command('exec-out', 'run-as', PKG, 'cat', path).stdout

    def exists(self, path):
        return self.command('shell', 'run-as', PKG, 'test', '-e', path, check=False).returncode == 0

    def emulator_only(self):
        if not self.serial.startswith('emulator-') or self.shell('getprop', 'ro.kernel.qemu') != '1':
            raise RuntimeError('Fault injection is restricted to a dedicated emulator')
        if self.exists('files/.snapshot-transaction'):
            raise RuntimeError('Snapshot transaction is active; do not interrupt it')

    def connect(self):
        if self.base is None:
            self.port = int(self.command('forward', 'tcp:0', 'tcp:3080').stdout.decode().strip())
            self.base = f'http://127.0.0.1:{self.port}'

    def status(self):
        self.connect()
        try:
            with urllib.request.urlopen(self.base + '/', timeout=2) as r:
                return r.status
        except urllib.error.HTTPError as e:
            return e.code
        except OSError:
            return None

    def authenticate(self, timeout=120):
        self.connect()
        # A long-lived engine can rotate away its one-time launch-token line.
        # Reuse the shell's existing cookie in memory before inspecting logs.
        try:
            prefs = ET.fromstring(self.read('shared_prefs/dsh_engine_auth.xml'))
            cookie = next(n.text for n in prefs if n.get('name') == 'cookie')
            if cookie:
                opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
                opener.addheaders = [('Cookie', cookie)]
                with opener.open(self.base + '/', timeout=3) as response:
                    if response.status == 200:
                        self.opener = opener
                        return
        except (OSError, ET.ParseError, StopIteration, subprocess.SubprocessError):
            pass
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if self.status() == 401:
                log = self.command('exec-out', 'run-as', PKG, 'cat', 'files/engine.log', check=False).stdout.decode(errors='replace')
                tokens = re.findall(r'http://127\.0\.0\.1:3080/\?token=([A-Za-z0-9_.~-]+)', log)
                if tokens:
                    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
                    try:
                        with opener.open(self.base + '/?token=' + tokens[-1], timeout=3) as response:
                            if response.status == 200:
                                self.opener = opener
                                return
                    except OSError:
                        pass
            time.sleep(1)
        raise RuntimeError('Engine authentication did not become ready')

    def rpc(self, method, args, timeout=30):
        if self.opener is None:
            self.authenticate()
        body = {'type':'client-request', 'rpcId':'validation-' + uuid.uuid4().hex,
                'method': method, 'payload': {'args': args}}
        req = urllib.request.Request(self.base + '/api/' + method,
            data=json.dumps(body).encode(), headers={'Content-Type':'application/json'})
        try:
            with self.opener.open(req, timeout=timeout) as r:
                response = json.load(r)
        except urllib.error.HTTPError as e:
            raise RuntimeError(f'RPC HTTP failure: {method} status {e.code}') from None
        result = response.get('result', {})
        if result.get('ok') is not True:
            error = result.get('error', {})
            raise RuntimeError(f'RPC {method}: {error.get("code")} {error.get("message")}')
        return result.get('value')

    def app_pid(self):
        return self.shell('pidof', PKG, check=False)

    def engine_pids(self):
        # Inspect command lines in memory, expose only PIDs. Match the exact owned engine path.
        listing = self.shell('ps', '-A', '-o', 'PID,ARGS')
        needles = [f'{root}/{PKG}/files/usr/lib/node_modules/@deepseek-ai/dsh/lib/bin.js'
                   for root in ['/data/data', '/data/user/0']]
        return [int(line.split(None, 1)[0]) for line in listing.splitlines()[1:]
                if any(needle in line for needle in needles) and ' web' in line]

    def file_digest(self, path):
        return hashlib.sha256(self.read(path)).hexdigest()

    def close(self):
        if self.port is not None:
            self.command('forward', '--remove', f'tcp:{self.port}', check=False)
            self.port, self.base, self.opener = None, None, None

    def session_records(self, session_id):
        # Diagnostic-only fallback to discover a bounded history cut without a
        # persistent WebSocket. Pinned 0.1.2-rc.1 reports its cursor on an overrun;
        # fail explicitly if that diagnostic changes on a future upgrade.
        request={'address':{'kind':'session','sessionId':session_id},'throughSeq':2147483647,'maxMessages':100}
        try:
            self.rpc('session/page',{'request':request})
            raise RuntimeError('Unexpected history cursor size')
        except RuntimeError as error:
            match=re.search(r'is past cursor (-?\d+)',str(error))
            if not match:raise
            request['throughSeq']=int(match.group(1))
        return self.rpc('session/page',{'request':request})['records']
