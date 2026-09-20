#!/usr/bin/env python3
"""Offline regression checks for bootstrap integrity and operator consent boundaries."""
import contextlib
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import stat
import subprocess
import tarfile
import tempfile
import unittest
from unittest.mock import patch
import zipfile

SPEC = importlib.util.spec_from_file_location("bootstrap_host", Path(__file__).with_name("bootstrap-android-host.py"))
HOST = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(HOST)


class BootstrapHostTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)

    def test_external_paths_and_conflicting_sdk(self):
        java, sdk = HOST.homes(self.root, {"JAVA_HOME": "/opt/java17", "ANDROID_SDK_ROOT": "/opt/sdk"})
        self.assertEqual(java, Path("/opt/java17"))
        self.assertEqual(sdk, Path("/opt/sdk"))
        with self.assertRaises(HOST.BootstrapError):
            HOST.homes(self.root, {"ANDROID_HOME": "/one", "ANDROID_SDK_ROOT": "/two"})
        self.assertEqual(HOST.homes(self.root, {}), (self.root / ".tools/jdk17", self.root / ".tools/android-sdk"))

    def test_checksum_or_size_mismatch_fails_closed(self):
        archive = self.root / "archive"
        archive.write_bytes(b"known")
        entry = {"name": "archive", "digest": "sha256:" + hashlib.sha256(b"known").hexdigest(), "size": 5}
        HOST.verify_archive(archive, entry)
        entry["size"] = 6
        with self.assertRaises(HOST.BootstrapError):
            HOST.verify_archive(archive, entry)
        entry["size"] = 5
        archive.write_bytes(b"other")
        with self.assertRaises(HOST.BootstrapError):
            HOST.verify_archive(archive, entry)

    def test_corrupt_cached_archive_is_not_downloaded_or_extracted(self):
        (self.root / "docs").mkdir()
        cache = self.root / ".tools/downloads"
        cache.mkdir(parents=True)
        (cache / "tool.zip").write_bytes(b"corrupt")
        (self.root / "docs/download-sources.json").write_text(json.dumps([
            {"name": "tool.zip", "url": "https://example.org/tool.zip", "digest": "sha256:" + "0" * 64}
        ]))
        with patch.object(HOST.urllib.request, "urlopen") as request:
            with self.assertRaises(HOST.BootstrapError):
                HOST.download(self.root, "tool.zip")
            request.assert_not_called()

    def test_zip_traversal_and_symlink_rejected(self):
        for name, mode in [("../escaped", stat.S_IFREG | 0o644), ("link", stat.S_IFLNK | 0o777)]:
            archive = self.root / "bad.zip"
            with zipfile.ZipFile(archive, "w") as bundle:
                member = zipfile.ZipInfo(name)
                member.external_attr = mode << 16
                bundle.writestr(member, b"payload")
            with self.assertRaises(HOST.BootstrapError):
                HOST.extract(archive, self.root / "out")
        self.assertFalse((self.root / "escaped").exists())

    def test_tar_link_escape_rejected(self):
        archive = self.root / "bad.tar.gz"
        with tarfile.open(archive, "w:gz") as bundle:
            member = tarfile.TarInfo("jdk/link")
            member.type = tarfile.SYMTYPE
            member.linkname = "../../outside"
            bundle.addfile(member)
        with self.assertRaises(HOST.BootstrapError):
            HOST.extract(archive, self.root / "out")

    def test_cmdline_layout_and_permissions(self):
        archive = self.root / "tools.zip"
        with zipfile.ZipFile(archive, "w") as bundle:
            for name, content, mode in [
                ("cmdline-tools/source.properties", b"Pkg.Revision=12.0\n", 0o644),
                ("cmdline-tools/bin/sdkmanager", b"#!/bin/sh\nexit 0\n", 0o755),
                ("cmdline-tools/lib/manager.jar", b"fixture", 0o644),
            ]:
                member = zipfile.ZipInfo(name)
                member.external_attr = (stat.S_IFREG | mode) << 16
                bundle.writestr(member, content)
        destination = self.root / "sdk/cmdline-tools/12.0"
        with patch.object(HOST, "download", return_value=archive):
            HOST.install_archive(self.root, destination, HOST.SDK_ARCHIVE, False, {})
        self.assertEqual(HOST.check_cmdline(self.root / "sdk"), destination / "bin/sdkmanager")
        self.assertFalse((destination / "cmdline-tools").exists())

    def test_existing_destination_never_overwritten(self):
        destination = self.root / "jdk17"
        destination.mkdir()
        marker = destination / "keep"
        marker.write_text("unchanged")
        with patch.object(HOST, "download") as download:
            with self.assertRaises(HOST.BootstrapError):
                HOST.install_archive(self.root, destination, HOST.JDK_ARCHIVE, True, {})
            download.assert_not_called()
        self.assertEqual(marker.read_text(), "unchanged")

    def test_license_acceptance_requires_explicit_flag(self):
        manager = self.root / "sdkmanager"
        with patch.object(HOST.subprocess, "run", return_value=subprocess.CompletedProcess([], 0)) as run:
            HOST.sdk_install(manager, self.root, [], {}, False)
            run.assert_not_called()
            HOST.sdk_install(manager, self.root, [], {}, True)
            self.assertIn("--licenses", run.call_args.args[0])
            self.assertEqual(run.call_args.kwargs["input"], "y\n" * 256)

    def test_package_install_does_not_implicitly_accept_licenses(self):
        with patch.object(HOST.subprocess, "run", return_value=subprocess.CompletedProcess([], 0)) as run:
            with self.assertRaises(HOST.BootstrapError):
                HOST.sdk_install(self.root / "sdkmanager", self.root, ["platform-tools"], {}, False)
            self.assertEqual(run.call_args.kwargs["stdin"], subprocess.DEVNULL)
            self.assertNotIn("input", run.call_args.kwargs)

    def test_check_is_read_only_and_reports_all_missing_packages(self):
        with patch.object(HOST, "ROOT", self.root), patch.dict(os.environ, {}, clear=True), \
             patch.object(HOST, "check_system", return_value=[]), \
             patch.object(HOST, "download") as download, patch.object(HOST, "sdk_install") as install, \
             contextlib.redirect_stdout(io.StringIO()) as output, contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(HOST.main(["--check"]), 1)
            self.assertIn("ndk;27.2.12479018", output.getvalue())
            download.assert_not_called()
            install.assert_not_called()
        self.assertEqual(list(self.root.iterdir()), [])


if __name__ == "__main__":
    unittest.main()
