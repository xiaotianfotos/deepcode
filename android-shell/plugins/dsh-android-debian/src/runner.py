"""Android Debian compatibility runner. PRoot is NOT a security boundary.

Executed by the existing Bash/job service; records survive engine restarts.
Only the verified bundle is installed. No host environment is passed to Debian.
"""
import ctypes
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import signal
import subprocess
import sys
import tarfile
import time
import uuid


def atomic_json(path, value):
    partial = path.with_suffix('.tmp')
    with partial.open('w') as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.flush()
        os.fsync(stream.fileno())
    partial.replace(path)


def inside(root, path):
    resolved = path.resolve()
    if not resolved.is_relative_to(root.resolve()):
        raise ValueError('Archive path escapes installation directory')
    return resolved


def extract_rootfs(archive, root, check_cancel=lambda: None):
    """Materialize hard links; translate absolute guest symlinks to relative.

    A fresh staging directory is required. All writes are checked after resolving
    existing parent symlinks. Device nodes and other special entries are refused.
    """
    root.mkdir(mode=0o700)
    with tarfile.open(archive, 'r:gz') as source:
        for entry in source:
            check_cancel()
            name = PurePosixPath(entry.name)
            if name.is_absolute() or '..' in name.parts:
                raise ValueError('Unsafe archive member')
            dest = root.joinpath(*name.parts)
            if dest == root:
                continue
            inside(root, dest.parent)
            dest.parent.mkdir(parents=True, exist_ok=True)
            if entry.issym():
                target = (root / entry.linkname.lstrip('/')) if entry.linkname.startswith('/') else dest.parent / entry.linkname
                inside(root, target)
                if dest.exists() or dest.is_symlink():
                    raise ValueError('Duplicate symlink archive member')
                dest.symlink_to(os.path.relpath(target, dest.parent))
            elif entry.isdir():
                inside(root, dest)
                dest.mkdir(exist_ok=True)
                dest.chmod(entry.mode & 0o777 | 0o700)
            elif entry.isfile() or entry.islnk():
                if dest.is_symlink():
                    raise ValueError('Refuse writing over symlink')
                inside(root, dest)
                if entry.islnk():
                    link = PurePosixPath(entry.linkname)
                    if link.is_absolute() or '..' in link.parts:
                        raise ValueError('Unsafe hardlink')
                    original = inside(root, root.joinpath(*link.parts))
                    with original.open('rb') as data, dest.open('xb') as out:
                        shutil.copyfileobj(data, out)
                else:
                    with source.extractfile(entry) as data, dest.open('xb') as out:
                        shutil.copyfileobj(data, out)
                dest.chmod(entry.mode & 0o777 | 0o600)
            else:
                raise ValueError('Unsupported special archive member')


def install(bundle, envdir, reset, check_cancel=lambda: None):
    current = envdir / 'current'
    if current.is_symlink() and not reset:
        return {'installed': True, 'changed': False}
    manifest = json.loads((bundle / 'manifest.json').read_text())
    archive = bundle / 'rootfs.tar.gz'
    with archive.open('rb') as stream:
        if hashlib.file_digest(stream, 'sha256').hexdigest() != manifest['rootfs_sha256']:
            raise ValueError('Rootfs SHA-256 mismatch')
    generations = envdir / 'generations'
    generations.mkdir(exist_ok=True)
    generation = generations / uuid.uuid4().hex
    try:
        extract_rootfs(archive, generation, check_cancel)
        for relative in ['workspace', 'root', 'tmp', 'proc', 'dev', 'etc/apt/apt.conf.d']:
            (generation / relative).mkdir(parents=True, exist_ok=True)
        (generation / 'etc/apt/apt.conf.d/99android').write_text('APT::Sandbox::User "root";\n')
        (generation / 'usr/sbin/policy-rc.d').write_text('#!/bin/sh\nexit 101\n')
        (generation / 'usr/sbin/policy-rc.d').chmod(0o700)
        # Never start daemons as a package post-install side effect.
        atomic_json(generation / '.dsh-debian.json', manifest)
        pointer = envdir / ('current-' + uuid.uuid4().hex)
        check_cancel()
        pointer.symlink_to(os.path.relpath(generation, envdir))
        pointer.replace(current)
        return {'installed': True, 'changed': True, 'generation': generation.name,
                'previousGenerationsRetained': True}
    except BaseException:
        # This invocation's unpublished staging tree only; never user projects.
        shutil.rmtree(generation, ignore_errors=True)
        raise


