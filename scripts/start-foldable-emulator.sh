#!/usr/bin/env bash
# Pixel Fold compatible test device; this is not Xiaomi hardware or HyperOS.
# Pixel identity enables the system image dual-display configuration.
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/env.sh"
mkdir -p "$ANDROID_AVD_HOME"
emulator -accel-check
if ! emulator -list-avds | rg -qx dsh_foldable_api35; then
  printf 'no\n' | avdmanager create avd --name dsh_foldable_api35 \
    --package 'system-images;android-35;google_apis;x86_64' --device '7.6in Foldable'
fi
if adb -s emulator-5582 get-state >/dev/null 2>&1; then
  echo 'emulator-5582 is already running'
  exit 0
fi
# Parameters from the official tools/base sdklib nexus.xml Pixel Fold entry.
# The installed command-line tools predate that profile, so patch only this AVD.
python3 - "$ANDROID_AVD_HOME/dsh_foldable_api35.avd/config.ini" <<'PYCONFIG'
import sys
from pathlib import Path
p=Path(sys.argv[1]); values=dict(line.split('=',1) for line in p.read_text().splitlines() if '=' in line)
values.update({'hw.device.name':'pixel_fold','hw.device.manufacturer':'Google',
 'hw.lcd.width':'2208','hw.lcd.height':'1840','hw.displayRegion.0.1.width':'1080',
 'hw.displayRegion.0.1.height':'2092','hw.sensor.hinge.areas':'1080-0-0-1840',
 'hw.sensor.hinge.change_orientation_on_fold':'1','hw.initialOrientation':'landscape',
 'hw.ramSize':'4096M'})
p.write_text(''.join(k+'='+v+'\n' for k,v in values.items()))
PYCONFIG
exec emulator -avd dsh_foldable_api35 -port 5582 -memory 4096 -cores 4 \
  -partition-size 8192 -no-window -no-audio -no-boot-anim \
  -no-snapshot-load -gpu swiftshader "$@"
