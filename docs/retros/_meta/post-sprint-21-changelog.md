# Post-Sprint-21 Commit Changelog (2026-06-23)

**Source**: `git log 0aaea13..HEAD --reverse --pretty=format:"%h|%ad|%s" --date=short --name-only`
**Cutoff**: Sprint 21 retro closure `0aaea13` (2026-06-16)
**HEAD**: `92b5820` (2026-06-23)
**Scope**: 17 commits between retro and HEAD, grouped by 4 themes (release-build / docker upload / LLM timeout / wiki upload debug).

---

## Theme 1: Release-build (1 commit)

### `92b5820` chrod: build release update
- **Date**: 2026-06-23
- **Files**: `scripts/build-release.sh`
- **Summary**: 修一個關鍵 bug — external image (postgres) 之前用 bare source tag (`postgres:15-alpine`) save 入 tar,install.sh re-tag `pm-system-postgres:v1.0.6-amd64` 會撞 `No such image`。修法係 pull digest 後先 `docker tag "$IMAGE" "$TAG"` 再 save。Commit msg 應為 `chore:` 而非 `chrod:`(typo,已識別為 commit hygiene debt)。

---

## Theme 2: Docker upload (1 commit)

### `5340f30` chord: for docker backend upload file storage
- **Date**: 2026-06-17
- **Files**: `backend/Dockerfile`, `backend/src/index.ts`, `backend/src/utils/attachment-integrity.ts`, `deploy/docker-compose.client.yml`, `deploy/install.sh`, `scripts/build-release.sh`
- **Summary**: 引入 `backend/src/utils/attachment-integrity.ts`(144 行 startup self-check),scan Attachment table 搵 `storedPath` 喺 disk 唔存在嘅 row,non-blocking 跑喺 backend `index.ts` startup。`backend/Dockerfile` 加 `VOLUME ["/app/uploads"]` hint,`deploy/docker-compose.client.yml` mount `pm-system-uploads:/app/uploads` named volume(客戶機升級唔再 wipe 原始 uploaded file)。Commit msg typo `chord` → `chord`。

---

## Theme 3: LLM timeout (3 commits)

### `cd8b676` fix(documents): LLM call explicit timeout to avoid 'upstream prematurely closed'
- **Date**: 2026-06-17
- **Files**: `backend/src/routes/documents.ts`
- **Summary**: 引入 `LLM_TIMEOUT_MS = 240000`(4 分鐘)env-var,兩個 LLM fetch call 加 `AbortSignal.timeout(LLM_TIMEOUT_MS)`,短過 nginx `proxy_read_timeout 600s` 觸發。修 `upstream prematurely closed` nginx error。

### `04a5d79` fix(documents): LLM_TIMEOUT_MS 4 min → 1 min for faster error feedback
- **Date**: 2026-06-17
- **Files**: `backend/src/routes/documents.ts`
- **Summary**: 240s → 60s。對 fake model `openai/gpt-5.5` 嘅 case,user 1 分鐘內見到 error 而唔係等 4 分鐘後 refresh。

### `e1382fa` debug: for LLM timeout ⚠️ MISLEADING COMMIT MSG
- **Date**: 2026-06-17
- **Files**: `backend/src/routes/documents.ts`, `deploy/.env.client.example`, `deploy/docker-compose.client.yml`
- **Summary**: 雖然叫 `debug:` 但係真 fix — 改 `LLM_TIMEOUT_MS: 60s → 180s`(PROD 慢網 buffer),加 `LLM_TIMEOUT_MS` 喺 `.env.client.example` 同 `docker-compose.client.yml`(用戶 override 渠道)。**HEAD 嘅 final value = 180s**。Commit message 不符內容(已識別為 commit hygiene debt)。

---

## Theme 4: Wiki upload debug + nginx SSE (8 commits)

### `e1edb0d` feat(wiki): unlimited batch upload with SSE streaming + queue (US-21.4)
- **Date**: 2026-06-17
- **Files**: `backend/src/routes/documents.ts`, `frontend/src/components/WikiTab.tsx`, `frontend/src/pages/WikiPage.tsx`, `frontend/src/utils/api.ts`
- **Summary**: 加 `processBatchWithConcurrency` (3 workers), `ReadableStream` SSE endpoint,frontend `WikiTab` + `WikiPage` 接 SSE event stream。Sprint 21 US-21.4 主功能。

### `16736b4` fix(wiki): batchParseStream missing auth token
- **Date**: 2026-06-17
- **Files**: `frontend/src/utils/api.ts`
- **Summary**: frontend SSE call 漏咗 auth header,batch upload 後台 401。e1edb0d 嘅 quick fix。

### `84cc263` fix(nginx): HTTP/2 + SSE ERR_HTTP2_PROTOCOL_ERROR — disable http2, add streaming tuning
- **Date**: 2026-06-17
- **Files**: `frontend/nginx.conf.template`
- **Summary**: disable `http2 on;`(commented out),加 `proxy_buffering off` + `proxy_read_timeout 600s` + `proxy_send_timeout 600s`。HTTP/2 嘅 flow control / frame size 對 long-lived streaming response 唔友善。

