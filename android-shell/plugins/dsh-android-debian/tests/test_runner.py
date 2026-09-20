import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('runner', Path(__file__).parents[1] / 'src/runner.py')
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class InstallerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.base = Path(self.temp.name)
        self.archive = self.base / 'input.tar.gz'
        self.root = self.base / 'root'

    def tearDown(self):
        self.temp.cleanup()

    def archive_entries(self, entries):
        with tarfile.open(self.archive, 'w:gz') as archive:
            for name, kind, target in entries:
                entry = tarfile.TarInfo(name)
                entry.type = kind
                if kind == tarfile.REGTYPE:
                    data = target.encode()
                    entry.size = len(data)
                    archive.addfile(entry, io.BytesIO(data))
                else:
                    entry.linkname = target
                    archive.addfile(entry)

    def test_hardlinks_are_independent_files(self):
        self.archive_entries([('usr/bin/a', tarfile.REGTYPE, 'hello'), ('usr/bin/b', tarfile.LNKTYPE, 'usr/bin/a')])
        runner.extract_rootfs(self.archive, self.root)
        a, b = self.root/'usr/bin/a', self.root/'usr/bin/b'
        self.assertEqual(a.read_bytes(), b.read_bytes())
        self.assertNotEqual(a.stat().st_ino, b.stat().st_ino)

    def test_absolute_guest_symlink_and_merged_usr(self):
        self.archive_entries([('./', tarfile.DIRTYPE, ''), ('usr/bin/a', tarfile.REGTYPE, 'hello'), ('bin', tarfile.SYMTYPE, '/usr/bin')])
        runner.extract_rootfs(self.archive, self.root)
        self.assertEqual((self.root/'bin/a').read_text(), 'hello')
        self.assertFalse((self.root/'bin').readlink().is_absolute())

    def test_path_traversal_is_rejected(self):
        for name in ['../escape', '/absolute']:
            with self.subTest(name=name):
                self.archive_entries([(name, tarfile.REGTYPE, 'bad')])
                if self.root.exists(): self.root.rmdir()
                with self.assertRaises(ValueError): runner.extract_rootfs(self.archive, self.root)

    def test_symlink_escape_is_rejected(self):
        self.archive_entries([('evil', tarfile.SYMTYPE, '../outside'), ('evil/secret', tarfile.REGTYPE, 'bad')])
        with self.assertRaises(ValueError): runner.extract_rootfs(self.archive, self.root)
        self.assertFalse((self.base/'outside').exists())

    def test_special_nodes_are_rejected(self):
        self.archive_entries([('dev/evil', tarfile.CHRTYPE, '')])
        with self.assertRaises(ValueError): runner.extract_rootfs(self.archive, self.root)

    def test_existing_root_is_not_overwritten(self):
        self.root.mkdir()
        (self.root/'user-file').write_text('keep')
        self.archive_entries([])
        with self.assertRaises(FileExistsError): runner.extract_rootfs(self.archive, self.root)
        self.assertEqual((self.root/'user-file').read_text(), 'keep')

    def test_failed_rebuild_preserves_current(self):
        bundle, envdir = self.base/'bundle', self.base/'env'
        bundle.mkdir(); envdir.mkdir()
        old = envdir/'old'; old.mkdir(); (old/'marker').write_text('keep')
        (envdir/'current').symlink_to('old')
        (bundle/'rootfs.tar.gz').write_bytes(b'corrupt')
        (bundle/'manifest.json').write_text(json.dumps({'rootfs_sha256': '0'*64}))
        with self.assertRaises(ValueError): runner.install(bundle, envdir, True)
        self.assertEqual((envdir/'current/marker').read_text(), 'keep')

    def test_cancelled_rebuild_preserves_current(self):
        bundle, envdir = self.base/'bundle', self.base/'env'
        bundle.mkdir(); envdir.mkdir()
        old = envdir/'old'; old.mkdir(); (old/'marker').write_text('keep')
        (envdir/'current').symlink_to('old')
        self.archive_entries([('a',tarfile.REGTYPE,'text')])
        data=self.archive.read_bytes()
        (bundle/'rootfs.tar.gz').write_bytes(data)
        (bundle/'manifest.json').write_text(json.dumps({'rootfs_sha256':runner.hashlib.sha256(data).hexdigest()}))
        def cancel(): raise InterruptedError('cancel')
        with self.assertRaises(InterruptedError): runner.install(bundle, envdir, True, cancel)
        self.assertEqual((envdir/'current/marker').read_text(), 'keep')
        self.assertEqual(list((envdir/'generations').iterdir()), [])

    def test_guest_environment_is_explicit(self):
        self.root.mkdir(); (self.root/'etc').mkdir()
        argv, env=runner.proot_spec(self.base, self.root, self.base/'中文 空格', 'echo "$HOME"', ['10.0.2.3'], self.base)
        self.assertNotIn('LD_PRELOAD',env)
        self.assertNotIn('DEEPSEEK_API_KEY',env)
        self.assertIn(str(self.base/'中文 空格')+':/workspace',argv)
        self.assertEqual(argv[-1],'echo "$HOME"')
        self.assertIn('--kill-on-exit',argv)
        self.assertNotIn('-R',argv)
        self.assertNotIn('-S',argv)


if __name__ == '__main__': unittest.main()
