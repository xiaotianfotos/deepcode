#!/usr/bin/env python3
"""Audit the actual Git index (or reachable history), without printing secrets.

This is a deterministic publication gate, not a proof that all credentials,
personal information or software vulnerabilities have been discovered.
"""
import argparse
import fnmatch
import hashlib
import json
import pathlib
import re
import subprocess
import sys

RULES = {
    'private-key': rb'-----BEGIN (?:OPENSSH |RSA |EC |DSA )?PRIVATE KEY-----',
    'provider-token': rb'\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{24,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{25,}|AKIA[A-Z0-9]{16})\b',
    'jwt': rb'\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{15,}',
    'credential-literal': rb'''(?i)["']?(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|authorization|cookie)["']?\s*[:=]\s*["']([^"'\r\n]{12,})["']''',
    'url-userinfo': rb'https?://[^\s/"<>]+:[^\s/@"<>]+@',
    'url-secret': rb'[?&](?:token|access_token|refresh_token|code)=[A-Za-z0-9._~-]{16,}',
    'machine-ip': rb'192\.168\.100\.[0-9]+',
    'machine-home': rb'/home/[a-z][a-z0-9_-]*/(?:work|\.codex|videos)/',
    'device-serial': rb'adb-[a-fA-F0-9]{16}-',
}
PREFIXES = ('.local/', '.tools/', '.xring-lab/', 'downloads/', 'artifacts/',
            'logs/', 'upstream/', 'D:/', 'docs/validation/', 'evidence/',
            'asr-lab/evidence/', 'docs/research/', 'docs/reports/', 'android-shell/keystore/',
            'android-shell/app/src/debug/assets/',
            'platform-diagnostics/',
            'scripts/sme-lab/',
            'android-shell/plugins/dsh-client-skin-mist/',
            'android-shell/plugins/dsh-client-voice-lark-a2/',
            'android-shell/plugins/voice-plugin-import/original-deck/')
GLOBS = ('*.apk', '*.aab', '*.keystore', '*.jks', '*.p12', '*.pfx', '*.pem',
         '*.key', '*.credentials.yaml', '*.gguf', '*.safetensors', '*.hprof',
         '*.log', '*.tar.gz', '*.tar.xz', '*.tgz')
SEGMENTS = {'.npm-cache', '.npm', '_cacache', 'node_modules', '.gradle', '.gradle-home', '__pycache__', '.codex', '.dsh'}
FILENAMES = {'auth.json', 'credentials.json', 'adbkey', 'adbkey.pub', 'local.properties'}


# Reviewed one-off files remain local even when sanitized or force-added.
LOCAL_ONLY_FILES = {
    'docs/CODEX-BACKEND-RESEARCH.md',
    'docs/FORCED-ALIGNER-O3-INVESTIGATION.md',
    'docs/MEDIA-RUNTIME-RESEARCH.zh-CN.md',
    'docs/PAD9-ACCEPTANCE.md',
    'docs/PAD9-HYPERFRAMES.md',
    'docs/PAD9-XIAOAI-MIMO.md',
    'docs/QWEN3-ASR-ANDROID-LAB.md',
    'docs/REPOSITORY-CLEANUP-20260913.md',
    'docs/VOICE-DECK-IMPORT-REVIEW.md',
    'docs/XIAOMI-18-FOLD-PREFLIGHT.md',
    'docs/XIAOMI-PLATFORM-DIAGNOSTICS.md',
    'docs/XRING-NPU-RESEARCH.md',
    'docs/XRING-O1-COMMUNITY-RESEARCH.md',
    'docs/HYPEROS4-BACKGROUND-ACCEPTANCE.md',
    'PLAN.md',
    'RESEARCH.zh-CN.md',
    'docs/VOICE-PERFORMANCE-MILESTONE.md',
    'docs/PHONE-APP-SELFHOST.md',
    'scripts/install-mist-skin.py',
    'scripts/test-mist-skin.mjs',
    'scripts/build-platform-diagnostics.py',
    'scripts/test-platform-diagnostics.py',
}


def git(*args):
    return subprocess.check_output(['git', *args], stderr=subprocess.DEVNULL)