def proot_spec(bundle, root, workspace, command, dns, tmp, native_loader=None):
    runtime = bundle / 'runtime'
    (root / 'etc/resolv.conf').write_text(''.join('nameserver ' + value + '\n' for value in dns))
    env = {'PATH': '/system/bin', 'LD_LIBRARY_PATH': str(runtime / 'lib'),
           'PROOT_LOADER': str(native_loader or runtime / 'libexec/proot/loader'),
           'PROOT_LOADER_32': str(runtime / 'libexec/proot/loader32'),
           'PROOT_TMP_DIR': str(tmp), 'HOME': '/root', 'TERM': 'xterm-256color'}
    argv = ['/system/bin/linker64', str(runtime / 'bin/proot'), '--kill-on-exit',
            '--link2symlink', '-0', '-r', str(root), '-b', '/dev', '-b', '/proc',
            '-b', str(workspace) + ':/workspace', '-w', '/workspace', '/usr/bin/env', '-i',
            'HOME=/root', 'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
            'TMPDIR=/tmp', 'LANG=C.UTF-8', 'TERM=xterm-256color', 'DEBIAN_FRONTEND=noninteractive',
            '/bin/bash', '-c', command]
    return argv, env


def start_tick(pid):
    return Path(f'/proc/{pid}/stat').read_text().rsplit(')', 1)[1].split()[19]


def parent_death(sig):
    if ctypes.CDLL(None).prctl(1, sig, 0, 0, 0) != 0:
        raise RuntimeError('Cannot register parent-death signal')


def run(request_path):
    request = json.loads(request_path.read_text())
    envdir, bundle = Path(request['environment']), Path(request['bundle'])
    record_path = request_path.with_suffix('.state.json')
    parent = os.getppid()
    host_pid = request.get('ownerPid', parent)
    def host_alive():
        try:
            stat = Path(f'/proc/{host_pid}/stat').read_text().rsplit(')', 1)[1].split()
            return stat[0] not in ('Z', 'X')
        except OSError:
            return False
    child = None
    cancelled = False
    owner_died = False
    def terminate(_signal, _frame):
        nonlocal cancelled, owner_died
        cancelled = True
        owner_died = owner_died or os.getppid() != parent
        if child is not None and child.poll() is None:
            try:
                os.killpg(child.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
    signal.signal(signal.SIGTERM, terminate)
    signal.signal(signal.SIGINT, terminate)
    parent_death(signal.SIGTERM)
    if os.getppid() != parent:
        raise RuntimeError('Owner exited before task started')
    state = {'id': request['id'], 'owner': request['owner'], 'operation': request['operation'],
             'status': 'running', 'pid': os.getpid(), 'startTick': start_tick(os.getpid()),
             'bootId': Path('/proc/sys/kernel/random/boot_id').read_text().strip(),
             'startedAt': time.time(), 'enforcement': 'partial'}
    atomic_json(record_path, state)
    code = 1
    try:
        envdir.mkdir(parents=True, exist_ok=True)
        with (envdir / '.lease').open('a') as lease:
            mode = fcntl.LOCK_EX if request['operation'] == 'install' else fcntl.LOCK_SH
            fcntl.flock(lease, mode | fcntl.LOCK_NB)
            if cancelled:
                raise InterruptedError('Cancelled before start')
            if request['operation'] == 'install':
                def check_cancel():
                    if cancelled:
                        raise InterruptedError('Installation cancelled')
                print(json.dumps(install(bundle, envdir, request.get('reset', False), check_cancel)), flush=True)
                code = 0
            else:
                root = (envdir / 'current').resolve(strict=True)
                workspace = Path(request['workspace']).resolve(strict=True)
                if not workspace.is_dir() or ':' in str(workspace):
                    raise ValueError('Unavailable workspace or unsupported colon in path')
                tmp = envdir / 'tmp'
                tmp.mkdir(exist_ok=True)
                loader = Path(request['nativeLoader'])
                if not loader.is_file():
                    raise ValueError('APK native PRoot loader missing; reinstall the matching Debian APK')
                argv, env = proot_spec(bundle, root, workspace, request['command'], request['dnsServers'], tmp, loader)
                supervisor = os.getpid()
                def child_setup():
                    parent_death(signal.SIGKILL)
                    if os.getppid() != supervisor:
                        os._exit(125)
                child = subprocess.Popen(argv, env=env, start_new_session=True, preexec_fn=child_setup)
                deadline = time.monotonic() + request['timeoutMs'] / 1000
                stopped_at = None
                while child.poll() is None:
                    if time.monotonic() >= deadline:
                        state['timeout'] = True
                        terminate(signal.SIGTERM, None)
                    if cancelled:
                        if stopped_at is None:
                            stopped_at = time.monotonic()
                            terminate(signal.SIGTERM, None)
                        elif time.monotonic() - stopped_at > 3:
                            try:
                                os.killpg(child.pid, signal.SIGKILL)
                            except ProcessLookupError:
                                pass
                    time.sleep(0.1)
                code = child.returncode
        state['status'] = 'interrupted' if owner_died else 'cancelled' if cancelled else 'succeeded' if code == 0 else 'failed'
    except BaseException as error:
        state.update(status='interrupted' if owner_died else 'cancelled' if cancelled else 'failed', error=str(error))
        print(str(error), file=sys.stderr, flush=True)
    finally:
        if not host_alive():
            state['status'] = 'interrupted'
        if cancelled and code == 0:
            code = 130
        state.update(exitCode=code, finishedAt=time.time())
        atomic_json(record_path, state)
    return code if code >= 0 else 128 - code


if __name__ == '__main__':
    sys.exit(run(Path(sys.argv[1])))
