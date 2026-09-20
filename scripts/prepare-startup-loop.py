#!/usr/bin/env python3
"""Prepare the bundled native Android loop from the accepted animation's matching poses."""
import hashlib
import json
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'android-shell/artwork/startup/ocean-source.mp4'
SPEC = ROOT / 'android-shell/artwork/startup/loop.json'
RES = ROOT / 'android-shell/app/src/main/res'

def run(*args):
    subprocess.run(args, check=True)

def main():
    spec = json.loads(SPEC.read_text())
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == spec['sourceSha256'], 'Source differs from accepted loop'
    start, end = spec['startFrame'], spec['endFrameExclusive']
    run('ffmpeg', '-v', 'error', '-y', '-i', str(SOURCE), '-map', '0:v:0',
        '-vf', f'trim=start_frame={start}:end_frame={end},setpts=PTS-STARTPTS',
        '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p',
        '-r', str(spec['fps']), '-g', str(end-start), '-bf', '0', '-movflags', '+faststart',
        str(RES / 'raw/startup_ocean_loop.mp4'))
    # Take the encoded loop's exact first frame, not a differently scaled illustration.
    run('ffmpeg', '-v', 'error', '-y', '-i', str(RES / 'raw/startup_ocean_loop.mp4'),
        '-frames:v', '1', str(RES / 'drawable-nodpi/startup_ocean.png'))

if __name__ == '__main__':
    main()
