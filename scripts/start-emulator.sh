#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/env.sh"
mkdir -p "$DSH_ANDROID_ROOT/logs" "$ANDROID_AVD_HOME"
emulator -accel-check
if ! emulator -list-avds | rg -qx dsh_tablet_api35; then
  echo no | avdmanager create avd --name dsh_tablet_api35 --package 'system-images;android-35;google_apis;x86_64' --device pixel_tablet
fi
if adb -s emulator-5580 get-state >/dev/null 2>&1; then
  echo 'emulator-5580 is already running'
  exit 0
fi
exec emulator -avd dsh_tablet_api35 -port 5580 -memory 4096 -cores 4 -no-window -no-audio -no-boot-anim -no-snapshot-load -gpu swiftshader "$@"
