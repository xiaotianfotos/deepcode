#!/bin/bash
# Run inside the existing ARM64 Debian runner, with the project at /workspace.
set -euo pipefail
cd /workspace
test -f AndroidManifest.xml
test -d src
sdk=/root/android-app-lab/toolchain
test -f "$sdk/android.jar"
test -f "$sdk/d8.jar"
out=$(mktemp -d /workspace/build-XXXXXXXX)
mkdir -p "$out/classes" "$out/dex" "$out/generated"
started=$(date +%s)
resources=()
if [ -d res ]; then resources=(-S res); fi
aapt package -f -m -M AndroidManifest.xml "${resources[@]}" \
  -I /usr/share/android-framework-res/framework-res.apk -J "$out/generated" -F "$out/unsigned.apk"
mapfile -d '' sources < <(find src "$out/generated" -name '*.java' -print0)
javac -encoding UTF-8 -source 8 -target 8 -bootclasspath "$sdk/android.jar" -d "$out/classes" "${sources[@]}"
jar cf "$out/classes.jar" -C "$out/classes" .
java -Xmx512m -cp "$sdk/d8.jar" com.android.tools.r8.D8 --lib "$sdk/android.jar" --min-api 26 --output "$out/dex" "$out/classes.jar"
(cd "$out/dex" && zip -q ../unsigned.apk classes.dex)
zipalign -f -p 4 "$out/unsigned.apk" "$out/aligned.apk"
key=/root/android-app-lab/debug.keystore
if [ ! -f "$key" ]; then
  keytool -genkeypair -keystore "$key" -storepass android -keypass android -alias androiddebugkey \
    -dname 'CN=Android Debug,O=DeepCode Lab,C=CN' -keyalg RSA -keysize 2048 -validity 3650
  chmod 600 "$key"
fi
apksigner sign --ks "$key" --ks-key-alias androiddebugkey --ks-pass pass:android --key-pass pass:android --out "$out/app.apk" "$out/aligned.apk"
apksigner verify --verbose "$out/app.apk"
cp "$out/app.apk" app.apk
python3 - <<'PY'
import hashlib,json,pathlib,re,subprocess
apk=pathlib.Path('app.apk')
info=subprocess.check_output(['aapt','dump','badging',str(apk)],text=True)
package=re.search(r"package: name='([^']+)'",info).group(1)
version=re.search(r"versionCode='([^']+)'",info).group(1)
receipt={'package':package,'versionCode':version,'sha256':hashlib.sha256(apk.read_bytes()).hexdigest(),'architecture':subprocess.check_output(['uname','-m'],text=True).strip()}
pathlib.Path('build-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps(receipt))
PY
printf 'BUILD_SECONDS=%s\nANDROID_APP_BUILD_OK\n' "$(( $(date +%s) - started ))"
