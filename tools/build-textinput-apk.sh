#!/usr/bin/env bash
# 构建带 Material 的样例 APK（TextInputLayout）。
# 依赖 tools/fetch-android-sdk.sh 预先拉取的 SDK 与依赖 AAR。
#
#   WORK=.build-cache bash tools/build-textinput-apk.sh
#
# 产物：samples/textinput-dex.apk（含 lib/ 之外的纯 dex + 资源）
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

[ -x "$AAPT2" ] || { echo "缺少 aapt2，先运行 tools/fetch-android-sdk.sh"; exit 1; }
[ -f "$ANDROID_JAR" ] || { echo "缺少 android.jar，先运行 tools/fetch-android-sdk.sh"; exit 1; }

rm -rf "$OUT"
mkdir -p "$OUT/classes" "$OUT/dex" "$OUT/gen" "$OUT/compiled" "$OUT/apk"

echo "== 编译依赖资源 =="
# 把各 AAR 的资源分别编译（aapt2 不允许一次 compile 多个目录树混包）
idx=0
for aar in "$AARS"/x/*/; do
  [ -d "$aar/res" ] || continue
  idx=$((idx + 1))
  "$AAPT2" compile --dir "$aar/res" -o "$OUT/compiled/dep-$idx.zip" >/dev/null 2>&1 || true
done
echo "依赖资源包: $(ls "$OUT/compiled" | wc -l)"

echo "== 编译样例资源 =="
"$AAPT2" compile --dir "$SRC/res" -o "$OUT/compiled/app.zip"

echo "== 链接资源 =="
# 依赖资源用 -R 走 overlay 语义：同名资源后者覆盖前者，避免 SearchView 等 styleable 冲突。
DEPS=""
for dep in "$OUT"/compiled/dep-*.zip; do
  [ -f "$dep" ] && DEPS="$DEPS -R $dep"
done

"$AAPT2" link \
  -o "$OUT/base.apk" \
  -I "$ANDROID_JAR" \
  --manifest "$SRC/AndroidManifest.xml" \
  --java "$OUT/gen" \
  --auto-add-overlay --no-static-lib-packages \
  $DEPS \
  "$OUT/compiled/app.zip"

echo "== 编译 Java =="
# 依赖 jar 里已有 R 与 androidx 类，直接用它们作为 classpath
CP="$ANDROID_JAR"
for j in "$AARS"/jars/*.jar; do CP="$CP:$j"; done
javac -nowarn -source 8 -target 8 \
  -bootclasspath "$ANDROID_JAR" \
  -classpath "$CP:$OUT/gen" \
  -d "$OUT/classes" \
  $(find "$SRC/src" "$OUT/gen" -name '*.java') 2>&1 | grep -vE "^注|^Note|警告|warning" | head -20 || true

echo "== dex =="
java -Xmx900m -XX:MaxMetaspaceSize=192m -XX:ActiveProcessorCount=2 \
  -cp "$R8" com.android.tools.r8.D8 \
  --min-api 21 --thread-count 1 \
  --lib "$ANDROID_JAR" \
  --output "$OUT/dex" \
  $(find "$OUT/classes" -name '*.class') \
  "$WORK/dexout/classes.dex" 2>&1 | grep -E "^Error|error:" | head -5 || true

ls -la "$OUT/dex"

echo "== 打包 APK =="
python3 - "$OUT" "$ROOT/samples/textinput-dex.apk" <<'PY'
import sys, os, zipfile
out, dest = sys.argv[1], sys.argv[2]
base = os.path.join(out, 'base.apk')
dex = os.path.join(out, 'dex', 'classes.dex')
with zipfile.ZipFile(base) as zin, zipfile.ZipFile(dest, 'w', zipfile.ZIP_DEFLATED) as zout:
    for info in zin.infolist():
        zout.writestr(info, zin.read(info.filename))
    zout.write(dex, 'classes.dex')
print('built', dest, os.path.getsize(dest), 'bytes')
PY
