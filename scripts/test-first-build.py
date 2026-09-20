#!/usr/bin/env python3
"""Offline safety checks for the first-build archive and download boundary."""
import importlib.util
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('first_build',Path(__file__).with_name('first-build.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class FirstBuildTests(unittest.TestCase):
    def test_rejects_bad_cached_snapshot_without_network(self):
        with tempfile.TemporaryDirectory() as directory:
            file=Path(directory)/'snapshot.xz';file.write_bytes(b'wrong archive')
            with patch.object(module,'ARCHIVE',file),patch.object(module.urllib.request,'urlopen') as request:
                with self.assertRaisesRegex(RuntimeError,'checksum mismatch'):module.fetch_base()
                request.assert_not_called()

    def test_pack_normalizes_private_modes_preserves_symlink(self):
        with tempfile.TemporaryDirectory() as directory:
            work=Path(directory);runtime=work/'runtime';(runtime/'usr/bin').mkdir(parents=True);(runtime/'home').mkdir()
            (runtime/'usr/bin/app').write_bytes(b'\x7fELFfake');(runtime/'home/data').write_bytes(b'public fixture')
            (runtime/'home/script').write_text('#!/bin/sh\ntrue\n')
            (runtime/'usr/bin/alias').symlink_to('/data/data/com.dsharnessmobile.shell/files/usr/bin/app')
            target=work/'snapshot.tar.xz'
            with patch.object(module,'WORK',work):module.pack_runtime(runtime,target)
            with tarfile.open(target) as archive:
                self.assertEqual(archive.getmember('home').mode,0o700)
                self.assertEqual(archive.getmember('home/data').mode,0o600)
                self.assertEqual(archive.getmember('usr/bin/app').mode,0o700)
                self.assertEqual(archive.getmember('home/script').mode,0o700)
                self.assertTrue(archive.getmember('usr/bin/alias').issym())
                self.assertEqual(archive.extractfile('home/data').read(),b'public fixture')
            self.assertFalse((work/'snapshot.tar').exists())

    def test_package_copy_omits_source_maps_and_dependencies(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);source=root/'source';(source/'lib').mkdir(parents=True);(source/'node_modules').mkdir()
            (source/'package.json').write_text('{"name":"@fixture/plugin"}')
            (source/'lib/index.js').write_text('export {}');(source/'lib/index.js.map').write_text('private-path')
            (source/'node_modules/secret').write_text('do not copy')
            module.copy_package(source,root/'profile')
            dest=root/'profile/node_modules/@fixture/plugin'
            self.assertTrue((dest/'lib/index.js').exists())
            self.assertFalse((dest/'lib/index.js.map').exists())
            self.assertFalse((dest/'node_modules').exists())

if __name__=='__main__':unittest.main()
