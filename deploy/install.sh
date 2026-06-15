#!/usr/bin/env bash
# ============================================================
# PM-System 客戶機安裝腳本 (per-arch auto-detect)
#
# 自動偵測 uname -m 揀返合 arch 嘅 tar load:
#   x86_64  → load amd64 tar
#   aarch64 → load arm64 tar
#
# 用法:
#   1. 解壓 release package
#   2. cd 入 folder
#   3. ./install.sh
# ============================================================
set -euo pipefail

# ── 顏色 ─────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

step()  { echo -e "\n${BLUE}==>${NC} $*"; }
ok()    { echo -e "  ${GREEN}✓${NC} $*"; }
warn()  { echo -e "  ${YELLOW}⚠${NC} $*"; }
fail()  { echo -e "  ${RED}✗${NC} $*"; exit 1; }

# gen-cert.sh 嘅位置(亦係 docker/certs 嘅 parent)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ── 0. Pre-flight ────────────────────────────────────────────
step "0/8 Pre-flight checks"

command -v docker >/dev/null 2>&1 || fail "Docker 冇裝: https://docs.docker.com/engine/install/"
ok "docker $(docker --version | awk '{print $3}' | tr -d ',')"

docker compose version >/dev/null 2>&1 \
  || fail "Docker Compose v2 唔識用(Docker Desktop 內置;Linux 裝 docker-compose-plugin)"
ok "docker compose $(docker compose version --short)"

command -v openssl >/dev/null 2>&1 || fail "openssl 唔識用(linux: apt install openssl / alpine: apk add openssl)"
ok "openssl $(openssl version | awk '{print $2}')"

# ── 1. 偵測 architecture ────────────────────────────────────
step "1/8 偵測 server architecture"

ARCH_RAW="$(uname -m)"
case "$ARCH_RAW" in
  x86_64)        ARCH_DIR="amd64" ;;
  aarch64|arm64) ARCH_DIR="arm64" ;;
  *) fail "唔支援嘅 architecture: $ARCH_RAW(只支援 x86_64 / aarch64)" ;;
esac
ok "本機 architecture: $ARCH_RAW → 用 $ARCH_DIR image"

# ── 2. .env ───────────────────────────────────────────────────
step "2/8 準備 .env"

if [[ ! -f .env.client.example ]]; then
  fail "搵唔到 .env.client.example(release package 齊唔齊?)"
fi

if [[ -f .env ]]; then
  warn ".env 已經存在,留低唔覆寫(假設你已經改好)"
else
  cp .env.client.example .env
  ok "由 .env.client.example 抄咗做 .env"
fi

# 驗證必填 field
source .env

placeholder_check() {
  if [[ "$1" =~ PLACEHOLDER ]]; then return 1; fi
  return 0
}

