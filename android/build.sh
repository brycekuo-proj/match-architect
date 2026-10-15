#!/bin/bash
# 火柴建築師 Android App：把完整版（dist/app/index.html）放進 App，打包 APK 到 android/release/
#   android/build.sh            先跑 npm run build（網頁版＋完整版），再打包 debug APK
#   android/build.sh --skip-web 直接用現有的 dist/app/index.html
# AdMob 的 ID 在 android/admob.properties（現在是 Google 的測試 ID）。
set -e
cd "$(dirname "$0")/.."
export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
[ -f android/local.properties ] || echo "sdk.dir=/opt/homebrew/share/android-commandlinetools" > android/local.properties
if [ "$1" != "--skip-web" ]; then npm run build; fi
mkdir -p android/app/src/main/assets
cp dist/app/index.html android/app/src/main/assets/index.html
cd android
./gradlew --no-daemon -q assembleDebug
VER=$(grep versionName app/build.gradle.kts | sed -E 's/.*"(.*)".*/\1/')
mkdir -p release
cp app/build/outputs/apk/debug/app-debug.apk "release/MatchArchitect-v$VER.apk"
echo "APK：android/release/MatchArchitect-v$VER.apk"
