# Post-Sprint-21 Debug/Fix Commit Triage (2026-06-23)

**Auditor:** Claude (auto)
**HEAD:** `92b5820`
**Scope:** Triage `e1382fa`, `2495812`, nginx SSE series (`84cc263`/`16d0806`/`d2fd2f1`/`64a37fb`/`88c582d`) + related LLM timeout fixes (`cd8b676`/`04a5d79`).

Question per commit: **final fix or intermediate diagnostic with residual debug log?**

---

## 1. LLM Timeout series — `cd8b676` → `04a5d79` → `e1382fa`

### `cd8b676` — fix(documents): LLM call explicit timeout (1 commit)

| | |
|---|---|
| Date | 2026-06-17 01:49 |
| Files | `backend/src/routes/documents.ts` |
| Δ | +26 / -2 |
| **Verdict** | ✅ **Real fix** |
| Debug logs left? | ❌ None |

Introduces `LLM_TIMEOUT_MS = 240000` (4 min) constant + applies `AbortSignal.timeout(LLM_TIMEOUT_MS)` to both LLM fetch calls. Pure code change, no console statements.

### `04a5d79` — fix(documents): LLM_TIMEOUT_MS 4 min → 1 min

| | |
|---|---|
| Date | 2026-06-17 02:07 |
| Files | `backend/src/routes/documents.ts` |
| Δ | +16 / -7 |
| **Verdict** | ✅ **Real fix** |
| Debug logs left? | ❌ None (just changes comment + default value 240000 → 60000) |

Bumps default to 60s for faster error feedback on `openai/gpt-5.5` fake-model case. Justifies the change with "user refreshes browser at 28s → safeSend silent drop" scenario. Clean fix.

### `e1382fa` — **debug: for LLM timeout** ⚠️ MISLEADING COMMIT MESSAGE

| | |
|---|---|
| Date | 2026-06-17 12:35 |
| Files | `backend/src/routes/documents.ts`, `deploy/.env.client.example`, `deploy/docker-compose.client.yml` |
| Δ | +37 / -9 |
| **Verdict** | ✅ **Real fix** (despite the "debug:" prefix) |
| Debug logs left? | ❌ None |

**This is NOT a debug commit.** Despite the misleading `debug:` commit message, it is a **production hotfix** that:
1. Bumps `LLM_TIMEOUT_MS` from 60000 → **180000 (3 min)** for PROD network buffer
2. Adds `LLM_TIMEOUT_MS` to `.env.client.example` with full documentation block
3. Adds `LLM_TIMEOUT_MS: ${LLM_TIMEOUT_MS:-180000}` to `docker-compose.client.yml` so user override works

The current HEAD value (180000) comes from this commit. This is the **FINAL** LLM_TIMEOUT_MS value.

**Recommendation:** Future commit-message hygiene — `debug:` should be reserved for commits that ADD diagnostic logs or print statements. This commit shipped a real config + code change.

---

## 2. `2495812` — **debug for wiki upload** ⚠️ MIXED: real fix + 9 residual console.log/warn

| | |
|---|---|
| Date | 2026-06-17 02:43 |
| Files | `backend/src/routes/documents.ts` |
| Δ | +66 / -0 |
| **Verdict** | 🟡 **MIXED** — half real fix, half leftover diagnostic |
| Debug logs left? | ⚠️ **YES — 9 console.log/warn statements still in HEAD** |

This commit contains TWO things:

### ✅ Real fix: SSE heartbeat every 10s

