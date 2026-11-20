#!/usr/bin/env bash
# 构建带 Material 的样例 APK（TextInputLayout）。
#
# 关键点（踩过的坑，别改回去）：
#   1. 依赖资源必须用 -R 走 overlay 语义，否则 appcompat 与 material 的
#      SearchView styleable 会冲突。
#   2. R 类必须与最终 APK 用同一次 link 生成，并加
#      --extra-packages androidx.appcompat:com.google.android.material。
#      用 --static-lib 单独生成会让资源 id 全变 0；分两次 link 则 id 段不同
#      （0x7f02 vs 0x7f03），运行时对不上。
#   3. D8 不能把 dex 当输入和 class 混在一起，全部 class 要一次性喂给它。
#
#   WORK=.build-cache bash tools/build-textinput-apk.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${WORK:-$ROOT/.build-cache}"
SDK="$WORK/sdk"
AARS="$WORK/aars"
SRC="$ROOT/samples/textinput-src"
OUT="$WORK/textinput"
ANDROID_JAR="$SDK/plat/android-35/android.jar"
AAPT2="$SDK/aapt2/aapt2"
R8="$SDK/r8.jar"
DEST="$ROOT/samples/textinput-dex.apk"

[ -x "$AAPT2" ] || { echo "缺少 aapt2，先运行 tools/fetch-android-sdk.sh"; exit 1; }
[ -f "$ANDROID_JAR" ] || { echo "缺少 android.jar，先运行 tools/fetch-android-sdk.sh"; exit 1; }

rm -rf "$OUT" /tmp/til-classes /tmp/til-dex
mkdir -p "$OUT/compiled" "$OUT/gen" /tmp/til-classes /tmp/til-dex

echo "== 编译依赖资源 =="
idx=0
for aar in "$AARS"/x/*/; do
  [ -d "$aar/res" ] || continue
  idx=$((idx + 1))
  "$AAPT2" compile --dir "$aar/res" -o "$OUT/compiled/dep-$idx.zip" >/dev/null 2>&1 || true
  echo "$(basename "$aar") -> dep-$idx.zip" >> "$OUT/dep-map.txt"
done
echo "依赖资源包: $(ls "$OUT"/compiled/dep-*.zip | wc -l)"

echo "== 编译样例资源 =="
"$AAPT2" compile --dir "$SRC/res" -o "$OUT/compiled/app.zip"

echo "== 链接（同一次 link 生成 R 类） =="
DEPS=""
for dep in "$OUT"/compiled/dep-*.zip; do
  [ -f "$dep" ] && DEPS="$DEPS -R $dep"
done
"$AAPT2" link \
  -o "$OUT/base.apk" \
  -I "$ANDROID_JAR" \
  --manifest "$SRC/AndroidManifest.xml" \
  --java "$OUT/gen" \
  --extra-packages androidx.appcompat:androidx.appcompat.resources:androidx.core:com.google.android.material \
  --auto-add-overlay --no-static-lib-packages \
  $DEPS \
  "$OUT/compiled/app.zip"

echo "== 编译 Java =="
CP="$ANDROID_JAR"
for j in "$AARS"/jars/*.jar; do CP="$CP:$j"; done
javac -nowarn -source 8 -target 8 \
  -bootclasspath "$ANDROID_JAR" \
  -classpath "$CP:$OUT/gen" \
  -d /tmp/til-classes \
  $(find "$SRC/src" -name '*.java') \
  $(find "$OUT/gen" -name '*.java') 2>&1 | grep -vE "^注|^Note|警告|warning" | head -10 || true

echo "== dex =="
java -Xmx900m -XX:MaxMetaspaceSize=192m -XX:ActiveProcessorCount=2 \
  -cp "$R8" com.android.tools.r8.D8 \
  --min-api 21 --thread-count 1 \
  --lib "$ANDROID_JAR" \
  --output /tmp/til-dex \
  $(find /tmp/til-classes -name '*.class') \
  "$AARS"/jars/*.jar 2>&1 | grep -E "^Error|error:" | head -5 || true

echo "== 打包 APK =="
python3 - "$OUT/base.apk" /tmp/til-dex/classes.dex "$DEST" <<'PY'
import sys, os, zipfile
base, dex, dest = sys.argv[1:4]
with zipfile.ZipFile(base) as zin, zipfile.ZipFile(dest, 'w', zipfile.ZIP_DEFLATED) as zout:
    for info in zin.infolist():
        zout.writestr(info, zin.read(info.filename))
    zout.write(dex, 'classes.dex')
print('built', dest, os.path.getsize(dest), 'bytes')
PY
