# Build-Release Pipeline Audit (2026-06-23)

**Auditor:** Claude (auto)
**HEAD:** `92b5820` (Tue Jun 23 10:08 +0800)
**Scope:** `scripts/build-release.sh` + `92b5820` commit + `deploy/dist/` + `deploy/docker-compose.client.yml` cross-check

---

## 1. What `92b5820` changed (diff summary)

Commit: `chrod: build release update` (typo: should be "chore", not blocking)

`scripts/build-release.sh` — 11 insertions, 1 deletion

| Change | Reason |
|--------|--------|
| Multi-arch path: insert `local TAG=pm-system-${SERVICE}:${VERSION}-${SUFFIX}` and `docker tag "$IMAGE" "$TAG"` between `docker pull $IMAGE@$DIGEST` and `docker save` | Without re-tag, the tarball contained only the source tag (`postgres:15-alpine`), and `install.sh` would `docker tag pm-system-postgres:v1.0.6-amd64` against a non-existent image → `No such image` error. |
| Multi-arch path: change `docker save --platform=$PLATFORM -o $TAR $IMAGE` → `... -o $TAR $TAG` | RepoTag inside the tar must be `pm-system-postgres:v1.0.6-amd64`, not `postgres:15-alpine`, for install.sh re-tag to find it. |
| Single-arch fallback: insert same `docker tag "$IMAGE" "$TAG"` before `docker save -o "$TAR" "$IMAGE"` | Same fix mirrored to single-arch fallback path. |

Net effect: tarballs now ship with the correct `pm-system-{svc}:{VERSION}-{SUFFIX}` RepoTag so `install.sh` can re-tag them to bare `$VERSION` for compose.

---

## 2. `deploy/dist/` state

```
CHECKSUMS.sha256                          610 B   2026-06-17 02:47
RELEASE-NOTES.md                          1.7 KB  2026-06-17 02:47
pm-system-backend-v1.0.5-amd64.tar      736 MB   2026-06-17 02:45
pm-system-backend-v1.0.5-arm64.tar      736 MB   2026-06-17 02:47
pm-system-frontend-v1.0.5-amd64.tar      64 MB   2026-06-17 02:44
pm-system-frontend-v1.0.5-arm64.tar      63 MB   2026-06-17 02:44
pm-system-postgres-v1.0.5-amd64.tar     264 MB   2026-06-17 02:47
pm-system-postgres-v1.0.5-arm64.tar     260 MB   2026-06-17 02:47
```

CHECKSUMS.sha256 has exactly 6 entries (2 arch × 3 services). RELEASE-NOTES.md says "Build date: 2026-06-16 18:47 UTC", v1.0.5.

**`.gitignore`:** `deploy/dist/` IS ignored — these are local artifacts, NOT in git. Good.

---

## 3. Drift analysis: build script ↔ docker-compose.client.yml ↔ install.sh

| Aspect | build-release.sh | docker-compose.client.yml | install.sh | Verdict |
|--------|------------------|---------------------------|------------|---------|
| Image name (frontend) | `pm-system-frontend:${VERSION}-${SUFFIX}` | `pm-system-frontend:${VERSION:-v1.0.0}` | re-tag to `pm-system-frontend:${VERSION}` | ✅ Match via re-tag |
| Image name (backend) | `pm-system-backend:${VERSION}-${SUFFIX}` | `pm-system-backend:${VERSION:-v1.0.0}` | re-tag to `pm-system-backend:${VERSION}` | ✅ Match via re-tag |
| Image name (postgres) | `pm-system-postgres:${VERSION}-${SUFFIX}` (re-tagged from `postgres:15-alpine`) | `pm-system-postgres:${VERSION:-v1.0.0}` | re-tag to `pm-system-postgres:${VERSION}` | ✅ Match via re-tag |
| Tarball filename | `pm-system-{svc}-${VERSION}-${SUFFIX}.tar` | n/a | `ls pm-system-{svc}-${VERSION}-${ARCH_DIR}.tar` | ✅ Match |
| VERSION default | arg required (e.g. `v1.0.0`) | `${VERSION:-v1.0.0}` | required from `.env` | ⚠️ Defaults differ — compose defaults `v1.0.0`; build script rejects empty. **In practice install.sh requires VERSION in .env so this is fine.** |
| ARCH detection | n/a (builds both) | n/a | `uname -m` → `x86_64→amd64`, `aarch64→arm64` | ✅ |
| Env: `DB_USER/PASSWORD/NAME` | n/a | read from `${DB_USER}` etc. | validated in `.env` placeholder check | ✅ |
| Env: `JWT_SECRET` | n/a | `${JWT_SECRET:?JWT_SECRET 必填}` | validated in `.env` placeholder check | ✅ |
| Env: `LLM_TIMEOUT_MS` | n/a | `${LLM_TIMEOUT_MS:-180000}` | `.env.client.example` ships `180000` | ✅ |
| Volume: `pm-system-uploads` | n/a | `pm-system-uploads:/app/uploads` (backend) | explicit `docker volume create pm-system-uploads` | ✅ |
| Volume: `postgres_data` | n/a | `postgres_data:/var/lib/postgresql/data` | auto-created by compose | ✅ |
| Cert mount | n/a | `./docker/certs:/etc/nginx/certs:ro` | `$SCRIPT_DIR/docker/certs/server.{crt,key}` | ✅ (relative to deploy/) |
| Container port (frontend) | n/a | 80 + 443 (mapped to `${FRONTEND_HOST_PORT}:80` and `${FRONTEND_HTTPS_HOST_PORT}:443`) | health check uses `${FRONTEND_HTTPS_HOST_PORT:-443}` | ✅ |
| Container port (backend) | n/a | expose 4000 (internal only) | health URL `/api/projects` via nginx | ✅ |

