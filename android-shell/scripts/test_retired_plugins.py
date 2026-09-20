import io
import pathlib
import tarfile
import tempfile
import unittest

from retired_plugins import check_archive, copy_member, retire_factory_patch, retire_tree, retired_member

MOUNT = b"- insert:\n    - id: dsh-model-sync\n      name: '@aiwayds/dsh-model-sync'\n"
NEIGHBOR = b"- insert:\n    - id: codex\n      name: relay-dsh-plugin-codex\n"


class RetiredPluginsTest(unittest.TestCase):
    def test_factory_patch_and_idempotence(self):
        for flag in (b'', b'      disabled: true\n', b'      disabled: false\n'):
            result = retire_factory_patch(MOUNT + flag + NEIGHBOR)
            self.assertEqual(result, NEIGHBOR)
            self.assertEqual(retire_factory_patch(result), result)

    def test_comments_preserved_and_custom_mount_rejected_in_factory_image(self):
        source = b'# @aiwayds/dsh-model-sync historical note\n' + MOUNT + NEIGHBOR
        self.assertEqual(retire_factory_patch(source), source.split(MOUNT)[0] + NEIGHBOR)
        for source in (MOUNT + b'      config: {}\n', MOUNT + b'    - id: neighbor\n      name: custom\n'):
            with self.assertRaises(ValueError):
                retire_factory_patch(source)

    def test_tar_roundtrip_preserves_user_data_and_neighbors(self):
        with tempfile.TemporaryDirectory() as tmp:
            source, output = pathlib.Path(tmp)/'old.tar', pathlib.Path(tmp)/'new.tar'
            files = {'home/.dsh/settings.yaml': b'providers: {local: {models: [my-model]}}\n',
                     'home/.dsh/storages/models-store/data.json': b'{"existing":"catalog"}',
                     'home/.dsh/profiles/headless-bad/cordis.patch.yml': MOUNT}
            for profile in ('web', 'headless'):
                prefix = 'home/.dsh/profiles/' + profile
                files[prefix+'/cordis.patch.yml'] = MOUNT + NEIGHBOR
                files[prefix+'/node_modules/@aiwayds/dsh-model-sync/lib/index.js'] = b'old plugin'
                files[prefix+'/node_modules/relay-dsh-plugin-codex/lib/index.js'] = b'codex'
            with tarfile.open(source, 'w') as archive:
                for name, data in files.items():
                    member = tarfile.TarInfo(name); member.size = len(data)
                    archive.addfile(member, io.BytesIO(data))
                link = tarfile.TarInfo('home/.dsh/profiles/web/node_modules/@aiwayds/dsh-model-sync')
                link.type = tarfile.SYMTYPE; link.linkname = '/unused/model-sync'
                archive.addfile(link)
            with self.assertRaises(ValueError):
                check_archive(source)
            with tarfile.open(source) as tin, tarfile.open(output, 'w') as tout:
                for member in tin:
                    if not copy_member(tin, tout, member):
                        tout.addfile(member, tin.extractfile(member) if member.isfile() else None)
            check_archive(output)
            with tarfile.open(output) as archive:
                for name, data in files.items():
                    if retired_member(name):
                        self.assertNotIn(name, archive.getnames())
                    else:
                        expected = NEIGHBOR if name.endswith('/cordis.patch.yml') and 'headless-bad' not in name else data
                        self.assertEqual(archive.extractfile(name).read(), expected)

    def test_tree_cleanup_does_not_follow_package_symlink(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            outside = root/'outside'; outside.mkdir(); (outside/'keep').write_text('keep')
            profile = root/'runtime/home/.dsh/profiles/web'; profile.mkdir(parents=True)
            package = profile/'node_modules/@aiwayds/dsh-model-sync'; package.parent.mkdir(parents=True)
            package.symlink_to(outside, target_is_directory=True)
            (profile/'cordis.patch.yml').write_bytes(MOUNT + NEIGHBOR)
            retire_tree(root/'runtime')
            self.assertFalse(package.is_symlink())
            self.assertEqual((outside/'keep').read_text(), 'keep')
            self.assertEqual((profile/'cordis.patch.yml').read_bytes(), NEIGHBOR)
            retire_tree(root/'runtime')

    def test_tree_rejects_symlinked_parent(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            outside = root/'outside'; outside.mkdir()
            parent = root/'runtime/home/.dsh/profiles'; parent.mkdir(parents=True)
            (parent/'web').symlink_to(outside, target_is_directory=True)
            with self.assertRaises(ValueError):
                retire_tree(root/'runtime')


if __name__ == '__main__':
    unittest.main()
