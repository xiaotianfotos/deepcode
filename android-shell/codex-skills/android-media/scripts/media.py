#!/usr/bin/env python3
"""Execute media tools through the installed Android Debian runner."""
import argparse
from pathlib import Path
from device_runtime import debian

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--workspace', type=Path, required=True)
parser.add_argument('--timeout', type=int, default=1800)
parser.add_argument('command', nargs=argparse.REMAINDER)
args = parser.parse_args()
argv = args.command[1:] if args.command[:1] == ['--'] else args.command
if not argv:
    parser.error('Provide a command after --')
if args.timeout <= 0:
    parser.error('timeout must be positive')
debian(args.workspace, argv, timeout=args.timeout)
