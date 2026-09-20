#!/bin/bash
# Run through debian_exec with the test folder bound as /workspace.
set -uo pipefail
export PATH=/root/hyperframes-env/node-v22.23.2-linux-arm64/bin:$PATH
export HYPERFRAMES_NO_TELEMETRY=1
export HYPERFRAMES_BROWSER_PATH=/usr/bin/chromium
export TMPDIR=/root/hyperframes-env/probe-tmp
mkdir -p "$TMPDIR"
cd /workspace/project
HF=/root/hyperframes-env/node_modules/.bin/hyperframes
node -p 'JSON.stringify({node:process.version,arch:process.arch,platform:process.platform})' > /workspace/environment.json
"$HF" upgrade --project . --check --json > /workspace/upgrade.json 2>&1
"$HF" doctor --json > /workspace/doctor.json 2>&1
"$HF" render --help > /workspace/render-help.txt 2>&1
timeout -k 5 30 chromium --headless --no-sandbox --disable-dev-shm-usage --disable-gpu --no-zygote --dump-dom 'data:text/html,<h1>PAD9_CHROMIUM_OK</h1>' > /workspace/chromium-dom.html 2> /workspace/chromium-probe.log
printf '%s\n' "$?" > /workspace/chromium-probe.exit
"$HF" check --no-browser-gpu --timeout 30000 --json > /workspace/check.json 2>&1
printf '%s\n' "$?" > /workspace/check.exit
printf 'PROBE_FINISHED\n'
