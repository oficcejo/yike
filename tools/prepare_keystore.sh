#!/bin/bash
# 生成"仅本机保存"的自分发签名；正式上架请另行妥善保管密钥。
# 密码随机生成并写入 android/signing.local.properties（.gitignore 已排除）。
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$ROOT/android/app"
KS="$APP_DIR/yike.keystore"
LOCAL="$ROOT/android/signing.local.properties"

if [ -f "$KS" ]; then
  if [ ! -f "$LOCAL" ]; then
    echo "✗ 密钥库已存在，但缺少本机凭据文件：$LOCAL" >&2
    echo "  请按 README「从源码构建」一节手动创建并填入现有密码。" >&2
    exit 1
  fi
  echo "密钥已存在，跳过"
  exit 0
fi

PASS="$(python3 -c 'import secrets; print(secrets.token_urlsafe(18))')"
keytool -genkeypair -v \
  -keystore "$KS" \
  -alias yike \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass "$PASS" -keypass "$PASS" \
  -dname "CN=Yike, OU=Traditional Studies, O=WS9, L=Jining, ST=Shandong, C=CN" > /dev/null 2>&1

cat > "$LOCAL" <<EOF
# 本机专用签名凭据 —— 已被 .gitignore 排除，切勿提交
YIKE_STORE_FILE=yike.keystore
YIKE_STORE_PASSWORD=$PASS
YIKE_KEY_ALIAS=yike
YIKE_KEY_PASSWORD=$PASS
EOF
chmod 600 "$KS" "$LOCAL"
echo "已生成 $KS 与 $LOCAL（密码随机，仅本机）"
