"""Local app-domain helpers. Never depends on ADB or a desktop service."""
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys
import uuid

FILES = Path('/data/user/0/com.dsharnessmobile.shell/files')
HOME_DIR = FILES / 'home'
PREFIX = FILES / 'usr'


def network():
    return json.loads((FILES / 'network-dns.json').read_text())


def native_dir():
    return Path(network()['nativeLibraryDir'])


def debian(workspace, argv, timeout=600):
    """Use the installed Debian runner's lease/cancellation/cleanup policy."""
    envdir = HOME_DIR / '.dsh/debian'
    jobs = envdir / 'jobs'
    jobs.mkdir(parents=True, exist_ok=True)
    identity = 'media-' + uuid.uuid4().hex
    request = dict(id=identity, owner='android-media-skill', ownerPid=os.getpid(),
        operation='exec', environment=str(envdir), bundle=str(PREFIX / 'share/dsh-debian'),
        workspace=str(Path(workspace).resolve(strict=True)), reset=False,
        command=shlex.join([str(a) for a in argv]), timeoutMs=timeout * 1000,
        nativeLoader=str(native_dir() / 'libdsh_proot_loader.so'), dnsServers=network()['servers'])
    path = jobs / (identity + '.json')
    with path.open('x') as f:
        json.dump(request, f)
    path.chmod(0o600)
    runner = HOME_DIR / '.dsh/profiles/web/node_modules/@dsh-android/dsh-android-debian/lib/runner.py'
    subprocess.run([sys.executable, str(runner), str(path)], check=True)
    state = json.loads(path.with_suffix('.state.json').read_text())
    if state.get('status') != 'succeeded' or state.get('exitCode') != 0:
        raise RuntimeError('Debian job failed: ' + str(path.with_suffix('.state.json')))