MISSING=()
[[ "${VERSION:-}" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || MISSING+=("VERSION (e.g. v1.0.0)")
[[ -n "${DB_USER:-}"   ]] || MISSING+=("DB_USER")
placeholder_check "${DB_PASSWORD:-}" || MISSING+=("DB_PASSWORD (run: openssl rand -hex 24)")
[[ -n "${DB_NAME:-}"   ]] || MISSING+=("DB_NAME")
placeholder_check "${JWT_SECRET:-}" || MISSING+=("JWT_SECRET (run: openssl rand -hex 32)")

if (( ${#MISSING[@]} > 0 )); then
  fail "以下 .env field 未填或用緊 placeholder:\n    - ${MISSING[*]}\n\n請 edit .env 後再跑"
fi
ok "所有必填 field 已就緒"

if [[ "${DB_PASSWORD}" =~ PLACEHOLDER ]]; then
  warn "DB_PASSWORD 仲係 placeholder,強烈建議改做強密碼"
fi

# ── 3. 準備 TLS cert ─────────────────────────────────────────
# 兩種來源,自動揀:
#   1) Let's Encrypt — /etc/letsencrypt/live/$DOMAIN/{fullchain,privkey}.pem
#   2) Self-signed   — gen-cert.sh(原本嘅 fallback)
# 統一將 cert 放喺 $SCRIPT_DIR/docker/certs/server.{crt,key},
# frontend nginx.conf 寫死呢個 path。
step "3/8 準備 TLS cert"

CERT_DEST_DIR="$SCRIPT_DIR/docker/certs"
CERT_DEST_CRT="$CERT_DEST_DIR/server.crt"
CERT_DEST_KEY="$CERT_DEST_DIR/server.key"
mkdir -p "$CERT_DEST_DIR"
chmod 700 "$CERT_DEST_DIR"

# DOMAIN 用嚟搵 Let's Encrypt 路徑。
# 優先順序:.env 嘅 DOMAIN → 第一個 EXTRA_SAN_DNS → 自動 detect (cert 嘅 CN)
DOMAIN="${DOMAIN:-}"
if [[ -z "$DOMAIN" && -n "${EXTRA_SAN_DNS:-}" ]]; then
  # EXTRA_SAN_DNS 空白分隔,拎第一個似 domain 嘅(有 dot)
  for d in $EXTRA_SAN_DNS; do
    if [[ "$d" == *.* ]]; then DOMAIN="$d"; break; fi
  done
fi

CERT_SOURCE=""
LE_DIR=""

# Try 1: Let's Encrypt
if [[ -n "$DOMAIN" ]]; then
  LE_DIR="/etc/letsencrypt/live/$DOMAIN"
  if [[ -f "$LE_DIR/fullchain.pem" && -f "$LE_DIR/privkey.pem" ]]; then
    ok "揾到 Let's Encrypt cert: $LE_DIR"
    # copy(唔做 symlink)— 咁 docker volume mount 都 work
    if ! cp -f "$LE_DIR/fullchain.pem" "$CERT_DEST_CRT" 2>/dev/null; then
      fail "Copy fullchain.pem 失敗(可能需要 sudo/root)"
    fi
    if ! cp -f "$LE_DIR/privkey.pem"  "$CERT_DEST_KEY" 2>/dev/null; then
      fail "Copy privkey.pem 失敗(可能需要 sudo/root)"
    fi
    chmod 644 "$CERT_DEST_CRT"
    chmod 600 "$CERT_DEST_KEY"
    CERT_SOURCE="letsencrypt"
    ok "Cert 已 sync 落 $CERT_DEST_DIR"
  elif [[ -d "/etc/letsencrypt/live" ]]; then
    # certbot 裝咗但 $DOMAIN 嗰個未簽
    warn "$LE_DIR 唔存在(用緊 certbot 但未簽 $DOMAIN?),fallback 自簽"
  fi
fi

# Try 2: Self-signed
if [[ -z "$CERT_SOURCE" ]]; then
  # 將 DOMAIN 自動加入 EXTRA_SAN_DNS(用戶設咗 domain 但冇 LE cert 嘅情境)
  SAN_DNS="${EXTRA_SAN_DNS:-}"
  if [[ -n "$DOMAIN" ]]; then
    if [[ ! " $SAN_DNS " =~ " $DOMAIN " ]]; then
      SAN_DNS="${SAN_DNS:+$SAN_DNS }$DOMAIN"
    fi
  fi
  if [[ -n "$SAN_DNS" ]]; then
    ok "用 self-signed cert(自動將 domain 加入 SAN: $SAN_DNS)"
    warn "瀏覽器會彈「連線不安全」警告。建議裝 Let's Encrypt(見 README)"
  else
    ok "用 self-signed cert(SAN 只含 IP / localhost)"
    warn "純 IP 訪問會 work,但用 domain 訪問請裝 Let's Encrypt(見 README)"
  fi
  CERT_DIR="$CERT_DEST_DIR" \
    CERT_DAYS="${CERT_DAYS:-825}" \
    EXTRA_SAN_IP="${EXTRA_SAN_IP:-}" \
    EXTRA_SAN_DNS="$SAN_DNS" \
    bash "$SCRIPT_DIR/gen-cert.sh" \
    || fail "Cert 產生失敗。可以手動跑 bash $SCRIPT_DIR/gen-cert.sh 睇下咩事"
  CERT_SOURCE="self-signed"
fi

# 顯示 cert info
if [[ -f "$CERT_DEST_CRT" ]]; then
  CERT_SUBJ="$(openssl x509 -in "$CERT_DEST_CRT" -noout -subject 2>/dev/null | sed 's/subject=//')"
  CERT_EXP="$(openssl x509 -in "$CERT_DEST_CRT" -noout -enddate 2>/dev/null | sed 's/notAfter=//')"
  CERT_SANS="$(openssl x509 -in "$CERT_DEST_CRT" -noout -ext subjectAltName 2>/dev/null \
    | tail -1 | tr -d ' \n')"
  ok "Cert source : $CERT_SOURCE"
  ok "Cert subject : $CERT_SUBJ"
  ok "Cert SAN    : $CERT_SANS"
  ok "Cert 過期   : $CERT_EXP"
fi

# ── 4. 搵對應 arch 嘅 tar ────────────────────────────────────
step "4/8 搵 $ARCH_DIR image tar"

FRONTEND_TAR="$(ls pm-system-frontend-${VERSION}-${ARCH_DIR}.tar 2>/dev/null | head -1 || true)"
BACKEND_TAR="$(ls pm-system-backend-${VERSION}-${ARCH_DIR}.tar  2>/dev/null | head -1 || true)"
POSTGRES_TAR="$(ls pm-system-postgres-${VERSION}-${ARCH_DIR}.tar 2>/dev/null | head -1 || true)"

[[ -n "$FRONTEND_TAR" ]] || fail "搵唔到 frontend tar(預期 pm-system-frontend-${VERSION}-${ARCH_DIR}.tar)"
[[ -n "$BACKEND_TAR"  ]] || fail "搵唔到 backend tar(預期 pm-system-backend-${VERSION}-${ARCH_DIR}.tar)"
[[ -n "$POSTGRES_TAR" ]] || fail "搵唔到 postgres tar(預期 pm-system-postgres-${VERSION}-${ARCH_DIR}.tar — release package 齊唔齊?)"
ok "frontend tar: $FRONTEND_TAR"
ok "backend  tar: $BACKEND_TAR"
ok "postgres tar: $POSTGRES_TAR"

# 驗 CHECKSUMS
if [[ -f CHECKSUMS.sha256 ]]; then
  step "(可選) 驗 CHECKSUMS.sha256"
  if shasum -a 256 -c CHECKSUMS.sha256 2>&1 | grep -q FAILED; then
    fail "Checksum 驗證失敗!tarball 可能壞咗,請重新下載"
  fi
  ok "Checksum OK(或 skip)"
else
  warn "冇 CHECKSUMS.sha256, skip 驗證"
fi

# ── 4. Docker load ───────────────────────────────────────────
step "5/8 Docker load images"

if docker image inspect "pm-system-frontend:$VERSION" >/dev/null 2>&1 \
   && docker image inspect "pm-system-backend:$VERSION"  >/dev/null 2>&1 \
   && docker image inspect "pm-system-postgres:$VERSION" >/dev/null 2>&1; then
  warn "image 已經 load 過($VERSION),skip(如果想 force re-load,先 docker rmi)"
else
  docker load -i "$FRONTEND_TAR"
  ok "frontend loaded ($ARCH_DIR)"
  docker load -i "$BACKEND_TAR"
  ok "backend  loaded ($ARCH_DIR)"
  docker load -i "$POSTGRES_TAR"
  ok "postgres loaded ($ARCH_DIR)  (客戶機唔需要 docker pull,完全 offline)"
  # Docker daemon image index 嘅 sync 偶爾有 race
  sleep 1
fi

# 我哋 build script 將 image tag 為 :v1.0.0-{arch}(避免同 arch load 衝突)
# load 完之後,我哋要 re-tag 做 :v1.0.0 畀 docker-compose 用
step "→ Re-tag images: $VERSION-{arch} → $VERSION"
docker tag "pm-system-frontend:$VERSION-${ARCH_DIR}" "pm-system-frontend:$VERSION"
docker tag "pm-system-backend:$VERSION-${ARCH_DIR}"  "pm-system-backend:$VERSION"
docker tag "pm-system-postgres:$VERSION-${ARCH_DIR}" "pm-system-postgres:$VERSION"
ok "re-tag done"

# 確認 image 真係 load 咗
docker image inspect "pm-system-frontend:$VERSION" >/dev/null \
  || fail "frontend image re-tag 後搵唔到($VERSION)"
docker image inspect "pm-system-backend:$VERSION"  >/dev/null \
  || fail "backend image re-tag 後搵唔到($VERSION)"
docker image inspect "pm-system-postgres:$VERSION"  >/dev/null \
  || fail "postgres image re-tag 後搵唔到($VERSION)"

# ── 5. 啟動 ──────────────────────────────────────────────────
step "6/8 啟動 containers"

docker compose \
  -f docker-compose.client.yml \
  --env-file .env \
  --project-name pm-system \
  up -d

ok "containers 啟動中"

# ── 6. 等 health check ───────────────────────────────────────
step "7/8 等 backend health(最長 90 秒)"

MAX_WAIT=90
WAITED=0
# 用 HTTPS 撞(/api 已經由 nginx proxy),-k 接受自簽 cert
HEALTH_URL="https://127.0.0.1:${FRONTEND_HTTPS_HOST_PORT:-443}/api/projects"
while (( WAITED < MAX_WAIT )); do
  if curl -fksS "$HEALTH_URL" >/dev/null 2>&1; then
    ok "backend healthy (用咗 ${WAITED}s)"
    break
  fi
  sleep 3
  WAITED=$((WAITED+3))
  echo "    等待中... ${WAITED}s / ${MAX_WAIT}s"
done

if (( WAITED >= MAX_WAIT )); then
  fail "90 秒內 backend 仲未 ready,試 docker compose -p pm-system logs -f 睇下咩事"
fi

# ── 完成 ──────────────────────────────────────────────────────
# 揾 server 嘅 IP。Docker Desktop 嘅 Mac shell 返唔到 host IP,
# fallback 用 'localhost' 畀客戶自己靠 router/DNS 改。
HOST_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
if [[ -z "$HOST_IP" ]]; then
  HOST_IP="localhost"
fi

# 訪問 URL 優先用 domain(如果 .env 設咗 DOMAIN)。
# 如果 HTTPS 用非標準 port,URL 要 inline 個 port,否則 browser 會撞 default 443。
ACCESS_HOST="${DOMAIN:-$HOST_IP}"
HTTPS_PORT="${FRONTEND_HTTPS_HOST_PORT:-443}"
if [[ "$HTTPS_PORT" != "443" ]]; then
  ACCESS_URL="https://${ACCESS_HOST}:${HTTPS_PORT}/"
else
  ACCESS_URL="https://${ACCESS_HOST}/"
fi

# 讀返 cert 嘅 subject + 過期日,顯示俾客戶留底
CERT_FILE="$SCRIPT_DIR/docker/certs/server.crt"
CERT_INFO="(搵唔到 cert)"
if [[ -f "$CERT_FILE" ]]; then
  CERT_SUBJ="$(openssl x509 -in "$CERT_FILE" -noout -subject 2>/dev/null | sed 's/subject=//')"
  CERT_EXP="$(openssl x509 -in "$CERT_FILE" -noout -enddate 2>/dev/null | sed 's/notAfter=//')"
  CERT_INFO="$CERT_SUBJ / 過期: $CERT_EXP"
fi

# 根據 cert source 決定提示
if [[ "${CERT_SOURCE:-}" == "letsencrypt" ]]; then
  CERT_NOTE="✓ 用 Let's Encrypt(真 cert,瀏覽器自動 trust)"
elif [[ -n "${DOMAIN:-}" ]]; then
  CERT_NOTE="⚠ 用 self-signed cert(包含 domain SAN)— 第一次訪問會見到「連線不安全」警告。
     撳「進階」→「繼續前往 ${ACCESS_HOST}(不安全)」就可以。
     接受一次之後,瀏覽器 HSTS 會記住,之後就唔會再問。
     想消警告就裝 Let's Encrypt(見 README)"
else
  CERT_NOTE="⚠ 用 self-signed cert(IP-only)— 第一次訪問會見到「連線不安全」警告。
     撳「進階」→「繼續前往 ${HOST_IP}(不安全)」就可以。
     接受一次之後,瀏覽器 HSTS 會記住,之後就唔會再問。
     有 domain 嘅話強烈建議裝 Let's Encrypt(見 README)"
fi

cat <<EOF

  ✅ PM-System 已經運行( HTTPS )

  訪問 URL(本機):    https://localhost/
  訪問 URL(網絡):    ${ACCESS_URL}

  ${CERT_NOTE}

  憑證:  ${CERT_INFO}
  詳情:  openssl x509 -in ${CERT_FILE} -noout -subject -dates -ext subjectAltName

  常用指令:
    docker compose -p pm-system ps           # 睇 status
    docker compose -p pm-system logs -f      # 睇 logs
    docker compose -p pm-system restart      # 重啟
    docker compose -p pm-system down         # 停機(保留 data)

  換咗 server IP / cert 過期點算?
    bash $SCRIPT_DIR/regen-cert.sh           # 自動偵測 LE / self-signed 重新簽
    docker compose -p pm-system restart frontend

  完全清除(包埋 database):
    docker compose -p pm-system down -v

EOF
