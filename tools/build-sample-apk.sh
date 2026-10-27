#!/usr/bin/env bash
# 构建一个用于浏览器模拟的纯 Java 示例 APK（不含 lib/）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SDK="${ANDROID_SDK_ROOT:-/tmp/android-sdk}"
BT="$SDK/android-14"
PLATFORM="$SDK/android-34/android.jar"
SRC="$ROOT/samples/apk-src"
OUT="$ROOT/samples/build"
JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-17-openjdk-amd64}"

rm -rf "$OUT"
mkdir -p "$OUT/classes" "$OUT/dex" "$OUT/apk"

"$BT/aapt2" compile --dir "$SRC/res" -o "$OUT/res.zip"
"$BT/aapt2" link -o "$OUT/base.apk" \
  -I "$PLATFORM" \
  --manifest "$SRC/AndroidManifest.xml" \
  --java "$OUT/gen" \
  "$OUT/res.zip" \
  --auto-add-overlay

"$JAVA_HOME/bin/javac" -source 8 -target 8 \
  -bootclasspath "$PLATFORM" \
  -classpath "$OUT/gen" \
  -d "$OUT/classes" \
  $(find "$SRC/src" "$OUT/gen" -name '*.java') 2>/dev/null

"$BT/d8" --min-api 21 --output "$OUT/dex" $(find "$OUT/classes" -name '*.class')
cp "$OUT/dex/classes.dex" "$OUT/apk/classes.dex"
cd "$OUT/apk" && "$BT/aapt2" link --help >/dev/null 2>&1 || true
cd "$OUT"
python3 - "$OUT/base.apk" "$OUT/apk" "$SRC/assets" "$ROOT/samples/hello-dex.apk" <<'PY'
import sys, zipfile, os
base, apkdir, assets, dest = sys.argv[1:5]
with zipfile.ZipFile(base) as zin, zipfile.ZipFile(dest, 'w', zipfile.ZIP_DEFLATED) as zout:
    for info in zin.infolist():
        zout.writestr(info, zin.read(info.filename))
    zout.write(os.path.join(apkdir, 'classes.dex'), 'classes.dex')
    for root, _, files in os.walk(assets):
        for f in files:
            full = os.path.join(root, f)
            arc = os.path.join('assets', os.path.relpath(full, assets))
            zout.write(full, arc)
print('built', dest, os.path.getsize(dest), 'bytes')
PY
