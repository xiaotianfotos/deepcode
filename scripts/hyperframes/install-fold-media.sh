#!/bin/bash
# Run inside the existing DeepCode Debian, /workspace is a private staging folder.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive HYPERFRAMES_NO_TELEMETRY=1
apt-get update
apt-get install -y --no-install-recommends ffmpeg chromium xz-utils fonts-noto-cjk libasound2 unzip ca-certificates curl
base=/root/hyperframes-env
mkdir -p "$base"
cd "$base"
if [ ! -x node-v22.23.2-linux-arm64/bin/node ]; then
  curl -fL --retry 3 https://nodejs.org/dist/v22.23.2/node-v22.23.2-linux-arm64.tar.xz -o node.tar.xz
  printf '%s\n' 'fff4078c5def658577f92c88db7db3bc0072924bfb93fe52c1e744a54e94abb8  node.tar.xz' | sha256sum -c -
  tar -xJf node.tar.xz
  rm node.tar.xz
fi
export PATH="$base/node-v22.23.2-linux-arm64/bin:$PATH"
if [ ! -f package.json ]; then
  cp /workspace/environment-package.json package.json
  cp /workspace/environment-package-lock.json package-lock.json
elif ! node -e 'const p=require("./package.json");process.exit(p.dependencies?.hyperframes==="0.8.33"?0:1)'; then
  echo 'Existing HyperFrames environment has another version; preserve it and inspect before upgrading.' >&2
  exit 1
fi
npm ci
for bin in node npm npx; do
  target="/usr/local/bin/$bin"
  if [ -e "$target" ] && [ ! -L "$target" ]; then
    echo "Preserving unrelated executable: $target" >&2
  else
    ln -sfn "$base/node-v22.23.2-linux-arm64/bin/$bin" "$target"
  fi
done
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
ffmpeg -version | head -n 1
chromium --version
echo FOLD_MEDIA_INSTALLED
