#!/bin/bash
set -euxo pipefail
export DEBIAN_FRONTEND=noninteractive HYPERFRAMES_NO_TELEMETRY=1
mkdir -p /root/hyperframes-env
cd /root/hyperframes-env
apt-get update
apt-get install -y --no-install-recommends chromium xz-utils fonts-noto-cjk libasound2
curl -fL --retry 3 https://nodejs.org/dist/v22.23.2/node-v22.23.2-linux-arm64.tar.xz -o node.tar.xz
printf '%s\n' 'fff4078c5def658577f92c88db7db3bc0072924bfb93fe52c1e744a54e94abb8  node.tar.xz' | sha256sum -c -
tar -xJf node.tar.xz
rm node.tar.xz
export PATH=/root/hyperframes-env/node-v22.23.2-linux-arm64/bin:$PATH
node --version
if [ -f /workspace/environment-package-lock.json ]; then
  cp /workspace/environment-package.json package.json
  cp /workspace/environment-package-lock.json package-lock.json
  npm ci
else
  npm install --save-exact hyperframes@0.8.33
fi
node --version > /workspace/node-version.txt
chromium --version > /workspace/chromium-version.txt
npm ls --depth=0 > /workspace/npm-versions.txt
printf 'INSTALL_OK\n'
