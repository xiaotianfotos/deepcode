#!/usr/bin/env python3
"""On-device audio/video -> local ASR -> forced alignment -> JSON/SRT."""
import argparse
import base64
import ctypes
import fcntl
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import signal
import socket
import subprocess
import tempfile
import time
import urllib.request
import wave

from device_runtime import FILES, HOME_DIR, native_dir, debian
from segment import segment
from export_result import export

CHILDREN = set()


def stop(proc):
    if proc.poll() is None:
        try:
            os.killpg(proc.pid, signal.SIGTERM)
            proc.wait(timeout=5)
        except ProcessLookupError:
            pass
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid, signal.SIGKILL)
            proc.wait()
    CHILDREN.discard(proc)


def spawn(argv, env, log):
    parent = os.getpid()
    def child_setup():
        if ctypes.CDLL(None).prctl(1, signal.SIGKILL, 0, 0, 0) != 0 or os.getppid() != parent:
            os._exit(125)
    proc = subprocess.Popen([str(a) for a in argv], env=env, stdout=log,
                            stderr=subprocess.STDOUT, start_new_session=True, preexec_fn=child_setup)
    CHILDREN.add(proc)
    return proc


def status(**data):
    print(json.dumps(data, ensure_ascii=False), flush=True)


def doctor():
    nd = native_dir()
    models = Path('/storage/emulated/0/work/models')
    paths = {
        'asr': nd / 'libdsh_voice_server.so', 'vad': nd / 'libdsh_vad.so',
        'asrCompatibility': nd / 'libdsh_voice_compat.so',
        'alignerCpu': nd / 'libdsh_aligner.so', 'alignerVulkan': nd / 'libdsh_aligner_vulkan.so',
        'asrModel': models / 'qwen3-asr/Qwen3-ASR-0.6B-Q8_0.gguf',
        'mmproj': models / 'qwen3-asr/mmproj-Qwen3-ASR-0.6B-Q8_0.gguf',
        'alignerModel': models / 'qwen3-forced-aligner/qwen3-forced-aligner-0.6b-q8_0.gguf',
        'ffmpeg': HOME_DIR / '.dsh/debian/current/usr/bin/ffmpeg',
    }
    result = {'ok': all(p.is_file() for p in paths.values()),
              'paths': {k: {'path': str(p), 'exists': p.is_file()} for k, p in paths.items()}}
    return result, paths


def start_asr(paths, mode, argv, env, scratch, request):
    """Try optimized CPU, then one compatibility attempt; cancellation propagates."""
    attempts = []
    choices = ['kleidiai', 'compatibility'] if mode == 'auto' else ['compatibility']
    for choice in choices:
        binary = paths['asr'] if choice == 'kleidiai' else paths['asrCompatibility']
        started = time.monotonic()
        proc = None
        try:
            with (scratch / ('asr-'+choice+'.log')).open('wb') as log:
                proc = spawn([binary, *argv[1:]], env, log)
            while time.monotonic()-started < 90:
                if proc.poll() is not None:
                    raise RuntimeError('ASR process exited during loading')
                try:
                    if request('/health').get('status') == 'ok':
                        attempts.append({'engine': choice, 'ok': True, 'loadMs': round((time.monotonic()-started)*1000)})
                        return proc, choice, attempts
                except OSError:
                    pass
                time.sleep(.25)
            raise RuntimeError('ASR startup timed out')
        except (OSError, RuntimeError):
            if proc is not None:
                stop(proc)
            attempts.append({'engine': choice, 'ok': False, 'loadMs': round((time.monotonic()-started)*1000)})
            if choice == choices[-1]:
                raise RuntimeError('ASR failed to load; inspect '+str(scratch)) from None
            status(stage='asr-fallback', fromEngine=choice, toEngine='compatibility')
        except BaseException:
            if proc is not None:
                stop(proc)
            raise


