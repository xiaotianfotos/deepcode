#!/usr/bin/env python3
"""Check/install the Linux x86_64 host toolchain without changing system packages.

Only the two pinned archives in docs/download-sources.json are downloaded here.
Android SDK packages are installed by Google's sdkmanager. No device is accessed.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import platform
import re
import shlex
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
JDK_ARCHIVE = "OpenJDK17U-jdk_x64_linux_hotspot_17.0.20.1_1.tar.gz"
SDK_ARCHIVE = "commandlinetools-linux-11076708_latest.zip"
PACKAGES = {
    "platform-tools": ("platform-tools", "adb"),
    "platforms;android-36": ("platforms/android-36", "android.jar"),
    "build-tools;35.0.0": ("build-tools/35.0.0", "lib/d8.jar"),
    "ndk;27.2.12479018": ("ndk/27.2.12479018", "toolchains/llvm/prebuilt/linux-x86_64/bin/clang"),
}
SYSTEM_TOOLS = ("git", "node", "npm", "cmake", "ninja", "tar", "xz", "curl", "unzip", "cc", "c++", "make", "dpkg-deb")


class BootstrapError(RuntimeError):
    pass


def homes(root: Path, env: dict[str, str]) -> tuple[Path, Path]:
    java = Path(env.get("JAVA_HOME") or root / ".tools/jdk17").expanduser().absolute()
    android = Path(env.get("ANDROID_HOME") or env.get("ANDROID_SDK_ROOT") or root / ".tools/android-sdk").expanduser().absolute()
    if env.get("ANDROID_HOME") and env.get("ANDROID_SDK_ROOT"):
        if Path(env["ANDROID_HOME"]).expanduser().resolve() != Path(env["ANDROID_SDK_ROOT"]).expanduser().resolve():
            raise BootstrapError("ANDROID_HOME and ANDROID_SDK_ROOT disagree; select one SDK before continuing")
    return java, android


def command_version(command: list[str], env: dict[str, str]) -> str:
    try:
        result = subprocess.run(command, env=env, stdin=subprocess.DEVNULL,
                                stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                text=True, timeout=30, check=False)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise BootstrapError(f"Cannot run {command[0]}: {exc}") from exc
    if result.returncode:
        raise BootstrapError(f"{command[0]} exited {result.returncode}: {result.stdout.strip()[:300]}")
    return result.stdout.strip()


def check_system(env: dict[str, str]) -> list[str]:
    errors = []
    supported = platform.system() == "Linux" and platform.machine() in ("x86_64", "AMD64")
    print(f"{'OK' if supported else 'FAIL'} host: {platform.system()} {platform.machine()} (required Linux x86_64)")
    if not supported:
        errors.append("unsupported host: Linux x86_64 required")
    python_ok = sys.version_info >= (3, 11)
    print(f"{'OK' if python_ok else 'FAIL'} Python: {platform.python_version()} (required >=3.11)")
    if not python_ok:
        errors.append("Python >=3.11 required")
    for name in SYSTEM_TOOLS:
        executable = shutil.which(name, path=env.get("PATH"))
        try:
            if not executable:
                raise BootstrapError("not found in PATH")
            # unzip uses -v; all remaining required commands support --version.
            version = command_version([executable, "-v" if name == "unzip" else "--version"], env)
            if name == "node" and not re.match(r"v22\.", version):
                raise BootstrapError(f"Node 22.x required, found {version}")
            print(f"OK {name}: {version.splitlines()[0]} [{executable}]")
        except BootstrapError as exc:
            errors.append(f"{name}: {exc}")
            print(f"FAIL {errors[-1]}")
    if errors:
        print("System tools are never installed by this script. On Debian/Ubuntu, an operator may run:")
        print("  sudo apt-get install python3 python3-venv git curl unzip xz-utils tar cmake ninja-build build-essential dpkg-dev ca-certificates")
        print("Install Python >=3.11 and Node 22.x with npm from your trusted distribution/channel if unavailable.")
    return errors


def properties(path: Path) -> dict[str, str]:
    if not path.is_file():
        return {}
    return dict(line.split("=", 1) for line in path.read_text().splitlines()
                if "=" in line and not line.lstrip().startswith("#"))


def revision(path: Path) -> str:
    return {key.strip(): value.strip() for key, value in properties(path / "source.properties").items()}.get("Pkg.Revision", "")


def check_java(java: Path, env: dict[str, str]) -> None:
    for command in ("java", "javac"):
        output = command_version([str(java / "bin" / command), "-version"], env)
        if not re.search(r'(?:version\s+"|javac\s+)17(?:[.\s"]|$)', output):
            raise BootstrapError(f"{java}: JDK 17 required; {output.splitlines()[0]}")
        print(f"OK {command}: {output.splitlines()[0]} [{java}]")


def check_cmdline(android: Path) -> Path:
    folder = android / "cmdline-tools/12.0"
    manager = folder / "bin/sdkmanager"
    if revision(folder) != "12.0" or not os.access(manager, os.X_OK) or not (folder / "lib").is_dir():
        raise BootstrapError(f"Missing/incomplete Command-Line Tools 12.0 at {folder}")
    print(f"OK Command-Line Tools: 12.0 [{folder}]")
    return manager


def package_problem(android: Path, name: str) -> str | None:
    folder, required = PACKAGES[name]
    location = android / folder
    if not (location / required).is_file():
        return f"{name}: missing {location / required}"
    found = revision(location)
    expected = {"build-tools;35.0.0": "35.0.0", "ndk;27.2.12479018": "27.2.12479018"}.get(name)
    if not found or (expected and found != expected):
        return f"{name}: source.properties revision {found!r}, expected {expected or 'an installed revision'}"
    if name == "platforms;android-36":
        props = {k.strip(): v.strip() for k, v in properties(location / "source.properties").items()}
        if props.get("AndroidVersion.ApiLevel") != "36":
            return f"{name}: AndroidVersion.ApiLevel must be 36"
    # Check executables used by downstream compilation/signing, not just directories.
    binaries = {"platform-tools": ["adb"], "build-tools;35.0.0": ["aapt2", "zipalign", "apksigner"],
                "ndk;27.2.12479018": [required]}.get(name, [])
    for binary in binaries:
        if not os.access(location / binary, os.X_OK):
            return f"{name}: missing executable {location / binary}"
    return None


def verify_archive(path: Path, entry: dict) -> None:
    algorithm, expected = entry["digest"].split(":", 1)
    if algorithm not in ("sha256", "sha1") or not re.fullmatch(r"[0-9a-f]+", expected) or len(expected) != {"sha256": 64, "sha1": 40}[algorithm]:
        raise BootstrapError(f"Invalid pinned digest for {entry['name']}")
    with path.open("rb") as stream:
        actual = hashlib.file_digest(stream, algorithm).hexdigest()
    if actual != expected or ("size" in entry and path.stat().st_size != entry["size"]):
        raise BootstrapError(f"Archive checksum/size mismatch: {path}; refusing extraction. Remove the invalid archive and retry.")


def download(root: Path, name: str) -> Path:
    entries = json.loads((root / "docs/download-sources.json").read_text())
    matches = [entry for entry in entries if entry["name"] == name]
    if len(matches) != 1 or not matches[0]["url"].startswith("https://"):
        raise BootstrapError(f"Missing/ambiguous HTTPS download pin: {name}")
    entry = matches[0]
    directory = root / ".tools/downloads"
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / name
    if target.exists():
        verify_archive(target, entry)
        return target
    print(f"Download pinned archive: {entry['url']}", flush=True)
    with tempfile.NamedTemporaryFile(dir=directory, prefix=name + ".", suffix=".part", delete=False) as output:
        temporary = Path(output.name)
        try:
            with urllib.request.urlopen(entry["url"], timeout=90) as response:
                if not response.geturl().startswith("https://"):
                    raise BootstrapError("Refusing a non-HTTPS download redirect")
                shutil.copyfileobj(response, output, length=1024 * 1024)
            output.close()
            verify_archive(temporary, entry)
            temporary.rename(target)
        finally:
            temporary.unlink(missing_ok=True)
    return target


def safe_member(name: str, destination: Path) -> Path:
    relative = PurePosixPath(name)
    if relative.is_absolute() or ".." in relative.parts or "\\" in name:
        raise BootstrapError(f"Unsafe archive member: {name}")
    result = destination.joinpath(*relative.parts)
    if not result.resolve().is_relative_to(destination.resolve()):
        raise BootstrapError(f"Archive member escapes destination: {name}")
    return result


def extract(archive: Path, destination: Path) -> None:
    # Extraction is deliberately serial: Python validates every member/link before
    # writing; these one-off gzip/ZIP toolchain archives have no parallel decoder.
    if zipfile.is_zipfile(archive):
        with zipfile.ZipFile(archive) as bundle:
            for member in bundle.infolist():
                target = safe_member(member.filename, destination)
                mode = member.external_attr >> 16
                if stat.S_ISLNK(mode):
                    raise BootstrapError(f"Unexpected ZIP symlink: {member.filename}")
                if member.is_dir():
                    target.mkdir(parents=True, exist_ok=True)
                else:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with bundle.open(member) as source, target.open("xb") as output:
                        shutil.copyfileobj(source, output)
                    target.chmod((mode & 0o777) or 0o644)
    else:
        with tarfile.open(archive, "r:gz") as bundle:
            for member in bundle:
                target = safe_member(member.name, destination)
                if member.issym() or member.islnk():
                    link = PurePosixPath(member.linkname)
                    base = target.parent if member.issym() else destination
                    if link.is_absolute() or not (base / member.linkname).resolve().is_relative_to(destination.resolve()):
                        raise BootstrapError(f"Unsafe archive link: {member.name}")
                elif not (member.isfile() or member.isdir()):
                    raise BootstrapError(f"Unsupported archive member: {member.name}")
                bundle.extract(member, destination, set_attrs=True, numeric_owner=False)
                if not member.issym():
                    target.chmod(member.mode & 0o777)


def install_archive(root: Path, destination: Path, name: str, java: bool, env: dict[str, str]) -> None:
    if destination.exists() or destination.is_symlink():
        raise BootstrapError(f"Refusing to overwrite existing toolchain: {destination}")
    archive = download(root, name)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".bootstrap-", dir=destination.parent) as temporary:
        staging = Path(temporary)
        extract(archive, staging)
        children = list(staging.iterdir())
        if len(children) != 1 or not children[0].is_dir():
            raise BootstrapError(f"Unexpected top-level archive layout: {name}")
        content = children[0]
        if java:
            check_java(content, env)
        elif content.name != "cmdline-tools" or revision(content) != "12.0" or not os.access(content / "bin/sdkmanager", os.X_OK) or not (content / "lib").is_dir():
            raise BootstrapError("Command-Line Tools archive does not contain the expected 12.0 layout")
        if destination.exists() or destination.is_symlink():
            raise BootstrapError(f"Destination appeared during installation: {destination}")
        content.rename(destination)
    print(f"Installed {destination}")


def sdk_install(manager: Path, android: Path, names: list[str], env: dict[str, str], accept: bool) -> None:
    if accept:
        print("Accepting Android SDK licenses as explicitly requested by --accept-licenses", flush=True)
        # Only this explicitly authorized subprocess receives affirmative input.
        result = subprocess.run([str(manager), f"--sdk_root={android}", "--licenses"],
                                input="y\n" * 256, text=True, env=env, check=False)
        if result.returncode:
            raise BootstrapError(f"sdkmanager --licenses failed ({result.returncode})")
    if names:
        print("Installing SDK packages: " + ", ".join(names), flush=True)
        result = subprocess.run([str(manager), f"--sdk_root={android}", *names],
                                stdin=subprocess.DEVNULL, env=env, check=False)
        missing = [problem for name in names if (problem := package_problem(android, name))]
        if result.returncode or missing:
            raise BootstrapError("SDK installation incomplete. Read/accept the licenses interactively with "
                                 f"{shlex.quote(str(manager))} --sdk_root={shlex.quote(str(android))} --licenses, "
                                 "or rerun with explicit --accept-licenses. " + "; ".join(missing))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--check", action="store_true", help="read-only local check; no network or installation")
    mode.add_argument("--install", action="store_true", help="install missing tools (default)")
    parser.add_argument("--accept-licenses", action="store_true", help="explicitly accept Android SDK licenses")
    args = parser.parse_args(argv)
    if args.check and args.accept_licenses:
        parser.error("--accept-licenses cannot be combined with --check")
    try:
        env = os.environ.copy()
        java, android = homes(ROOT, env)
        env.update(JAVA_HOME=str(java), ANDROID_HOME=str(android), ANDROID_SDK_ROOT=str(android),
                   ANDROID_USER_HOME=str(ROOT / ".tools/android-user"))
        env["PATH"] = os.pathsep.join([str(java / "bin"), str(android / "cmdline-tools/12.0/bin"),
                                      str(android / "platform-tools"), str(android / "emulator"),
                                      str(ROOT / ".tools/node/node_modules/.bin"), str(ROOT / ".tools/bin"),
                                      env.get("PATH", "")])
        errors = check_system(env)
        if not args.check and errors:
            raise BootstrapError("Resolve the host requirements above before installation")
        if not args.check:
            if not java.exists() and not java.is_symlink():
                if os.environ.get("JAVA_HOME"):
                    raise BootstrapError(f"Explicit JAVA_HOME does not exist: {java}; unset it to install locally")
                install_archive(ROOT, java, JDK_ARCHIVE, True, env)
            check_java(java, env)
            cli = android / "cmdline-tools/12.0"
            if not cli.exists() and not cli.is_symlink():
                install_archive(ROOT, cli, SDK_ARCHIVE, False, env)
            manager = check_cmdline(android)
            missing = []
            for name, (folder, _) in PACKAGES.items():
                if package_problem(android, name):
                    if (android / folder).exists() or (android / folder).is_symlink():
                        raise BootstrapError(f"Existing SDK package is incomplete or incompatible; inspect it manually: {android / folder}")
                    missing.append(name)
            sdk_install(manager, android, missing, env, args.accept_licenses)
        else:
            for check in (lambda: check_java(java, env), lambda: check_cmdline(android)):
                try:
                    check()
                except BootstrapError as exc:
                    errors.append(str(exc))
                    print(f"FAIL {exc}")
        for name in PACKAGES:
            problem = package_problem(android, name)
            if problem:
                errors.append(problem)
                print(f"FAIL {problem}")
            else:
                print(f"OK {name}: revision {revision(android / PACKAGES[name][0])}")
        print("Activate in your Bash shell:")
        print(f"  export JAVA_HOME={shlex.quote(str(java))} ANDROID_HOME={shlex.quote(str(android))} ANDROID_SDK_ROOT={shlex.quote(str(android))}")
        print(f"  source {shlex.quote(str(ROOT / 'scripts/env.sh'))}")
        if errors:
            print(f"Host toolchain incomplete: {len(errors)} requirement(s) failed", file=sys.stderr)
            return 1
        print("Host toolchain ready. This does not build an APK or validate runtime inputs.")
        return 0
    except (BootstrapError, OSError, ValueError, tarfile.TarError, zipfile.BadZipFile) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
