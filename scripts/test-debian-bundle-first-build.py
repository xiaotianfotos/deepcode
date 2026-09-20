#!/usr/bin/env python3
"""Create a real tiny .deb and exercise bundle preparation in an empty checkout."""
from pathlib import Path
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
import unittest

class DebianBundleFirstBuild(unittest.TestCase):
    @unittest.skipUnless(shutil.which('dpkg-deb'), 'dpkg-deb required for real archive test')
    def test_fresh_input_parents_created(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);(root/'scripts').mkdir();(root/'docs').mkdir()
            shutil.copy2(Path(__file__).with_name('prepare-debian-bundle.py'),root/'scripts/prepare-debian-bundle.py')
            package=root/'package';(package/'DEBIAN').mkdir(parents=True)
            (package/'DEBIAN/control').write_text('Package: fixture\nVersion: 1\nArchitecture: all\nMaintainer: Fixture <fixture@example.invalid>\nDescription: Offline test fixture\n')
            usr=package/'data/data/com.termux/files/usr'
            for name in ['bin/proot','lib/libtalloc.so','lib/libandroid-shmem.so','libexec/proot/loader','libexec/proot/loader32']:
                f=usr/name;f.parent.mkdir(parents=True,exist_ok=True);f.write_bytes(b'public test fixture')
            inputs=root/'downloads/debian/arm64';inputs.mkdir(parents=True)
            deb=inputs/'fixture.deb';subprocess.run(['dpkg-deb','--build',str(package),str(deb)],check=True,stdout=subprocess.DEVNULL)
            rootfs=inputs/'rootfs.tar.gz';rootfs.write_bytes(b'rootfs fixture checked by digest only')
            digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
            lock={'distribution':'fixture','architectures':{'arm64':{'packages':[{'url':'https://example.invalid/fixture.deb','sha256':digest(deb)}], 'rootfs':{'sha256':digest(rootfs)}}}}
            (root/'docs/debian-inputs.lock.json').write_text(json.dumps(lock))
            subprocess.run([sys.executable,str(root/'scripts/prepare-debian-bundle.py'),'arm64'],check=True,stdout=subprocess.DEVNULL)
            bundle=root/'.tools/debian-bundle/arm64'
            self.assertTrue((bundle/'manifest.json').exists())
            self.assertEqual((bundle/'runtime/lib/libtalloc.so.2').read_bytes(),b'public test fixture')
            self.assertTrue((root/'android-shell/app/src/main/jniLibs/arm64-v8a/libdsh_proot_loader.so').exists())

if __name__=='__main__':unittest.main()
