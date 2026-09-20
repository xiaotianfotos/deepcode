#!/bin/bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get install -y --no-install-recommends unzip
base=/root/hyperframes-env
for bin in node npm npx; do ln -sfn "$base/node-v22.23.2-linux-arm64/bin/$bin" "/usr/local/bin/$bin"; done
cat > /usr/local/bin/hyperframes <<'WRAPPER'
#!/bin/sh
export PATH=/root/hyperframes-env/node-v22.23.2-linux-arm64/bin:$PATH
export HYPERFRAMES_BROWSER_PATH=${HYPERFRAMES_BROWSER_PATH:-/usr/bin/chromium}
export HYPERFRAMES_NO_TELEMETRY=1
export PRODUCER_BROWSER_GPU_MODE=${PRODUCER_BROWSER_GPU_MODE:-software}
export PRODUCER_FORCE_SCREENSHOT=${PRODUCER_FORCE_SCREENSHOT:-true}
export PRODUCER_MAX_WORKERS=${PRODUCER_MAX_WORKERS:-1}
export PRODUCER_LOW_MEMORY_MODE=${PRODUCER_LOW_MEMORY_MODE:-true}
exec /root/hyperframes-env/node_modules/.bin/hyperframes "$@"
WRAPPER
chmod 755 /usr/local/bin/hyperframes
node --version
hyperframes --version
cp "$base/package.json" /workspace/environment-package.json
cp "$base/package-lock.json" /workspace/environment-package-lock.json
cp /usr/local/bin/hyperframes /workspace/hyperframes-launcher.sh
printf 'ENVIRONMENT_READY\n'
