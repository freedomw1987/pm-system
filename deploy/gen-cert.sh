#!/usr/bin/env bash
# ============================================================
# PM-System — Self-signed TLS cert generation
#
# 用嚟幫客戶機嘅 IP-only 訪問提供 HTTPS,咁瀏覽器先當係
# secure context(crypto.randomUUID 等 Web Crypto API 啱用)。
#
# 用法:
#   bash gen-cert.sh                  # 預設 ./docker/certs,skip if exists
#   bash gen-cert.sh --force          # 強制重新產生
#   CERT_DIR=/path bash gen-cert.sh   # 自訂輸出目錄
#
# 環境變數(可選):
#   CERT_DIR       輸出目錄(預設 ./docker/certs,相對 gen-cert.sh 所在)
#   CERT_DAYS      有效日數(預設 825,瀏覽器對自簽接受嘅上限)
#   EXTRA_SAN_IP   額外 IP,空白分隔(例: "10.0.0.5 203.0.113.10")
#   EXTRA_SAN_DNS  額外 DNS,空白分隔(例: "pm.example.com")
# ============================================================
set -euo pipefail

# ── args ────────────────────────────────────────────────────
FORCE=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    -h|--help)
      sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "Unknown arg: $arg" >&2; exit 2 ;;
  esac
done

# ── 顏色 ────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'
step() { echo -e "\n${BLUE}==>${NC} $*"; }
ok()   { echo -e "  ${GREEN}✓${NC} $*"; }
warn() { echo -e "  ${YELLOW}⚠${NC} $*"; }
fail() { echo -e "  ${RED}✗${NC} $*"; exit 1; }

# ── config ──────────────────────────────────────────────────
CERT_DIR="${CERT_DIR:-./docker/certs}"
CERT_DAYS="${CERT_DAYS:-825}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# 將相對路徑解析到相對於 gen-cert.sh 所在,避免 caller 嘅 cwd 影響
# 同時 strip 埋 "./" prefix 避免 path 變成 "/foo/./bar"
CERT_DIR_CLEAN="${CERT_DIR#./}"
case "$CERT_DIR_CLEAN" in
  /*) ABS_CERT_DIR="$CERT_DIR_CLEAN" ;;
  *)  ABS_CERT_DIR="$SCRIPT_DIR/$CERT_DIR_CLEAN" ;;
esac

CRT="$ABS_CERT_DIR/server.crt"
KEY="$ABS_CERT_DIR/server.key"

# ── 1. preflight ─────────────────────────────────────────────
step "Preflight"
command -v openssl >/dev/null 2>&1 \
  || fail "openssl 唔識用(linux: apt install openssl / alpine: apk add openssl)"
ok "openssl $(openssl version | awk '{print $2}')"

# ── 2. idempotency check ─────────────────────────────────────
step "Idempotency check"
if [[ -f "$CRT" && -f "$KEY" && $FORCE -eq 0 ]]; then
  ok "Cert 已經存在( $CRT ),skip 產生"
  ok "要強制重新產生就用 --force(例: 換咗 server IP)"
  echo
  openssl x509 -in "$CRT" -noout -subject -dates -ext subjectAltName 2>/dev/null \
    | sed 's/^/    /'
  exit 0
fi
ok "會產生新 cert( $CRT )"

# ── 3. 收集 SAN ──────────────────────────────────────────────
step "收集 Subject Alternative Names"

# 自動偵測本機 IP(hostname -I 唔一定有,fallback 多個方法)
DETECTED_IPS=""
for getter in "hostname -I" "hostname -i" "ip -4 addr show 2>/dev/null | grep -oP 'inet \K[\d.]+'"; do
  if DETECTED_IPS="$(eval "$getter" 2>/dev/null)" && [[ -n "$DETECTED_IPS" ]]; then
    break
  fi
done

# 收集去重(避免 read -a 喺 bash 3.2 嘅 splitting 差異)
SAN_IPS_RAW="$DETECTED_IPS 127.0.0.1 ${EXTRA_SAN_IP:-}"
SAN_DNS_RAW="localhost ${EXTRA_SAN_DNS:-}"

# 去重 + 過濾(awk 嘅 !seen[$0]++ 寫法 bash 3.2 都支援)
SAN_IPS_LIST="$(printf '%s\n' $SAN_IPS_RAW | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | awk '!seen[$0]++')"
SAN_DNS_LIST="$(printf '%s\n' $SAN_DNS_RAW | grep -v '^$' | awk '!seen[$0]++')"

if [[ -z "$SAN_IPS_LIST" && -z "$SAN_DNS_LIST" ]]; then
  fail "搵唔到任何 IP 或 DNS name 嚟做 SAN"
fi

echo "  IP SANs : $(echo "$SAN_IPS_LIST" | tr '\n' ' ')"
echo "  DNS SANs: $(echo "$SAN_DNS_LIST" | tr '\n' ' ')"

# 組合 openssl -addext subjectAltName 嘅格式
# 注意:CLI 嘅 -addext 用 unnumbered 形式(DNS:foo,IP:1.2.3.4),
# numbered form(DNS:1=foo)只係 config file 入面先 work
SAN_ADDEXT=""
while IFS= read -r name; do
  [[ -z "$name" ]] && continue
  if [[ -n "$SAN_ADDEXT" ]]; then SAN_ADDEXT+=","; fi
  SAN_ADDEXT+="DNS:${name}"
done <<< "$SAN_DNS_LIST"

while IFS= read -r ip; do
  [[ -z "$ip" ]] && continue
  if [[ -n "$SAN_ADDEXT" ]]; then SAN_ADDEXT+=","; fi
  SAN_ADDEXT+="IP:${ip}"
done <<< "$SAN_IPS_LIST"

# ── 4. 產生 ──────────────────────────────────────────────────
step "產生 RSA-2048 private key + cert( $CERT_DAYS 日有效)"

mkdir -p "$ABS_CERT_DIR"
chmod 700 "$ABS_CERT_DIR"

openssl req -x509 -nodes -newkey rsa:2048 \
  -days "$CERT_DAYS" \
  -keyout "$KEY" \
  -out  "$CRT" \
  -subj "/CN=pm-system" \
  -addext "basicConstraints = CA:FALSE" \
  -addext "keyUsage = digitalSignature, keyEncipherment" \
  -addext "extendedKeyUsage = serverAuth" \
  -addext "subjectAltName = $SAN_ADDEXT" \
  >/dev/null 2>&1 \
  || fail "openssl 產生 cert 失敗"

chmod 600 "$KEY"
chmod 644 "$CRT"
ok "key  : $KEY"
ok "cert : $CRT"

# ── 5. 顯示結果 ──────────────────────────────────────────────
step "產生完成"
openssl x509 -in "$CRT" -noout -subject -dates -ext subjectAltName 2>/dev/null \
  | sed 's/^/    /'

echo
ok "下次訪問 https://<server-ip>/ 會見到一次性「連線不安全」警告(HSTS 接受後就唔會再問)"
ok "換 IP 之後再跑: bash $(basename "$0") --force"