def align(paths, audio, text, language, backend, scratch, index, env):
    choices = ['vulkan', 'cpu'] if backend == 'auto' else [backend]
    attempts = []
    for choice in choices:
        logpath = scratch / f'align-{index:04d}-{choice}.log'
        resultpath = scratch / f'align-{index:04d}-{choice}.json'
        penv = dict(env, QWEN_DIAGNOSTICS='1')
        if choice == 'vulkan':
            penv['QWEN_USE_VRAM'] = '1'
        else:
            penv.pop('QWEN_USE_VRAM', None)
        key = 'alignerVulkan' if choice == 'vulkan' else 'alignerCpu'
        argv = [paths[key], '-m', paths['alignerModel'], '-f', audio, '--align',
                '--text', text, '--language', language, '-t', '4', '-o', resultpath]
        begun = time.monotonic()
        with logpath.open('wb') as log:
            proc = spawn(argv, penv, log)
            try:
                code = proc.wait(timeout=180)
            finally:
                stop(proc)
        logs = logpath.read_text(errors='replace')
        nodes = [{'gpu': int(g), 'cpu': int(c), 'backend': b}
                 for g, c, b in re.findall(r'ALIGNER_MATMUL gpu=(\d+) cpu=(\d+) backend=(\S+)', logs)]
        actual_gpu = bool(nodes) and sum(n['gpu'] for n in nodes) > 0
        attempts.append({'requested': choice, 'exitCode': code, 'matmulNodes': nodes,
                         'wallMs': round((time.monotonic() - begun) * 1000)})
        if code == 0 and resultpath.is_file() and (choice != 'vulkan' or actual_gpu):
            return json.loads(resultpath.read_text())['words'], attempts
        if backend != 'auto' or choice == 'cpu':
            raise RuntimeError(f'Alignment failed or wrong backend; inspect {logpath}')
        status(stage='aligner-fallback', segment=index, fromBackend='vulkan', toBackend='cpu')
    raise RuntimeError('No alignment result')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', nargs='?')
    parser.add_argument('--output', type=Path)
    parser.add_argument('--start', type=float, default=0)
    parser.add_argument('--duration', type=float)
    parser.add_argument('--language', choices=['Chinese', 'English'], default='Chinese')
    parser.add_argument('--aligner', choices=['auto', 'vulkan', 'cpu'], default='auto')
    parser.add_argument('--asr-engine', choices=['auto', 'compatibility'], default='auto')
    parser.add_argument('--doctor', action='store_true')
    args = parser.parse_args()
    check, paths = doctor()
    if args.doctor:
        status(**check)
        return 0 if check['ok'] else 1
    if not args.input or not args.output or args.start < 0 or (args.duration is not None and args.duration <= 0):
        parser.error('Provide input and a new --output directory; start>=0, duration>0')
    if not check['ok']:
        status(**check)
        raise RuntimeError('Missing device prerequisites')
    source = Path(args.input).resolve(strict=True)
    if not source.is_file():
        raise ValueError('Input must be a file')
    output = args.output.resolve()
    # Shared work is writable by the ordinary app and manageable in a file manager.
    shared = Path('/storage/emulated/0').resolve()
    if not source.is_relative_to(shared) or not output.is_relative_to(shared):
        raise ValueError('Use input/output in shared internal storage (/storage/emulated/0)')
    lockpath = HOME_DIR / '.dsh/transcribe.lock'
    with lockpath.open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError('Another local transcription is running') from None
        output.mkdir(parents=True, exist_ok=False)
        scratch = Path(tempfile.mkdtemp(prefix='.transcribe-', dir=output))
        started = time.monotonic()
        report = {'source': str(source), 'sourceOffsetSeconds': args.start,
                  'language': args.language, 'asrBackend': 'CPU / 4 threads', 'samples': []}
        try:
            audio = scratch / 'source.wav'
            ffargs = ['ffmpeg', '-nostdin', '-v', 'error', '-ss', str(args.start),
                      '-i', '/workspace/' + str(source.relative_to(shared))]
            if args.duration is not None:
                ffargs += ['-t', str(args.duration)]
            ffargs += ['-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', '-n',
                       '/workspace/' + str(audio.relative_to(shared))]
            status(stage='decode')
            debian(shared, ffargs)
            report['decodeMs'] = round((time.monotonic() - started) * 1000)
            with wave.open(str(audio), 'rb') as wav:
                duration = wav.getnframes() / wav.getframerate()
            if duration <= 0:
                raise ValueError('No audio in selected interval')
            segments = segment(audio, scratch, str(paths['vad']))
            report.update(durationSeconds=duration, segmentation=segments)
            status(stage='segmented', seconds=duration, segments=len(segments['chunks']))
            env = dict(os.environ)
            env.pop('LD_PRELOAD', None)
            env.pop('GGML_KLEIDIAI_SME', None)
            env['LD_LIBRARY_PATH'] = str(native_dir())
            env['LLAMA_API_KEY'] = secrets.token_hex(24)
            with socket.socket() as sock:
                sock.bind(('127.0.0.1', 0))
                port = sock.getsockname()[1]
            argv = [paths['asr'], '-m', paths['asrModel'], '--mmproj', paths['mmproj'],
                    '--host', '127.0.0.1', '--port', str(port), '-c', '4096', '-b', '512',
                    '-ub', '256', '-np', '1', '-t', '4', '-tb', '4', '--no-warmup',
                    '--jinja', '--cache-ram', '0', '--no-webui', '--device', 'none',
                    '-ngl', '0', '--no-mmproj-offload']
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

            def request(route, body=None):
                data = None if body is None else json.dumps(body).encode()
                req = urllib.request.Request(f'http://127.0.0.1:{port}' + route, data=data,
                    headers={'Authorization': 'Bearer ' + env['LLAMA_API_KEY'], 'Content-Type': 'application/json'})
                with opener.open(req, timeout=180 if body else 2) as response:
                    return json.load(response)

            server, selected, attempts = start_asr(paths, args.asr_engine, argv, env, scratch, request)
            report['asrEngine'] = selected
            report['asrEngineAttempts'] = attempts
            report['asrLoadMs'] = sum(a['loadMs'] for a in attempts)
            try:
                for item in segments['chunks']:
                    step_start = time.monotonic()
                    encoded = base64.b64encode(Path(item['path']).read_bytes()).decode()
                    body = {'messages': [{'role': 'system', 'content': ''}, {'role': 'user', 'content': [
                        {'type': 'input_audio', 'input_audio': {'data': encoded, 'format': 'wav'}}]}],
                        'temperature': 0, 'max_tokens': 1024, 'stream': False, 'cache_prompt': False}
                    try:
                        result = request('/v1/chat/completions', body)['choices'][0]
                    except OSError:
                        if selected != 'kleidiai' or server.poll() is None:
                            raise
                        stop(server)
                        server, selected, retry = start_asr(paths, 'compatibility', argv, env, scratch, request)
                        report['asrEngine'] = selected
                        report['asrEngineAttempts'].extend(retry)
                        report['asrLoadMs'] += sum(a['loadMs'] for a in retry)
                        result = request('/v1/chat/completions', body)['choices'][0]
                    if result['finish_reason'] != 'stop':
                        raise RuntimeError('ASR output truncated; use shorter chunks')
                    text = result['message']['content'].split('<asr_text>')[-1].strip()
                    asr_ms = round((time.monotonic() - step_start) * 1000)
                    if not text:
                        words, attempts = [], []
                    else:
                        words, attempts = align(paths, item['path'], text, args.language,
                                                args.aligner, scratch, item['index'], env)
                    report['samples'].append(dict(index=item['index'], offsetSeconds=item['start'],
                        audioSeconds=item['seconds'], text=text, words=words, asrMs=asr_ms,
                        alignerAttempts=attempts))
                    status(stage='transcribed', segment=item['index'] + 1, total=len(segments['chunks']),
                           asrMs=asr_ms, aligner=attempts[-1]['requested'] if attempts else 'silence')
            finally:
                stop(server)
            report['wallMs'] = round((time.monotonic() - started) * 1000)
            report['rtf'] = report['wallMs'] / (duration * 1000)
            (output / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
            export(output / 'report.json', output)
            shutil.rmtree(scratch)
            report['wallMs'] = round((time.monotonic() - started) * 1000)
            report['rtf'] = report['wallMs'] / (duration * 1000)
            (output / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
            status(stage='complete', output=str(output), seconds=duration,
                   wallMs=report['wallMs'], rtf=report['rtf'])
        except BaseException:
            (output / 'failed.json').write_text(json.dumps({'completedSegments': len(report['samples']),
                'scratch': str(scratch), 'note': 'Incomplete; no final transcript claimed'}) + '\n')
            raise
        finally:
            for proc in list(CHILDREN):
                stop(proc)
    return 0


if __name__ == '__main__':
    def interrupted(signum, frame):
        raise KeyboardInterrupt()
    signal.signal(signal.SIGTERM, interrupted)
    raise SystemExit(main())
