#!/usr/bin/env python3
"""Offline deployment safety tests; no ADB or SDK programs are executed."""
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import zipfile

SPEC = importlib.util.spec_from_file_location('deploy_source', Path(__file__).with_name('deploy-source.py'))
DEPLOY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(DEPLOY)


def hashed(data):
    return hashlib.sha256(data).hexdigest()


class FakeDevice:
    serial = 'fixture-serial'
    base = 'http://127.0.0.1:1'

    def __init__(self, installed=True):
        self.installed = installed
        self.commands = []
        self.running = False
        self.marker = 'IDLE'
        self.run_as = True
        self.opener = self

    def open(self, *args, **kwargs):
        return io.BytesIO(b'{"active":null}')

    def command(self, *args, **kwargs):
        self.commands.append(args)
        output, code = b'', 0
        if args[:4] == ('shell', 'pm', 'list', 'packages'):
            output = ('package:'+DEPLOY.PKG+'\n').encode() if self.installed else b''
        elif args[:3] == ('shell', 'pm', 'path'):
            output = b'package:/data/app/fixture/base.apk\n'
        elif args[:2] == ('shell', 'run-as'):
            output, code = self.marker.encode(), 0 if self.run_as else 1
        elif args[0] == 'pull':
            Path(args[2]).write_bytes(b'installed signature fixture')
        elif args[0] == 'install':
            output = b'Success\n'
            self.installed = True
        else:
            raise AssertionError(args)
        return subprocess.CompletedProcess(args, code, output, b'')

    def shell(self, *args, **kwargs):
        self.commands.append(args)
        return {
            ('am', 'get-current-user'): '0',
            ('getprop', 'ro.product.cpu.abi'): 'arm64-v8a',
            ('getprop', 'ro.build.version.sdk'): '36',
            ('getprop', 'ro.product.model'): 'fixture model',
            ('getprop', 'ro.product.device'): 'fixture',
            ('dumpsys', 'package', DEPLOY.PKG): 'versionCode=100 minSdk=26',
            ('am', 'start', '-n', DEPLOY.PKG+'/.MainActivity'): 'Starting',
            ('sha256sum', '/data/app/fixture/base.apk'): self.apk_sha+'  /data/app/fixture/base.apk',
        }[args]

    def read(self, path):
        assert path == 'files/.snapshot-fingerprint'
        return self.snapshot_sha.encode()

    def authenticate(self, **kwargs):
        pass

    def rpc(self, method, args, **kwargs):
        assert method == 'session/list' and args == {'_request': {}}
        return {'items': [{'running': self.running, 'name': 'private fixture title'}]}


class DeploymentTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.apk = self.root/'artifacts/source.apk'
        self.apk.parent.mkdir()
        with zipfile.ZipFile(self.apk, 'w') as archive:
            archive.writestr('assets/snapshot.tar.xz', b'snapshot')
            archive.writestr('lib/arm64-v8a/libfixture.so', b'native')
        self.receipt = {'apk': 'artifacts/source.apk', 'apk_sha256': hashed(self.apk.read_bytes()),
                        'snapshot_sha256': hashed(b'snapshot'),
                        'native_sha256': {'libfixture.so': hashed(b'native')}}
        self.receipt_path = self.root/'artifacts/first-build.json'
        self.receipt_path.write_text(json.dumps(self.receipt))
        self.build = {'apk': self.apk, 'receipt': self.receipt, 'minimum_api': 26,
                      'version': 100, 'certificates': frozenset(['a'*64])}
        self.device = FakeDevice()
        self.device.apk_sha = self.receipt['apk_sha256']
        self.device.snapshot_sha = self.receipt['snapshot_sha256']
        self.sdk = self.root/'sdk'
        self.native = {'dual': {'leasedState': 0, 'working': False},
                       'live': 'idle', 'voice': 'idle', 'desktop': 'idle'}
        for target, value in [('ROOT', self.root), ('certificates', lambda *args: frozenset(['a'*64])),
                              ('native_status', lambda serial: self.native)]:
            patcher = patch.object(DEPLOY, target, value)
            patcher.start()
            self.addCleanup(patcher.stop)

    def assert_no_install(self):
        self.assertFalse(any(command[0] == 'install' for command in self.device.commands))
        self.assertFalse(any(any(token in ('force-stop', 'uninstall', 'clear', '-d') for token in command)
                             for command in self.device.commands))

    def test_candidate_checks_receipt_payload_and_metadata(self):
        metadata = ("package: name='com.dsharnessmobile.shell' versionCode='100'\n"
                    "sdkVersion:'26'\napplication-debuggable\nnative-code: 'arm64-v8a'\n")
        with patch.object(DEPLOY, 'local_command', return_value=metadata):
            self.assertEqual(DEPLOY.candidate(self.receipt_path, self.sdk)['apk'], self.apk)
            self.receipt['native_sha256']['libfixture.so'] = '0'*64
            self.receipt_path.write_text(json.dumps(self.receipt))
            with self.assertRaisesRegex(DEPLOY.Blocked, 'native library differs'):
                DEPLOY.candidate(self.receipt_path, self.sdk)

    def test_default_is_read_only_and_deletes_signature_copy(self):
        result = DEPLOY.deploy(self.device, self.build, self.sdk)
        self.assertEqual(result['status'], 'CHECKED')
        self.assert_no_install()
        copies = [Path(command[2]) for command in self.device.commands if command[0] == 'pull']
        self.assertTrue(copies)
        self.assertTrue(all(not path.exists() for path in copies))

    def test_new_install_has_no_private_state_checks(self):
        self.device.installed = False
        self.assertFalse(DEPLOY.deploy(self.device, self.build, self.sdk)['installed'])
        self.assertFalse(any('run-as' in c for c in self.device.commands))
        self.assert_no_install()

    def test_signing_mismatch_never_installs(self):
        with patch.object(DEPLOY, 'certificates', return_value=frozenset(['b'*64])):
            with self.assertRaisesRegex(DEPLOY.Blocked, 'Signing certificate mismatch'):
                DEPLOY.deploy(self.device, self.build, self.sdk, install=True)
        self.assert_no_install()

    def test_running_agent_never_installs(self):
        self.device.running = True
        with self.assertRaisesRegex(DEPLOY.Blocked, 'Agent is running'):
            DEPLOY.deploy(self.device, self.build, self.sdk, install=True)
        self.assert_no_install()

    def test_unknown_session_running_state_never_installs(self):
        with patch.object(self.device, 'rpc', return_value={'items': [{}]}):
            with self.assertRaisesRegex(DEPLOY.Blocked, 'running state is unknown'):
                DEPLOY.deploy(self.device, self.build, self.sdk, install=True)
        self.assert_no_install()

    def test_run_as_failure_never_installs(self):
        self.device.run_as = False
        with self.assertRaisesRegex(DEPLOY.Blocked, 'run-as cannot read'):
            DEPLOY.deploy(self.device, self.build, self.sdk, install=True)
        self.assert_no_install()

    def test_snapshot_transaction_never_installs(self):
        self.device.marker = 'BUSY'
        with self.assertRaisesRegex(DEPLOY.Blocked, 'Snapshot transaction is active'):
            DEPLOY.deploy(self.device, self.build, self.sdk, install=True)
        self.assert_no_install()

    def test_unknown_or_active_dual_lease_never_installs(self):
        for dual in (None, {}, {'leasedState': 5, 'working': False},
                     {'leasedState': 0, 'working': True}):
            self.native['dual'] = dual
            with self.assertRaises(DEPLOY.Blocked):
                DEPLOY.deploy(self.device, self.build, self.sdk, install=True)
        self.assert_no_install()

    def test_downgrade_never_installs(self):
        self.build['version'] = 99
        with self.assertRaisesRegex(DEPLOY.Blocked, 'downgrading is prohibited'):
            DEPLOY.deploy(self.device, self.build, self.sdk, install=True)
        self.assert_no_install()

    def test_successful_install_starts_and_verifies_ready(self):
        result = DEPLOY.deploy(self.device, self.build, self.sdk, install=True, timeout=1)
        self.assertEqual(result['status'], 'INSTALLED_AND_READY')
        installs = [command for command in self.device.commands if command[0] == 'install']
        self.assertEqual(installs, [('install', '-r', '-t', str(self.apk))])
        self.assertIn(('am', 'start', '-n', DEPLOY.PKG+'/.MainActivity'), self.device.commands)

    def test_state_race_rechecked_before_install(self):
        calls = 0

        def status(serial):
            nonlocal calls
            calls += 1
            if calls == 2:
                return {**self.native, 'voice': 'recording'}
            return self.native

        with patch.object(DEPLOY, 'native_status', side_effect=status):
            with self.assertRaisesRegex(DEPLOY.Blocked, 'Voice capture'):
                DEPLOY.deploy(self.device, self.build, self.sdk, install=True)
        self.assert_no_install()

    def test_readiness_timeout_does_not_stop_app(self):
        with patch.object(DEPLOY.time, 'monotonic', side_effect=[0, 2]):
            with self.assertRaisesRegex(DEPLOY.Blocked, 'left running'):
                DEPLOY.wait_ready(self.device, self.build, timeout=1)
        self.assert_no_install()


if __name__ == '__main__':
    unittest.main()