**No critical drift found in the static configuration.**

---

## 4. Findings

### 🔴 F1: deploy/dist tarballs are stale (v1.0.5) — predate the 92b5820 fix

The v1.0.5 tarballs were built 2026-06-16 18:47 UTC, **before**:
- `5340f30` (2026-06-17) — added `attachment-integrity.ts`, modified backend `Dockerfile`, `src/index.ts`, `deploy/docker-compose.client.yml`, `install.sh`, `build-release.sh`
- `92b5820` (2026-06-23) — fixed the `pm-system-postgres` re-tag step

If anyone ships the v1.0.5 tarballs to a customer (or even runs `install.sh` against them locally), the workflow proceeds because install.sh re-tags after `docker load`. The pre-92b5820 tarballs would have had `RepoTag = postgres:15-alpine` inside, which would have caused `docker tag pm-system-postgres:v1.0.5-amd64 ...` to fail with "No such image". So the v1.0.5 tarballs locally are **post-5340f30 but pre-92b5820** — they work for install but the wrong process was used to build them.

**Recommendation:** `rm -rf deploy/dist && ./scripts/build-release.sh v1.0.6` (or current version) before next customer release.

### 🟡 F2: RELEASE-NOTES.md "What's in this release" is still `- TBD`

The build script writes a template with `- TBD`. There's no automation to fill it in. Every build ships with a placeholder. Risk: customer sees `- TBD` and questions the build integrity.

**Recommendation:** Either populate the section in the script from `git log $PREV_TAG..HEAD` or add a pre-ship checklist "edit RELEASE-NOTES.md before packaging."

### 🟡 F3: Commit message typo `chrod` → should be `chore`

Cosmetic. 92b5820 `chrod:` should be `chore:`. Recurring typo pattern in this repo (also see `chord:`). Not blocking but should self-correct in future.

### 🟡 F4: Misleading comment in build-release.sh line 38

> `# ⚠️ 保持同 deploy/docker-compose.client.yml 嘅 db.image 一致`

The compose file says `image: pm-system-postgres:${VERSION:-v1.0.0}` (re-tagged local), but the build script sources from `postgres:15-alpine`. The consistency is via the install.sh re-tag step, not literal `db.image` value. The comment is slightly misleading but the actual flow is correct.

**Recommendation:** Reword to "compose expects `pm-system-postgres:$VERSION` after install.sh re-tag — script must re-tag before save (see 92b5820)".

### 🟢 F5: Tag re-tag race

`install.sh` checks `docker image inspect pm-system-{svc}:$VERSION` before re-tagging. If a prior install left a `:v1.0.5` image, the re-tag to `:v1.0.5-amd64` would **overwrite silently**. Not a bug, just noting. The warning message "image 已經 load 過... skip" handles the happy path; the re-tag step is idempotent.

---

## 5. CI readiness checklist

| Requirement | Where | Status |
|-------------|-------|--------|
| `docker buildx` | build-release.sh:57 | ✅ check + clear error |
| `docker save --platform` (Docker 27+) | build-release.sh:61 | ✅ check + clear error |
| `jq` | build-release.sh:66 | ✅ check + clear error |
| `shasum` (or sha256sum) | build-release.sh:187 | macOS-only `shasum` — CI Linux runners will fail! |
| `openssl` | install.sh:41 | ✅ check |
| `docker compose v2` | install.sh:37 | ✅ check |

**🔴 F6: `shasum` is macOS-only.** On Linux CI runners (GitHub Actions Ubuntu, etc.), `shasum` is **not** installed by default. The release build will fail at the CHECKSUMS step.

**Recommendation:** Use `sha256sum` (POSIX) with fallback to `shasum`:
```bash
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum pm-system-...-amd64.tar ...
else
  shasum -a 256 pm-system-...-amd64.tar ...
fi
```

---

## 6. Verification commands

```bash
# Confirm deploy/dist is gitignored
git check-ignore -v deploy/dist/pm-system-frontend-v1.0.5-amd64.tar
# → .gitignore:15:deploy/dist/   deploy/dist/pm-system-...

# Confirm tarball RepoTag matches install.sh expectation
docker load -i deploy/dist/pm-system-postgres-v1.0.5-amd64.tar
docker image inspect pm-system-postgres:v1.0.5-amd64 --format '{{.RepoTags}}'
# Should print [pm-system-postgres:v1.0.5-amd64] — NOT just [postgres:15-alpine]
# (v1.0.5 may predate the fix — verify the 92b5820 re-tag is present)

# Confirm install.sh re-tag targets exist
grep -n "docker tag" deploy/install.sh
# → lines 225-227: re-tag to bare $VERSION

# Confirm compose image refs
grep "image:" deploy/docker-compose.client.yml
# → 3 services, all :${VERSION:-v1.0.0}
```

---

## 7. Summary

✅ Image names, env vars, ports, volumes, cert mount, arch detection — **all consistent across build → tar → install → compose**.
✅ deploy/dist is gitignored (no risk of accidental commit).
✅ 92b5820 fix correctly addresses the re-tag step.

🔴 **Action required before next release:**
1. Re-build deploy/dist (F1) — current v1.0.5 is stale.
2. Replace `shasum` with portable `sha256sum` (F6) — blocks Linux CI.
3. Fill in RELEASE-NOTES.md `- TBD` section (F2) — customer-facing.
4. Fix commit message typo (F3) — cosmetic.
5. Reword misleading comment in build-release.sh:38 (F4) — clarify the re-tag flow.
