"""Publication-gate regressions; no access to devices or real credentials."""
import hashlib
import importlib.util
import json
import pathlib
import subprocess
import sys
import tempfile
import unittest

SCRIPT = pathlib.Path(__file__).with_name('audit-repository.py').resolve()
spec = importlib.util.spec_from_file_location('audit', SCRIPT)
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class AuditTests(unittest.TestCase):
    def test_local_paths(self):
        for path in ['docs/validation/capture.png', '.local/env', 'keys/signing.jks',
                     'plugins/demo/node_modules', 'packages/ui/D:/cache/marker',
                     'packages/ui/.npm-cache/marker', 'packages/ui/_cacache/entry', 'work/.env.production', 'models/m.gguf',
                     'docs/research/proposal.md', 'docs/reports/run.md',
                     'docs/HYPEROS4-BACKGROUND-ACCEPTANCE.md',
                     'RESEARCH.zh-CN.md', 'platform-diagnostics/app/build.gradle.kts',
                     'scripts/sme-lab/probe.c', 'scripts/install-mist-skin.py',
                     'android-shell/plugins/dsh-client-skin-mist/src/index.ts',
                     'android-shell/plugins/dsh-client-voice-lark-a2/src/index.ts',
                     'android-shell/plugins/voice-plugin-import/original-deck/package.json']:
            self.assertTrue(audit.forbidden(path), path)
        self.assertFalse(audit.forbidden('.env.example'))
        self.assertFalse(audit.forbidden('src/Engine.kt'))
        for path in ['scripts/build-voice-engine.py', 'scripts/build-asr-lab.py',
                     'android-shell/plugins/voice-plugin-import/harness-integration.patch',
                     'android-shell/plugins/dsh-client-ui-voice-deck/src/client/index.ts']:
            self.assertFalse(audit.forbidden(path), path)
        self.assertFalse(audit.forbidden('docs/DEVICE-ACCEPTANCE.md'))
        self.assertFalse(audit.forbidden('scripts/test-agent-background.py'))
        self.assertFalse(audit.forbidden('docs/REPOSITORY-HYGIENE.md'))

    def test_sanitized_report_in_index(self):
        with tempfile.TemporaryDirectory() as folder:
            root = pathlib.Path(folder)
            subprocess.run(['git', 'init', '-q'], cwd=root, check=True)
            report = root / 'docs/HYPEROS4-BACKGROUND-ACCEPTANCE.md'
            report.parent.mkdir()
            report.write_text('# One-off run\nNo credentials or device identifiers.\n')
            subprocess.run(['git', 'add', str(report.relative_to(root))], cwd=root, check=True)
            result = subprocess.run([sys.executable, str(SCRIPT)], cwd=root,
                                    capture_output=True, text=True)
            self.assertEqual(result.returncode, 1)
            self.assertIn('local-only-path', result.stdout)

    def test_key_and_binary(self):
        key = b'-----BEGIN ' + b'PRIVATE KEY-----'
        self.assertTrue(audit.inspect('src/key.txt', key, '100644', set()))
        self.assertTrue(audit.inspect('payload.bin', b'\0binary', '100644', set()))
        self.assertFalse(audit.inspect('app/icon.png', b'\x89PNG\0', '100644', set()))

    def test_binary_exception_is_content_and_path_bound(self):
        path, data = 'app/animation.mp4', b'\0reviewed video'
        allow = {(path, 'unreviewed-binary', hashlib.sha256(data).hexdigest())}
        self.assertFalse(audit.inspect(path, data, '100644', allow))
        self.assertTrue(audit.inspect(path, data + b'changed', '100644', allow))
        self.assertTrue(audit.inspect('app/other.mp4', data, '100644', allow))
        for name, payload, rule in [('.local/capture.mp4', data, 'local-only-path'),
                                    (path, b'\0' * (5 * 1024 * 1024 + 1), 'large-file')]:
            exception = {(name, 'unreviewed-binary', hashlib.sha256(payload).hexdigest())}
            self.assertIn(rule, [f['rule'] for f in audit.inspect(name, payload, '100644', exception)])

    def test_links_and_gitlinks(self):
        self.assertTrue(audit.inspect('link', b'/outside', '120000', set()))
        self.assertTrue(audit.inspect('link', b'../outside', '120000', set()))
        self.assertTrue(audit.inspect('vendor/repo', b'', '160000', set()))

    def test_actual_index_and_history(self):
        with tempfile.TemporaryDirectory() as folder:
            root = pathlib.Path(folder)
            def git(*args):
                return subprocess.run(['git', *args], cwd=root, check=True,
                                      capture_output=True)
            git('init', '-q')
            p = root / 'config.txt'
            p.write_text('api_key="' + 'sk-' + 'x' * 32 + '"\n')
            git('add', 'config.txt')
            # A sanitized working file MUST NOT hide a secret already staged.
            p.write_text('safe placeholder\n')
            report = root / 'report.json'
            def run(*args):
                return subprocess.run([sys.executable, str(SCRIPT), '--report', str(report), *args],
                                      cwd=root, capture_output=True, text=True)
            result = run()
            self.assertEqual(result.returncode, 1)
            self.assertNotIn('x' * 32, result.stdout + report.read_text())
            git('-c', 'user.name=Audit Test', '-c', 'user.email=audit@example.invalid',
                'commit', '-qm', 'synthetic historical fixture')
            git('add', 'config.txt')
            self.assertEqual(run().returncode, 0)
            self.assertEqual(run('--history', 'HEAD').returncode, 1)


if __name__ == '__main__':
    unittest.main()
