#!/usr/bin/env bash
# Source this file from any working directory. No global shell profile changes.
DSH_ANDROID_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
export DSH_ANDROID_ROOT
export JAVA_HOME="${JAVA_HOME:-$DSH_ANDROID_ROOT/.tools/jdk17}"
export ANDROID_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$DSH_ANDROID_ROOT/.tools/android-sdk}}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export ANDROID_USER_HOME="$DSH_ANDROID_ROOT/.tools/android-user"
export ANDROID_AVD_HOME="$DSH_ANDROID_ROOT/.tools/avd"
export GRADLE_USER_HOME="$DSH_ANDROID_ROOT/.tools/gradle"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/12.0/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$DSH_ANDROID_ROOT/.tools/node/node_modules/.bin:$DSH_ANDROID_ROOT/.tools/bin:$PATH"
