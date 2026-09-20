#!/bin/bash
# Minimal Java Android app builder, all compilation and signing happen on phone.
set -euo pipefail
cd /workspace
test -f AndroidManifest.xml
test -d src
sdk=/root/android-app-lab/toolchain
out="build/run-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$out/classes" "$out/dex"
started=$(date +%s)
find src -name '*.java' -print > "$out/sources.txt"
javac -encoding UTF-8 -source 8 -target 8 -bootclasspath "$sdk/android.jar" -d "$out/classes" @"$out/sources.txt"
jar cf "$out/classes.jar" -C "$out/classes" .
java -Xmx512m -cp "$sdk/d8.jar" com.android.tools.r8.D8 --lib "$sdk/android.jar" --min-api 26 --output "$out/dex" "$out/classes.jar"
framework=/usr/share/android-framework-res/framework-res.apk
test -f "$framework"
aapt package -f -M AndroidManifest.xml -I "$framework" -F "$out/unsigned.apk"
(cd "$out/dex" && zip -q ../unsigned.apk classes.dex)
zipalign -f -p 4 "$out/unsigned.apk" "$out/aligned.apk"
# Disposable development signing identity. Never use it for release signing.
key=/root/android-app-lab/debug.keystore
if [ ! -f "$key" ]; then
 keytool -genkeypair -keystore "$key" -storepass android -keypass android -alias androiddebugkey -dname 'CN=Android Debug,O=DeepCode Lab,C=CN' -keyalg RSA -keysize 2048 -validity 3650
 chmod 600 "$key"
fi
apksigner sign --ks "$key" --ks-key-alias androiddebugkey --ks-pass pass:android --key-pass pass:android --out "$out/app.apk" "$out/aligned.apk"
apksigner verify --verbose "$out/app.apk"
aapt dump badging "$out/app.apk" | head -n 5
cp "$out/app.apk" ./app.apk
printf 'BUILD_SECONDS=%s\n' "$(( $(date +%s) - started ))"
sha256sum app.apk
python3 - <<'RECEIPT'
import hashlib,json,subprocess,re,pathlib
apk=pathlib.Path('app.apk')
badging=subprocess.check_output(['aapt','dump','badging',str(apk)],text=True)
package=re.search(r"package: name='([^']+)'",badging).group(1)
pathlib.Path('build-receipt.json').write_text(json.dumps({'package':package,'sha256':hashlib.file_digest(apk.open('rb'),'sha256').hexdigest(),'builderArchitecture':subprocess.check_output(['uname','-m'],text=True).strip()},indent=2))
RECEIPT
printf 'PHONE_APK_BUILD_OK\n'
