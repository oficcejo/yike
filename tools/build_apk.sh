#!/bin/bash
# 一键重建节气数据、同步资源、编译签名 APK
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if [ -d "$HOME/Library/Android/sdk" ]; then export ANDROID_HOME="$HOME/Library/Android/sdk"; fi
if [ -d "$HOME/Library/Android/sdk" ]; then export ANDROID_SDK_ROOT="$HOME/Library/Android/sdk"; fi

echo "[1/5] 生成精确节气表"
python3 tools/gen_calendar_data.py > /tmp/yike_jieqi.log

echo "[2/5] 生成 Android 6 兼容资源（CSS 变量展开 / 启动图标 PNG）"
python3 tools/gen_legacy_assets.py

echo "[3/5] 同步 H5 资源到 assets"
python3 tools/sync_assets.py

echo "[4/5] 准备发布签名"
bash tools/prepare_keystore.sh

echo "[5/5] Gradle 构建"
cd "$ROOT/android"
chmod +x gradlew
if ! ./gradlew assembleRelease --no-daemon --offline -q; then
  echo "离线构建缺少依赖，改走在线构建…"
  ./gradlew assembleRelease --no-daemon -q
fi

APK="$ROOT/android/app/build/outputs/apk/release/app-release.apk"
OUT="$ROOT/Yike-v1.1-android6.apk"
cp "$APK" "$OUT"
echo "构建完成：$OUT ($(du -h "$OUT" | cut -f1))"