```
let heartbeatTimer = setInterval(() => {
  try { controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`)) }
  catch { clearInterval(heartbeatTimer); heartbeatTimer = null }
}, 10_000)
```

This is a genuine production fix that prevents nginx/browser from closing idle SSE connections during long LLM calls. Properly documented (root cause analysis, SSE spec compliance).

### ⚠️ Residual debug logging (9 statements, all still in HEAD)

```
Line 438:  console.log(`[batch-parse] processFile start: ${fileLabel}`)
Line 502:  console.log(`[batch-parse] LLM call start: ${fileInfo.fileName} (${isPdfFile ? 'pdf' : 'text'}, ${(fileInfo.fileSize / 1024).toFixed(1)}KB)`)
Line 511:  console.log(`[batch-parse] LLM call done in ${llmElapsed}s: ${fileInfo.fileName} ${llmResult.error ? `ERROR=...` : `OK (...chars)`}`)
Line 658:  console.warn(`[safeSend] controller closed when sending type=${payloadType} — silent drop`)
Line 1172: console.log(`[batch-parse] stream start: ${total} files, concurrency=${BATCH_CONCURRENCY}`)
Line 1190: console.log(`[batch-parse] file ${index + 1}/${total} done in ${elapsed}s: ${result.name} success=${result.success}${result.error ? ` error=...` : ''}`)
Line 1199: console.log(`[batch-parse] all done in ${totalElapsed}s: ${successful} ok, ${failed} failed, ${wikiPagesCreatedInner} wiki pages`)
Line 1221: console.log(`[batch-parse] stream closed after ${...}s`)
Line 1227: console.warn(`[batch-parse] stream cancelled by consumer:`, reason)
```

**These logs are diagnostic, not operational.** They were useful while debugging the SSE chunked-encoding saga but should not ship to PROD — they leak file names, sizes, LLM elapsed times, and stream lifecycle events into customer log files (which are 10MB rotation × 3 files = 30MB per customer instance).

---

## 3. nginx SSE series — all real fixes ✅

### `84cc263` — fix(nginx): HTTP/2 + SSE ERR_HTTP2_PROTOCOL_ERROR

| | |
|---|---|
| Date | 2026-06-17 00:48 |
| Files | `frontend/nginx.conf.template` |
| Δ | +17 / -2 |
| **Verdict** | ✅ Real fix |

Disables HTTP/2 (commented out), adds `proxy_buffering off`, `proxy_read_timeout 600s`, `proxy_send_timeout 600s`. Documents HTTP/2 flow-control incompatibility with long-lived SSE.

### `16d0806` — fix(nginx): SSE ERR_INCOMPLETE_CHUNKED_ENCODING

| | |
|---|---|
| Date | 2026-06-17 01:04 |
| Files | `frontend/nginx.conf.template` |
| Δ | +14 / -8 |
| **Verdict** | ✅ Real fix (regression correction) |

Removes `proxy_buffering off` (added in 84cc263) — `off` was preventing nginx from emitting end-of-chunks marker (0\r\n\r\n). Detailed commit message documenting 3 rejected alternatives.

### `d2fd2f1` — fix(nginx): force Connection: close on /api

| | |
|---|---|
| Date | 2026-06-17 01:21 |
| Files | `frontend/nginx.conf.template` |
| Δ | +28 / -10 |
| **Verdict** | ✅ Real fix |

Adds `keepalive_timeout 0` to disable keep-alive socket reuse. Documents root cause via raw socket test. 

### `64a37fb` — fix(nginx): force Connection: close response header on /api

| | |
|---|---|
| Date | 2026-06-17 01:39 |
| Files | `frontend/nginx.conf.template` |
| Δ | +19 / -12 |
| **Verdict** | ✅ Real fix (3-layer defense) |

Adds `add_header Connection close always` + `keepalive_requests 1` + retains `keepalive_timeout 0`. Three-layer defense.

### `88c582d` — fix(documents): safeSend wrapper for SSE controller closed race

| | |
|---|---|
| Date | 2026-06-17 01:30 |
| Files | `backend/src/routes/documents.ts`, `backend/src/routes/documents.test.ts` |
| Δ | +127 / -3 |
| **Verdict** | ✅ Real fix (with tests) |

Adds `safeSend()` helper that swallows "Controller is already closed" errors silently. Includes 2 tests verifying web-standard behavior. Documents race scenario in commit body.

**Note**: This commit is in the documents.ts series, not nginx — but it's part of the SSE fix story. The 88c582d safeSend function later had 2 console.warn statements added inside it by 2495812 (lines 658, 662 of HEAD). These should also be removed/conditional.

---

## 4. Summary verdict

| Commit | Type | Final fix? | Debug log residue? | Action |
|--------|------|------------|-------------------|--------|
| `e1382fa` | LLM timeout bump | ✅ Yes (despite misleading `debug:`) | None | Rename in retrospective doc only |
| `cd8b676` | LLM_TIMEOUT_MS add | ✅ Yes | None | — |
| `04a5d79` | LLM_TIMEOUT_MS 4min→1min | ✅ Yes (then superseded) | None | — |
| `2495812` | Wiki upload debug + heartbeat | 🟡 **Mixed** | ⚠️ **9 console.log/warn** | 🔴 **Follow-up required** |
| `84cc263` | nginx disable http2 | ✅ Yes | None | — |
| `16d0806` | nginx drop proxy_buffering off | ✅ Yes | None | — |
| `d2fd2f1` | nginx keepalive_timeout 0 | ✅ Yes | None | — |
| `64a37fb` | nginx Connection: close header | ✅ Yes | None | — |
| `88c582d` | safeSend wrapper | ✅ Yes | ⚠️ 2 console.warn added later by 2495812 | 🔴 **Covered by 2495812 follow-up** |

---

## 5. Follow-up required

### 🔴 F1: Remove / gate 11 console.log/warn in documents.ts

**Source**: `2495812` introduced 9 statements + 2 inside `safeSend` (88c582d).

**Lines** (current HEAD):
```
438, 502, 511, 658, 662, 1172, 1190, 1199, 1221, 1227
```

**Recommendation** — Option A (preferred, prod-clean):
```ts
const DEBUG = process.env.NODE_ENV !== 'production' || process.env.DEBUG_BATCH_PARSE === '1'
// ...
if (DEBUG) console.log(`[batch-parse] stream start: ${total} files`)
```

**Recommendation** — Option B (aggressive):
Delete all 9 statements outright. They were diagnostic-only.

**Risk if not removed**:
- Customer log files (10MB × 3 rotation = 30MB) will contain batch-parse progress noise
- File names, sizes, LLM elapsed times leak into logs that may be shared with support
- Log volume grows unbounded per upload batch

### 🟡 F2: Document module-level story arc

The 5-commit nginx saga (`84cc263` → `16d0806` → `d2fd2f1` → `64a37fb`) is a goldmine of "what we tried and rejected". A new doc should capture:

- Why HTTP/2 was disabled (HTTP/2 flow control + SSE incompatibility)
- Why `proxy_buffering off` was tried then reverted (it broke end-of-chunks marker)
- Why keep-alive was disabled (keep-alive socket doesn't flush end-of-chunks marker)
- The 3-layer Connection: close defense

**Suggested location**: `docs/SSE-NGINX-TUNING.md` (new) or add to existing `docs/REGRESSION-GUARD.md`.

### 🟢 F3: Commit-message hygiene guideline

Both `e1382fa` (real fix labeled `debug:`) and `2495812` (mixed fix+diag labeled `debug`) are confusing. The repo would benefit from a `CONTRIBUTING.md` rule:
- `fix:` for behavior-changing commits
- `debug:` ONLY for commits that ADD diagnostic logs and **don't change behavior**
- `chore:` for build/release/tooling

Past commits can't be retroactively renamed but new ones should follow.

---

## 6. Verification commands

```bash
# Confirm current LLM_TIMEOUT_MS = 180000
grep "const LLM_TIMEOUT_MS" backend/src/routes/documents.ts

# Confirm 2495812 leftover logs
grep -nE "console\.(log|warn)" backend/src/routes/documents.ts | grep -E "\[batch-parse\]|\[safeSend\]"

# Confirm heartbeat function still in place
grep -n "heartbeatTimer\|heartbeat " backend/src/routes/documents.ts | head -5

# Confirm nginx 3-layer Connection: close defense
grep -E "keepalive_timeout|keepalive_requests|Connection.*close" frontend/nginx.conf.template
```

---

## 7. Final verdict

**5 of 9 commits are clean real fixes** (LLM timeout 3-commit chain + nginx SSE 4-commit chain + safeSend).

**1 commit (`e1382fa`) is mislabeled** — should be `fix(documents): LLM_TIMEOUT_MS 60s → 180s for PROD network`.

**1 commit (`2495812`) is a half-finished fix** — the SSE heartbeat is real, but 9 diagnostic logs were left in production code. **This requires follow-up.**

**Affected module docs to update:**
- `docs/SSE-NGINX-TUNING.md` (new) — capture the 5-commit nginx saga
- `docs/retros/2026-06-16-sprint-21-wiki-improvements.md` — add note that wiki upload debug logs were not cleaned up before Sprint 21 closure