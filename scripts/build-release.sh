#!/usr/bin/env bash
# ============================================================
# PM-System — Build images + save per-arch .tar
#
# 設計:Q1 = B(分平台兩個 tarball)
#  - 唔用 multi-arch manifest list(會撞 docker.io push auth)
#  - 每個 arch 一份獨立 tag + 獨立 tar
#  - Frontend nginx platform-neutral, 1 份 tar 就夠(但為咗 install.sh
#    簡單, 我都 build 2 份, install.sh 揀返合 arch 嘅)
#
# 用法 (你 / CI 跑):
#   ./scripts/build-release.sh v1.0.0
#
# Output (deploy/dist/):
#   pm-system-frontend-v1.0.0-amd64.tar
#   pm-system-frontend-v1.0.0-arm64.tar
#   pm-system-backend-v1.0.0-amd64.tar
#   pm-system-backend-v1.0.0-arm64.tar
#   CHECKSUMS.sha256
#   RELEASE-NOTES.md
# ============================================================
set -euo pipefail

# ── 參數 ─────────────────────────────────────────────────────
VERSION="${1:-}"
if [[ -z "$VERSION" ]]; then
  echo "❌ 用法: $0 <version>   e.g. $0 v1.0.0"
  exit 1
fi
if [[ ! "$VERSION" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "❌ 版本格式要 vX.Y.Z (e.g. v1.0.0), 你入嘅: $VERSION"
  exit 1
fi

# ── 預備 ─────────────────────────────────────────────────────
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST_DIR="$PROJECT_ROOT/deploy/dist"
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

VERSION_ESCAPED="${VERSION#v}"   # v1.0.0 → 1.0.0 (sanity check 用)

echo "============================================================"
echo " PM-System Release Build (per-arch tarballs)"
echo " Version: $VERSION"
echo " Output:  $DIST_DIR"
echo "============================================================"

# ── 檢查 Docker buildx ──────────────────────────────────────
if ! docker buildx version >/dev/null 2>&1; then
  echo "❌ 需要 docker buildx"
  exit 1
fi

BUILDER_NAME="pm-system-multiarch"
if ! docker buildx inspect "$BUILDER_NAME" >/dev/null 2>&1; then
  echo "→ 建立 buildx builder: $BUILDER_NAME"
  docker buildx create --name "$BUILDER_NAME" --driver docker-container --bootstrap
fi
docker buildx use "$BUILDER_NAME"

# ── Build 1: Frontend 兩個 arch ──────────────────────────────
build_one() {
  local SERVICE="$1"   # frontend | backend
  local PLATFORM="$2"  # linux/amd64 | linux/arm64
  local SUFFIX="$3"    # amd64 | arm64

  local TAG="pm-system-${SERVICE}:${VERSION}-${SUFFIX}"
  local TAR="$DIST_DIR/pm-system-${SERVICE}-${VERSION}-${SUFFIX}.tar"

  echo ""
  echo "→ Build $SERVICE for $PLATFORM (tag: $TAG)"

  docker buildx build \
    --platform "$PLATFORM" \
    --tag "$TAG" \
    --file "$PROJECT_ROOT/$SERVICE/Dockerfile" \
    --load \
    "$PROJECT_ROOT/$SERVICE"

  echo "→ Save $TAG → $TAR"
  docker save -o "$TAR" "$TAG"
  echo "  ✓ $(du -h "$TAR" | cut -f1)"
}

build_one frontend linux/amd64 amd64
build_one frontend linux/arm64 arm64
build_one backend  linux/amd64 amd64
build_one backend  linux/arm64 arm64

# ── Checksums ─────────────────────────────────────────────────
echo ""
echo "→ 計 CHECKSUMS.sha256"
(
  cd "$DIST_DIR"
  shasum -a 256 \
    pm-system-frontend-${VERSION}-amd64.tar \
    pm-system-frontend-${VERSION}-arm64.tar \
    pm-system-backend-${VERSION}-amd64.tar \
    pm-system-backend-${VERSION}-arm64.tar \
    > CHECKSUMS.sha256
)
cat "$DIST_DIR/CHECKSUMS.sha256"

# ── Release notes template ────────────────────────────────────
RELEASE_NOTES="$DIST_DIR/RELEASE-NOTES.md"
cat > "$RELEASE_NOTES" <<EOF
# PM-System Release $VERSION

**Build date:** $(date -u +"%Y-%m-%d %H:%M UTC")
**Architectures:** linux/amd64, linux/arm64

## What's in this release

<!-- 寫返你今次 release 改咗咩: bug fixes, new features, breaking changes -->

- TBD

## Install (客戶機)

詳見 \`README.md\` 喺同一個 release package。

\`\`\`bash
./install.sh
# install.sh 自動偵測 arch(用 uname -m),揀返合 platform 嘅 tar load
\`\`\`

## Image contents (per-arch tarballs)

| Image | Architecture | File | Size |
|-------|--------------|------|------|
| pm-system-frontend | amd64 | pm-system-frontend-${VERSION}-amd64.tar | $(du -h "$DIST_DIR/pm-system-frontend-${VERSION}-amd64.tar" | cut -f1) |
| pm-system-frontend | arm64 | pm-system-frontend-${VERSION}-arm64.tar | $(du -h "$DIST_DIR/pm-system-frontend-${VERSION}-arm64.tar" | cut -f1) |
| pm-system-backend  | amd64 | pm-system-backend-${VERSION}-amd64.tar  | $(du -h "$DIST_DIR/pm-system-backend-${VERSION}-amd64.tar"  | cut -f1) |
| pm-system-backend  | arm64 | pm-system-backend-${VERSION}-arm64.tar  | $(du -h "$DIST_DIR/pm-system-backend-${VERSION}-arm64.tar"  | cut -f1) |

## Verification

\`\`\`
$(cat "$DIST_DIR/CHECKSUMS.sha256")
\`\`\`
EOF

echo ""
echo "============================================================"
echo " ✅ Build complete"
echo " Output directory: $DIST_DIR"
echo ""
ls -lh "$DIST_DIR"
echo "============================================================"
echo ""
echo "下一步:"
echo "  1. 改 RELEASE-NOTES.md 入面 'TBD' 嗰段"
echo "  2. 連同 deploy/docker-compose.client.yml + .env.client.example"
echo "     + install.sh + README.md + 4 個 tar 全部包成 tarball 寄畀客戶"
echo "============================================================"
