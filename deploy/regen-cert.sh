#!/usr/bin/env bash
# ============================================================
# PM-System — 重新產生 / 同步 TLS cert
#
# 用嚟喺以下情況 refresh cert:
#   - Let's Encrypt cert 過期/renew 咗 → 重新 sync
#   - Server IP / domain 換咗 → 重新簽
#
# 自動偵測來源:
#   1) 如果 .env 有 DOMAIN + /etc/letsencrypt/live/$DOMAIN 存在 → 從 LE 重新 copy
#   2) 否則 → 跑 gen-cert.sh 重新簽 self-signed
#
# 用法:
#   bash regen-cert.sh                  # 自動偵測
#   bash regen-cert.sh --self-signed    # 強制 self-signed(忽略 LE)
#   DOMAIN=pm.example.com bash regen-cert.sh
#
# 跑完之後要 docker compose -p pm-system restart frontend。
# ============================================================
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# 讀 .env 拎 DOMAIN(如果存在)
# 優先 cwd 嘅 .env,fallback 喺 deploy folder(同 install.sh 一齊)
if [[ -f .env ]]; then
  # shellcheck disable=SC1091
  source .env
elif [[ -f "$SCRIPT_DIR/.env" ]]; then
  # shellcheck disable=SC1091
  source "$SCRIPT_DIR/.env"
fi

DOMAIN="${DOMAIN:-}"
FORCE_SELF=0
for arg in "$@"; do
  case "$arg" in
    --self-signed) FORCE_SELF=1 ;;
    -h|--help)
      sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "Unknown arg: $arg" >&2; exit 2 ;;
  esac
done

CERT_DEST_DIR="$SCRIPT_DIR/docker/certs"
CERT_DEST_CRT="$CERT_DEST_DIR/server.crt"
CERT_DEST_KEY="$CERT_DEST_DIR/server.key"
mkdir -p "$CERT_DEST_DIR"
chmod 700 "$CERT_DEST_DIR"

# 嘗試 Let's Encrypt sync
if [[ $FORCE_SELF -eq 0 && -n "$DOMAIN" ]]; then
  LE_DIR="/etc/letsencrypt/live/$DOMAIN"
  if [[ -f "$LE_DIR/fullchain.pem" && -f "$LE_DIR/privkey.pem" ]]; then
    echo "→ 從 Let's Encrypt 重新 sync: $LE_DIR"
    cp -f "$LE_DIR/fullchain.pem" "$CERT_DEST_CRT"
    cp -f "$LE_DIR/privkey.pem"  "$CERT_DEST_KEY"
    chmod 644 "$CERT_DEST_CRT"
    chmod 600 "$CERT_DEST_KEY"
    echo "  ✓ cert refreshed"
    echo ""
    echo "下一步: docker compose -p pm-system restart frontend"
    exit 0
  fi
fi

# Fallback: self-signed(用 --force 跳過 idempotency check)
echo "→ 重新產生 self-signed cert"
exec bash "$SCRIPT_DIR/gen-cert.sh" --force
