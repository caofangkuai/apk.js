#!/usr/bin/env bash
# 为 node-canvas 渲染安装 CJK 字体（Debian 容器通常没有 fontconfig 与任何字体）。
# 仅影响本机渲染环境，浏览器使用用户系统字体。
set -euo pipefail

FONT_DIR="/usr/share/fonts/opentype/noto-cjk"
FONT_FILE="$FONT_DIR/NotoSansCJKsc-Regular.otf"
URL="https://github.com/notofonts/noto-cjk/raw/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf"

if [ ! -f "$FONT_FILE" ]; then
  mkdir -p "$FONT_DIR"
  curl -L --fail --retry 2 -o "$FONT_FILE" "$URL"
fi

if [ ! -f /etc/fonts/fonts.conf ]; then
  mkdir -p /etc/fonts /var/cache/fontconfig
  cat > /etc/fonts/fonts.conf <<'XML'
<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<fontconfig>
  <dir>/usr/share/fonts</dir>
  <dir>/usr/local/share/fonts</dir>
  <cachedir>/var/cache/fontconfig</cachedir>
  <config></config>
</fontconfig>
XML
fi

echo "CJK 字体就绪: $FONT_FILE"
