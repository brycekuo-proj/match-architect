#!/bin/bash
# 火柴建築師 Steam 桌面版：把完整版（dist/steam/index.html）放進 Electron，打包到 steam/release/
#   steam/build.sh             先跑 npm run build（所有版本），再打包 macOS 版
#   steam/build.sh --skip-web  直接用現有的 dist/steam/index.html
#   steam/build.sh --win       也打包 Windows 版（在 Mac 上需要 Wine 才能寫入 exe 圖示）
# 產出：steam/release/mac-arm64/Match Architect.app、steam/release/win-unpacked/（上傳到 Steam 的 depot）
set -e
cd "$(dirname "$0")"
if [[ " $* " != *" --skip-web "* ]]; then (cd .. && npm run build); fi
mkdir -p app build
cp ../dist/steam/index.html app/index.html
[ -f build/icon.png ] || cp ../android/play_icon_512.png build/icon.png
[ -d node_modules ] || npm install
npx electron . --smoke
TARGETS=(--mac)
if [[ " $* " == *" --win "* ]]; then TARGETS+=(--win --x64); fi
npx electron-builder "${TARGETS[@]}" --publish never
echo "Steam 版：steam/release/"