def forbidden(path):
    parts = pathlib.PurePosixPath(path).parts
    name = parts[-1]
    return (path in LOCAL_ONLY_FILES or path.startswith(PREFIXES) or bool(set(parts) & SEGMENTS)
            or any(re.fullmatch(r'[A-Za-z]:', part) for part in parts)
            or name in FILENAMES or any(fnmatch.fnmatch(name, g) for g in GLOBS)
            or (name.startswith('.env') and name != '.env.example'))


def inspect(path, data, mode, allow):
    findings = []
    if forbidden(path):
        findings.append({'path': path, 'rule': 'local-only-path'})
    if mode == '160000':
        findings.append({'path': path, 'rule': 'unreviewed-gitlink'})
        return findings
    if mode == '120000':
        target = data.decode(errors='replace')
        if target.startswith('/') or '..' in pathlib.PurePosixPath(target).parts:
            findings.append({'path': path, 'rule': 'external-symlink'})
    if len(data) > 5 * 1024 * 1024:
        findings.append({'path': path, 'rule': 'large-file', 'bytes': len(data)})
    if b'\0' in data[:4096]:
        # Graphics and wrapper are known assets; other binaries require an exact reviewed hash.
        if not (path.endswith(('.png', '.webp')) or path == 'android-shell/gradle/wrapper/gradle-wrapper.jar'):
            fingerprint = hashlib.sha256(data).hexdigest()
            if (path, 'unreviewed-binary', fingerprint) not in allow:
                findings.append({'path': path, 'rule': 'unreviewed-binary',
                                 'fingerprint': fingerprint})
        return findings
    for rule, pattern in RULES.items():
        for match in re.finditer(pattern, data):
            fingerprint = hashlib.sha256(match.group()).hexdigest()
            if (path, rule, fingerprint) in allow:
                continue
            findings.append({'path': path, 'rule': rule,
                             'line': data[:match.start()].count(b'\n') + 1,
                             'fingerprint': fingerprint})
    return findings


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--history', metavar='REF', help='scan objects reachable from this ref; never pushes refs')
    parser.add_argument('--report', help='save metadata-only JSON report')
    args = parser.parse_args()
    try:
        # Read the allowlist from the same index being reviewed, not an unstaged file.
        raw = git('show', ':scripts/repository-audit-allowlist.json')
    except subprocess.CalledProcessError:
        raw = b'[]'
    allow = {(r['path'], r['rule'], r['fingerprint']) for r in json.loads(raw)}
    entries = []
    if args.history:
        if args.history.startswith('-'):
            parser.error('REF must not be an option')
        for row in git('rev-list', '--objects', args.history).decode().splitlines():
            oid, _, path = row.partition(' ')
            if path:
                entries.append((oid, path, 'history'))
    else:
        for row in git('ls-files', '--stage', '-z').decode().split('\0'):
            if not row:
                continue
            metadata, path = row.split('\t', 1)
            mode, oid, stage = metadata.split()
            if stage != '0':
                raise RuntimeError('Resolve index conflicts before auditing')
            entries.append((oid, path, mode))
    findings, checked = [], 0
    with subprocess.Popen(['git', 'cat-file', '--batch'], stdin=subprocess.PIPE,
                          stdout=subprocess.PIPE) as proc:
        for oid, path, mode in entries:
            if mode == '160000':
                findings.extend(inspect(path, b'', mode, allow))
                continue
            proc.stdin.write((oid + '\n').encode())
            proc.stdin.flush()
            header = proc.stdout.readline().decode().split()
            if len(header) != 3:
                raise RuntimeError('Cannot read Git object')
            data = proc.stdout.read(int(header[2]))
            proc.stdout.read(1)
            if header[1] != 'blob':
                continue
            checked += 1
            rows = inspect(path, data, mode, allow)
            for row in rows:
                if args.history:
                    row['object'] = oid
            findings.extend(rows)
        proc.stdin.close()
    result = {'scope': args.history or 'index', 'checkedBlobs': checked,
              'findings': findings, 'passed': not findings}
    if args.report:
        pathlib.Path(args.report).write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'scope': result['scope'], 'checkedBlobs': checked,
                      'findings': len(findings), 'passed': result['passed']}))
    for item in findings[:40]:
        print(f"{item['rule']}: {item['path']}:{item.get('line', '')}")
    return 1 if findings else 0


if __name__ == '__main__':
    sys.exit(main())
