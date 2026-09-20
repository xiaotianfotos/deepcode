#!/bin/bash
# Execute inside DeepCode's ARM64 Debian. /workspace is the bootstrap directory.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends openjdk-17-jdk-headless aapt apksigner zipalign zip android-framework-res
mkdir -p /root/android-app-lab/toolchain
cp /workspace/android.jar /workspace/d8.jar /root/android-app-lab/toolchain/
cp /workspace/build-app.sh /root/android-app-lab/build-app.sh
chmod 755 /root/android-app-lab/build-app.sh
java -version
javac -version
aapt version
apksigner version
dpkg-query -W openjdk-17-jdk-headless aapt apksigner zipalign android-framework-res
printf 'PHONE_ANDROID_TOOLCHAIN_READY\n'
