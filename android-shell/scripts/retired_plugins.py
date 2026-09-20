"""Remove retired factory plugins from build inputs, never from installed user data."""
import argparse
import io
import pathlib
import re
import shutil
import tarfile

PACKAGE = '@aiwayds/dsh-model-sync'
PROFILES = ('web', 'headless')


def retired_member(name):
    parts = pathlib.PurePosixPath(name).parts
    if parts[:3] != ('home', '.dsh', 'profiles') or len(parts) < 6 or parts[3] not in PROFILES:
        return False
    tail = '/'.join(parts[4:])
    return tail == 'node_modules/' + PACKAGE or tail.startswith('node_modules/' + PACKAGE + '/')


def profile_manifest(name):
    parts = pathlib.PurePosixPath(name).parts
    return (len(parts) == 5 and parts[:3] == ('home', '.dsh', 'profiles')
            and parts[3] in PROFILES and parts[4] in ('cordis.yml', 'cordis.patch.yml'))


def retire_factory_patch(data):
    source = data.decode('utf-8')
    blocks = re.split(r'(?m)(?=^- )', source)
    out = []
    for block in blocks:
        lines = [line.split('#', 1)[0].strip() for line in block.splitlines()]
        meaningful = [line for line in lines if line]
        plain = [line for line in meaningful if line not in ('disabled: true', 'disabled: false')]
        if (len(plain) == 3 and plain[:2] == ['- insert:', '- id: dsh-model-sync']
                and plain[2].removeprefix('name: ').strip("'\"") == PACKAGE):
            # Preserve surrounding comments, which can describe the following entry.
            out.extend(line for line in block.splitlines(keepends=True)
                       if not line.strip() or line.lstrip().startswith('#'))
        else:
            out.append(block)
    result = ''.join(out)
    active = '\n'.join(line.split('#', 1)[0] for line in result.splitlines())
    if PACKAGE in active or re.search(r'(?m)^\s*-?\s*id:\s*dsh-model-sync\s*$', active):
        raise ValueError('Custom model-sync mount in build input; remove it explicitly before packaging')
    return result.encode('utf-8')


def copy_member(tin, tout, member):
    """False means the caller still needs to copy/replace this member."""
    if retired_member(member.name):
        return True
    if member.isfile() and profile_manifest(member.name):
        data = retire_factory_patch(tin.extractfile(member).read())
        member.size = len(data)
        tout.addfile(member, io.BytesIO(data))
        return True
    return False


def retire_tree(runtime):
    runtime = pathlib.Path(runtime).resolve()
    # Called only on a verified, disposable extracted release by the staging script.
    for profile in PROFILES:
        base = runtime / 'home/.dsh/profiles' / profile
        target = base / 'node_modules' / PACKAGE
        for path in (base, target.parent):
            if path.resolve() != path.absolute():
                raise ValueError('Refusing symlinked staging parent: ' + str(path))
        for name in ('cordis.yml', 'cordis.patch.yml'):
            path = base / name
            if path.is_symlink():
                raise ValueError('Refusing symlinked staging manifest')
            if path.is_file():
                original = path.read_bytes()
                updated = retire_factory_patch(original)
                if updated != original:
                    path.write_bytes(updated)
        if target.is_symlink():
            target.unlink()
        elif target.exists():
            shutil.rmtree(target)


def check_archive(path):
    with tarfile.open(path, 'r|*') as archive:
        for member in archive:
            if retired_member(member.name):
                raise ValueError('Snapshot still bundles model-sync; restage the runtime and baseline first')
            if member.isfile() and profile_manifest(member.name):
                data = archive.extractfile(member).read()
                if retire_factory_patch(data) != data:
                    raise ValueError('Snapshot still mounts model-sync; restage the runtime and baseline first')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('snapshot')
    args = parser.parse_args()
    check_archive(args.snapshot)
    print('Retired factory plugin check passed')
