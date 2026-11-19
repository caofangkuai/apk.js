#!/usr/bin/env bash
# 拉取构建最小 Material 样例 APK 所需的工具链与依赖。
# 产物全部落在 $WORK 下，不写进仓库。
set -euo pipefail

WORK="${WORK:-/tmp/tilbuild}"
SDK="$WORK/sdk"
AARS="$WORK/aars"
mkdir -p "$SDK" "$AARS/jars"

fetch() { # url out
  if [ -s "$2" ]; then return 0; fi
  curl -sSL --retry 3 --max-time 300 -o "$2.part" "$1"
  mv "$2.part" "$2"
}

echo "== 工具链 =="
fetch "https://dl.google.com/dl/android/maven2/com/android/tools/build/aapt2/8.5.2-11315950/aapt2-8.5.2-11315950-linux.jar" "$SDK/aapt2.zip"
unzip_q() { python3 - "$1" "$2" <<'PY'
import sys, zipfile, os
src, dst = sys.argv[1], sys.argv[2]
os.makedirs(dst, exist_ok=True)
with zipfile.ZipFile(src) as z: z.extractall(dst)
PY
}
[ -x "$SDK/aapt2/aapt2" ] || { mkdir -p "$SDK/aapt2"; unzip_q "$SDK/aapt2.zip" "$SDK/aapt2"; chmod +x "$SDK/aapt2/aapt2"; }
fetch "https://maven.google.com/com/android/tools/r8/8.5.35/r8-8.5.35.jar" "$SDK/r8.jar"
if [ ! -f "$SDK/plat/android-35/android.jar" ]; then
  fetch "https://dl.google.com/dl/android/repository/platform-35_r02.zip" "$SDK/platform.zip"
  mkdir -p "$SDK/plat"; unzip_q "$SDK/platform.zip" "$SDK/plat"
fi
ANDROID_JAR="$SDK/plat/android-35/android.jar"
[ -f "$ANDROID_JAR" ] || { echo "缺少 android.jar"; exit 1; }

echo "== 依赖 =="
# module path 形如 androidx/core/core/1.12.0/core-1.12.0
AAR_LIST="
com/google/android/material/material/1.12.0/material-1.12.0
androidx/appcompat/appcompat/1.6.1/appcompat-1.6.1
androidx/core/core/1.12.0/core-1.12.0
androidx/fragment/fragment/1.6.2/fragment-1.6.2
androidx/activity/activity/1.7.2/activity-1.7.2
androidx/lifecycle/lifecycle-runtime/2.6.2/lifecycle-runtime-2.6.2
androidx/lifecycle/lifecycle-viewmodel/2.6.2/lifecycle-viewmodel-2.6.2
androidx/lifecycle/lifecycle-viewmodel-savedstate/2.6.2/lifecycle-viewmodel-savedstate-2.6.2
androidx/savedstate/savedstate/1.2.1/savedstate-1.2.1
androidx/vectordrawable/vectordrawable/1.1.0/vectordrawable-1.1.0
androidx/vectordrawable/vectordrawable-animated/1.1.0/vectordrawable-animated-1.1.0
androidx/interpolator/interpolator/1.0.0/interpolator-1.0.0
androidx/cardview/cardview/1.0.0/cardview-1.0.0
androidx/coordinatorlayout/coordinatorlayout/1.2.0/coordinatorlayout-1.2.0
androidx/customview/customview/1.1.0/customview-1.1.0
androidx/drawerlayout/drawerlayout/1.1.1/drawerlayout-1.1.1
androidx/dynamicanimation/dynamicanimation/1.0.0/dynamicanimation-1.0.0
androidx/transition/transition/1.4.1/transition-1.4.1
androidx/recyclerview/recyclerview/1.3.2/recyclerview-1.3.2
androidx/viewpager2/viewpager2/1.0.0/viewpager2-1.0.0
androidx/viewpager/viewpager/1.0.0/viewpager-1.0.0
androidx/loader/loader/1.1.0/loader-1.1.0
androidx/constraintlayout/constraintlayout/2.1.4/constraintlayout-2.1.4
androidx/arch/core/core-runtime/2.2.0/core-runtime-2.2.0
androidx/arch/core/core-common/2.2.0/core-common-2.2.0
androidx/appcompat/appcompat-resources/1.6.1/appcompat-resources-1.6.1
androidx/lifecycle/lifecycle-livedata/2.6.2/lifecycle-livedata-2.6.2
androidx/lifecycle/lifecycle-livedata-core/2.6.2/lifecycle-livedata-core-2.6.2
androidx/lifecycle/lifecycle-runtime/2.6.2/lifecycle-runtime-2.6.2
androidx/tracing/tracing/1.0.0/tracing-1.0.0
androidx/startup/startup-runtime/1.1.1/startup-runtime-1.1.1
androidx/emoji2/emoji2/1.3.0/emoji2-1.3.0
androidx/emoji2/emoji2-views-helper/1.3.0/emoji2-views-helper-1.3.0
androidx/profileinstaller/profileinstaller/1.3.0/profileinstaller-1.3.0
androidx/versionedparcelable/versionedparcelable/1.1.1/versionedparcelable-1.1.1
androidx/slidingpanelayout/slidingpanelayout/1.2.0/slidingpanelayout-1.2.0
"

for spec in $AAR_LIST; do
  name=$(basename "$spec")
  fetch "https://dl.google.com/dl/android/maven2/$spec.aar" "$AARS/$name.aar"
  if [ ! -f "$AARS/jars/$name.jar" ]; then
    # 有些 "aar" 其实是纯 jar：按文件头判断，别硬解压。
    if python3 -c "import zipfile,sys; zipfile.ZipFile(sys.argv[1])" "$AARS/$name.aar" 2>/dev/null; then
      mkdir -p "$AARS/x/$name"
      unzip_q "$AARS/$name.aar" "$AARS/x/$name" || true
      [ -f "$AARS/x/$name/classes.jar" ] && cp "$AARS/x/$name/classes.jar" "$AARS/jars/$name.jar" || true
    else
      cp "$AARS/$name.aar" "$AARS/jars/$name.jar"
    fi
  fi
done

echo "== 纯 jar 依赖 =="
fetch "https://repo1.maven.org/maven2/org/jetbrains/kotlin/kotlin-stdlib/1.8.22/kotlin-stdlib-1.8.22.jar" "$AARS/jars/kotlin-stdlib.jar"
# lifecycle-common 是纯 jar，不是 aar
fetch "https://maven.google.com/androidx/lifecycle/lifecycle-common/2.6.2/lifecycle-common-2.6.2.jar" "$AARS/jars/lifecycle-common.jar"
# collection 也是纯 jar
fetch "https://maven.google.com/androidx/collection/collection/1.2.0/collection-1.2.0.jar" "$AARS/jars/collection.jar"
# annotation 也是纯 jar
fetch "https://maven.google.com/androidx/annotation/annotation/1.7.1/annotation-1.7.1.jar" "$AARS/jars/androidx-annotation.jar"

echo "AAR 数: $(ls "$AARS"/*.aar | wc -l)  jar 数: $(ls "$AARS/jars"/*.jar | wc -l)"
echo "ANDROID_JAR=$ANDROID_JAR"