### `16d0806` fix(nginx): SSE ERR_INCOMPLETE_CHUNKED_ENCODING — drop proxy_buffering off
- **Date**: 2026-06-17
- **Files**: `frontend/nginx.conf.template`
- **Summary**: revert `proxy_buffering off`(會破壞 end-of-chunks marker),改用 default + `gzip off` + `proxy_read_timeout 600s`。詳細 commit body 列出 3 個 rejected alternatives(`chunked_transfer_encoding off` / `proxy_buffer_size 0` / `proxy_http_version 1.0`)。

### `d2fd2f1` fix(nginx): force Connection: close on /api to fix SSE chunked encoding
- **Date**: 2026-06-17
- **Files**: `frontend/nginx.conf.template`
- **Summary**: HTTPS :443 server block 設 `keepalive_timeout 0`,disable keep-alive socket reuse 防 nginx 喺 keep-alive socket 上面 flush 唔切結尾 marker。

### `64a37fb` fix(nginx): force Connection: close response header on /api
- **Date**: 2026-06-17
- **Files**: `frontend/nginx.conf.template`
- **Summary**: 3 層防線:`add_header Connection close always` + `keepalive_requests 1` + 保留 `keepalive_timeout 0`。Raw socket 3 次 attempts 全 OK。

### `88c582d` fix(documents): safeSend wrapper for SSE controller closed race
- **Date**: 2026-06-17
- **Files**: `backend/src/routes/documents.ts`, `backend/src/routes/documents.test.ts`
- **Summary**: 加 `safeSend()` helper try/catch "Controller is already closed" silent drop,加 2 個 test 確認 web standard 行為。

### `2495812` debug for wiki upload ⚠️ MIXED: real fix + 9 殘留 console.log/warn
- **Date**: 2026-06-17
- **Files**: `backend/src/routes/documents.ts`
- **Summary**:
  - **真 fix**: SSE heartbeat 10s(`setInterval` emit `: heartbeat` SSE comment,防 nginx/browser idle close during LLM call)。
  - **🟡 殘留**: 9 個 `console.log`/`console.warn` 加喺 `documents.ts`(lines 438, 502, 511, 658, 1172, 1190, 1199, 1221, 1227)— **Sprint 22 必修 (TD-NEW-8 P0)**。Sprint 21 retro 未提及呢個 debug log 殘留。

---

## 附錄 A: Sprint 21 closure 餘波 (3 commits)

呢 3 個 commit 雖然屬於 Sprint 21 scope,但 retro closure 之後先 merge 落 master:

### `9315a20` feat(chat): resolve project by name or ID (US-21.6)
- **Date**: 2026-06-16
- **Files**: `backend/src/routes/chat.ts`, `backend/src/utils/project-resolver.ts`, `backend/src/utils/project-resolver.test.ts`
- **Summary**: 加 `project-resolver.ts` helper,chat tool 接受 project name 而唔只係 UUID。AI 助手可講「pm-system 項目」而唔係 UUID。

### `f3f4772` merge: US-21.6 AI 助手支援項目名稱 resolve
- **Date**: 2026-06-16
- **Files**: (merge commit)
- **Summary**: merge branch into master。

### `6ac2353` fix(docs): replace unavailable Alpine packages (US-21.1.1 hotfix)
- **Date**: 2026-06-16
- **Files**: `backend/Dockerfile`, `backend/src/routes/documents.ts`, `docs/retros/2026-06-16-sprint-21-wiki-improvements.md`
- **Summary**: Sprint 21 retro 提及嘅 hotfix:`antiword` + `wv` 取代 `catdoc`(Alpine 冇),`ssconvert` (gnumeric) 一個取代 `xls2csv` + ssconvert fallback 兩層。

---

## 附錄 B: Dev environment 改善 (1 commit)

### `07ef0b3` fix(dev): mount self-signed cert + expose HTTPS 8443
- **Date**: 2026-06-17
- **Files**: `docker-compose.yml`
- **Summary**: 本地 dev docker-compose mount cert + expose 8443 port。本地開發環境對齊 production HTTPS flow。

---

## Summary

| Theme | Commits | Status |
|-------|---------|--------|
| Release-build | 1 (`92b5820`) | ✅ |
| Docker upload | 1 (`5340f30`) | ✅ |
| LLM timeout | 3 (`cd8b676` / `04a5d79` / `e1382fa`) | ✅ |
| Wiki upload + nginx SSE | 8 | ⚠️ 1 cosmetic debt (2495812 console.log) |
| Sprint 21 closure 餘波 | 3 | ✅ |
| Dev environment | 1 | ✅ |
| **Total** | **17** | |

---

## Cross-references

- `docs/retros/_meta/post-sprint-21-debug-triage.md` — 9 commits 逐個真 fix vs 殘留 diagnostic 評估
- `docs/retros/_meta/post-sprint-21-regression-2026-06-23.md` — 84/84 tests pass + nginx -t PASS
- `docs/retros/_meta/build-release-audit-2026-06-23.md` — image name / env var / volume drift check
- `docs/retros/_meta/final-report-2026-06-23.md` — closing deliverable
- `docs/TECH-DEBT.md` — TD-NEW-8/9/10 entries
- `docs/retros/2026-06-23-sprint-22-skeleton.md` — Sprint 22 retro skeleton (What shipped pre-populated)