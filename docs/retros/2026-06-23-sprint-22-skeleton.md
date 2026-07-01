# PLAN-22 — Sprint 22 Post-Sprint-21 Follow-up (2026-06-23)

> **Type**: Skeleton (template fill-in pending team review)
> **Source template**: `docs/retros/2026-06-16-sprint-21-wiki-improvements.md`
> **Audit reports pre-filling this retro**:
> - `docs/retros/_meta/post-sprint-21-changelog.md` (t1 commit group)
> - `docs/retros/_meta/build-release-audit-2026-06-23.md` (t2 build-release)
> - `docs/retros/_meta/post-sprint-21-debug-triage.md` (t3 debug commits)
> - `docs/retros/_meta/post-sprint-21-regression-2026-06-23.md` (t4 regression)

---

## Scope

Sprint 22 唔係 feature sprint — 係 post-Sprint-21 **audit + cleanup sprint**。Sprint 21 retro (`2026-06-16`) 收咗口之後,6 日內 (2026-06-16 ~ 2026-06-23) 落了 **17 個 commit** 修 SSE chunked encoding、LLM timeout、docker upload storage 等 hotfix,但**冇 systematic audit 跟進**。Sprint 22 嘅工作係:

1. **Audit 過去 6 日嘅改動** — 識別哪些係真 fix、哪些係 debug log 殘留、哪些係 workaround chain
2. **Register 3 個 TECH-DEBT entry** — TD-NEW-8 (P0 console.log 殘留) / TD-NEW-9 (P1 nginx SSE 重整) / TD-NEW-10 (P1 docker upload 跟進)
3. **驗證 ship-readiness** — 跑 regression sweep (backend tests + nginx -t smoke)
4. **Capture 4 份 audit report 入 `docs/retros/_meta/`** 防止 context 流失

**核心 audit tasks**:
- **t1** Commit audit (17 個 commit 按 4 主題分組: release-build / docker upload / LLM timeout / wiki upload debug)
- **t2** Build-release artifact verification (image name / env var / volume 對齊)
- **t3** Debug/fix commit triage (真 fix vs 殘留 diagnostic)
- **t4** Regression sweep (backend 84 tests + nginx -t)
- **t5** Tracker update (TECH-DEBT + QA-TRACKER 加 3 個新 entry)

---

## What shipped (pre-populated from t1)

> **Source**: `docs/retros/_meta/post-sprint-21-changelog.md`
> **17 commits** between Sprint 21 retro (`0aaea13`) and HEAD (`92b5820`), grouped by theme:

### Theme 1: Release-build (1 commit)

- **`92b5820`** `chrod: build release update` — `scripts/build-release.sh`+11/-1 修一個關鍵 bug:external image (postgres) 之前用 bare source tag (`postgres:15-alpine`) save 入 tar,install.sh re-tag `pm-system-postgres:v1.0.6-amd64` 會撞 `No such image`。修法係 pull digest 後先 `docker tag "$IMAGE" "$TAG"` 再 save。Commit msg 應為 `chore:` 而非 `chrod:`(typo)。**Files**: `scripts/build-release.sh`

### Theme 2: Docker upload (1 commit)

- **`5340f30`** `chord: for docker backend upload file storage` — 引入 `backend/src/utils/attachment-integrity.ts`(144 行 startup self-check),scan Attachment table 搵 `storedPath` 喺 disk 唔存在嘅 row,non-blocking 跑喺 backend `index.ts` startup。`backend/Dockerfile` 加 `VOLUME ["/app/uploads"]` hint,`deploy/docker-compose.client.yml` mount `pm-system-uploads:/app/uploads` named volume(客戶機升級唔再 wipe 原始 uploaded file)。**Files**: `backend/Dockerfile`, `backend/src/index.ts`, `backend/src/utils/attachment-integrity.ts`, `deploy/docker-compose.client.yml`, `deploy/install.sh`, `scripts/build-release.sh`

### Theme 3: LLM timeout (3 commits)

- **`cd8b676`** `fix(documents): LLM call explicit timeout to avoid 'upstream prematurely closed'` — 引入 `LLM_TIMEOUT_MS = 240000`(4 分鐘)env-var,兩個 LLM fetch call 加 `AbortSignal.timeout(LLM_TIMEOUT_MS)`,短過 nginx `proxy_read_timeout 600s` 觸發。**Files**: `backend/src/routes/documents.ts`
- **`04a5d79`** `fix(documents): LLM_TIMEOUT_MS 4 min → 1 min for faster error feedback` — 240s → 60s。對 fake model `openai/gpt-5.5` 嘅 case,user 1 分鐘內見到 error 而唔係等 4 分鐘後 refresh。**Files**: `backend/src/routes/documents.ts`
- **`e1382fa`** `debug: for LLM timeout` — **MISLEADING commit msg** — 雖然叫 `debug:` 但係真 fix,改 `LLM_TIMEOUT_MS: 60s → 180s`(PROD 慢網 buffer),加 `LLM_TIMEOUT_MS` 喺 `.env.client.example` 同 `docker-compose.client.yml`(用戶 override 渠道)。**Files**: `backend/src/routes/documents.ts`, `deploy/.env.client.example`, `deploy/docker-compose.client.yml`

### Theme 4: Wiki upload debug + nginx SSE (8 commits, 12 個實際 file)

**Initial batch upload + auth fix**:
- **`e1edb0d`** `feat(wiki): unlimited batch upload with SSE streaming + queue (US-21.4)` — 加 `processBatchWithConcurrency` (3 workers), `ReadableStream` SSE endpoint,frontend `WikiTab` + `WikiPage` 接 SSE event stream。**Files**: `backend/src/routes/documents.ts`, `frontend/src/components/WikiTab.tsx`, `frontend/src/pages/WikiPage.tsx`, `frontend/src/utils/api.ts`
- **`16736b4`** `fix(wiki): batchParseStream missing auth token` — frontend SSE call 漏咗 auth header,batch upload 後台 401。**Files**: `frontend/src/utils/api.ts`

**nginx SSE 4-commit workaround chain**:
- **`84cc263`** `fix(nginx): HTTP/2 + SSE ERR_HTTP2_PROTOCOL_ERROR — disable http2, add streaming tuning` — disable `http2 on;`(commented out),加 `proxy_buffering off` + `proxy_read_timeout 600s` + `proxy_send_timeout 600s`。**Files**: `frontend/nginx.conf.template`
- **`16d0806`** `fix(nginx): SSE ERR_INCOMPLETE_CHUNKED_ENCODING — drop proxy_buffering off` — revert `proxy_buffering off`(會破壞 end-of-chunks marker),改用 default + `gzip off` + `proxy_read_timeout 600s`。**Files**: `frontend/nginx.conf.template`
- **`d2fd2f1`** `fix(nginx): force Connection: close on /api to fix SSE chunked encoding` — HTTPS :443 server block 設 `keepalive_timeout 0`,disable keep-alive socket reuse 防 nginx 喺 keep-alive socket 上面 flush 唔切結尾 marker。**Files**: `frontend/nginx.conf.template`
- **`64a37fb`** `fix(nginx): force Connection: close response header on /api` — 3 層防線:`add_header Connection close always` + `keepalive_requests 1` + 保留 `keepalive_timeout 0`。Raw socket 3 次 attempts 全 OK。**Files**: `frontend/nginx.conf.template`

**Backend SSE controller safety**:
- **`88c582d`** `fix(documents): safeSend wrapper for SSE controller closed race` — 加 `safeSend()` helper try/catch "Controller is already closed" silent drop,加 2 個 test 確認 web standard 行為。**Files**: `backend/src/routes/documents.ts`, `backend/src/routes/documents.test.ts`

**Wiki upload debug commit (含真 fix + 殘留 diagnostic)**:
- **`2495812`** `debug for wiki upload` — 真 fix:SSE heartbeat 10s(`setInterval` emit `: heartbeat` SSE comment,防 nginx/browser idle close during LLM call)。殘留:9 個 `console.log`/`console.warn` 加喺 `documents.ts`(lines 438, 502, 511, 658, 1172, 1190, 1199, 1221, 1227)— **Sprint 22 必須清**(TD-NEW-8)。**Files**: `backend/src/routes/documents.ts`

### Theme 5 (附錄):Sprint 21 closure 餘波 (3 commits)

呢 3 個 commit 雖然屬於 Sprint 21 scope,但 retro closure 之後先 merge 落 master:

- **`9315a20`** `feat(chat): resolve project by name or ID (US-21.6)` — 加 `project-resolver.ts` helper,chat tool 接受 project name 而唔只係 UUID。**Files**: `backend/src/routes/chat.ts`, `backend/src/utils/project-resolver.ts`, `backend/src/utils/project-resolver.test.ts`
- **`f3f4772`** `merge: US-21.6 AI 助手支援項目名稱 resolve` — merge branch into master。
- **`6ac2353`** `fix(docs): replace unavailable Alpine packages (US-21.1.1 hotfix)` — Sprint 21 retro 提及嘅 hotfix:`antiword` + `wv` 取代 `catdoc`(Alpine 冇),`ssconvert` (gnumeric) 一個取代 `xls2csv` + ssconvert fallback 兩層。**Files**: `backend/Dockerfile`, `backend/src/routes/documents.ts`, `docs/retros/2026-06-16-sprint-21-wiki-improvements.md`

### Theme 6 (附錄):Dev environment 改善 (1 commit)

- **`07ef0b3`** `fix(dev): mount self-signed cert + expose HTTPS 8443` — 本地 dev docker-compose mount cert + expose 8443 port。**Files**: `docker-compose.yml`

---

## Implementation plan (audit tasks, all DONE)

| Task | Status | Output |
|------|--------|--------|
| **t1** Commit audit | ✅ DONE | `docs/retros/_meta/post-sprint-21-changelog.md` |
| **t2** Build-release audit | ✅ DONE | `docs/retros/_meta/build-release-audit-2026-06-23.md` |
| **t3** Debug commit triage | ✅ DONE | `docs/retros/_meta/post-sprint-21-debug-triage.md` |
| **t4** Regression sweep | ✅ DONE (84/84 pass + nginx -t PASS) | `docs/retros/_meta/post-sprint-21-regression-2026-06-23.md` |
| **t5** Tracker update | ✅ DONE | `docs/TECH-DEBT.md` + `docs/QA-TRACKER.md` 加 3 entry + Sprint 22 candidate + 收工摘要 |

---

## Risks

> ⚠️ **Pre-populated from audit reports, team 應該 review / 補充**:

- **🔴 TD-NEW-8 (P0)**: `2495812` 殘留 9 個 console.log/warn 喺 `backend/src/routes/documents.ts` — 客戶 log 噪音 + 資料外洩 (file name / size / LLM elapsed time)。**Sprint 22 第一日必修**。詳見 `post-sprint-21-debug-triage.md` § 5 F1。
- **🟡 TD-NEW-9 (P1)**: nginx SSE 4-commit workaround chain 應該 eventually 重整 (HTTP/2 multiplexing、keepalive reuse)。當前 performance overhead 可接受 (~30ms/SPA load),追蹤 nginx 1.27+ HTTP/2 streaming fix。詳見 `post-sprint-21-debug-triage.md` § 5 F2 + `build-release-audit-2026-06-23.md` § 4。
- **🟡 TD-NEW-10 (P1)**: Docker backend upload file storage 跟進 — `attachment-integrity` startup check 只 log 唔 recover,客戶升級 v1.0.7 之後第一個 sprint 要 review `[attachment-integrity]` log,有 > 0 missing 就要通知客戶 + 補 admin endpoint `GET /api/attachments/integrity-report`。詳見 `build-release-audit-2026-06-23.md` § 4。
- **🟡 t2 F1**: `deploy/dist/` v1.0.5 stale tarball (build date 2026-06-16),predate `5340f30` + `92b5820` 嘅 fix。**Ship 客戶前必須 `rm -rf deploy/dist && ./scripts/build-release.sh v1.0.6`**。
- **🔴 t2 F6**: `scripts/build-release.sh:187` 用 `shasum -a 256`(macOS-only)。**Linux CI runner 直接 fail** at CHECKSUMS step。要改 `sha256sum` + fallback。

---

## What we learned

<!-- Team 應該填呢度 — David / sprint 22 開會時討論 -->

_(blank — team fill-in)_

**Recommended prompts** (from t3 / t4 audit):

1. **Commit message hygiene** — `debug:` 標籤被誤用 (`e1382fa` 真 fix 叫 debug,`2495812` 半成品 debug 但含真 fix)。需 CONTRIBUTING.md 規則:`fix:` for behavior change, `debug:` ONLY for diagnostic-only commits, `chore:` for build/release/tooling。
2. **Sprint retro gap** — Sprint 21 retro 只記錄 "Sprint 21 closed" 但冇 audit 個別 commit 嘅 console.log 殘留。Sprint 22 retro 模板要加 "residual debug log check" 段。
3. **docker shasum macOS-only** — `scripts/build-release.sh` 嘅 `shasum` 喺 Linux CI 必 fail。CI environment 與 dev environment 唔一致嘅典型例子。
4. **nginx -t smoke test 需要 fake host** — standalone container 解析唔到 docker-compose service name,smoke test setup 要 `--add-host backend:127.0.0.1` 或 `echo '127.0.0.1 backend' >> /etc/hosts`。
5. **長 sprint 隱藏 bug** — 17 commits / 6 日 反映 Sprint 21 closure 之後有大量 hotfix 集中爆發,表示 wiki upload + SSE 範疇嘅 NFR 未完整收口(Sprint 21 plan 冇包括 nginx config / LLM timeout hotfix)。

---

## Next sprint candidates (Sprint 23 + backlog)

<!-- Team 應該填呢度 — David / sprint 22 結束時確定優先級 -->

_(blank — team fill-in)_

**Pre-loaded 5 個** (from TD-NEW-8/9/10 + t2 findings + audit recommendations):

| Priority | Item | Source | Effort |
|----------|------|--------|--------|
| **P0** | 清 `2495812` 9 個 console.log (TD-NEW-8) — `if (DEBUG)` gate 或刪除 | t3 F1 | 0.5 日 |
| P1 | `shasum` → `sha256sum` + fallback (Linux CI blocker) | t2 F6 | 0.1 日 |
| P1 | 寫 `docs/SSE-NGINX-TUNING.md` capture nginx SSE rejection history (TD-NEW-9) | t3 F2 | 0.5 日 |
| P1 | 加 `GET /api/attachments/integrity-report` admin endpoint (TD-NEW-10) | t5 | 0.5 日 |
| P1 | Re-build `deploy/dist` v1.0.6 + ship (F1 stale tarball) | t2 F1 | 0.2 日 |
| P1 | 加 CONTRIBUTING.md commit message hygiene 規則 | t3 | 0.2 日 |
| P2 | 為 `2495812` SSE heartbeat 行為加 time-mocked unit test | t4 obs | 0.3 日 |
| P2 | nginx Connection: close 3 層防線 integration test | t4 obs | 0.5 日 |
| P2 | 客戶 v1.0.7 升級後 review `[attachment-integrity]` log 流程文件化 | TD-NEW-10 | 0.3 日 |

---

## Decision logs (Sprint 22)

<!-- Team 應該填 — sprint 22 期間嘅架構決定 -->

_(blank — team fill-in)_

**Pre-loaded candidates** (from audits):

1. **LLM_TIMEOUT_MS 最終值 = 180000 (3 min)** — 由 `cd8b676`(240s) → `04a5d79`(60s) → `e1382fa`(180s) 三次反覆最終定。理由:PROD 慢網 buffer(50MB PDF base64 上傳 60-120s)+ 1.5x margin + 仍然 well under nginx 600s。文件化喺 `documents.ts` 註解(現有)。
2. **nginx 永久 disable HTTP/2** (until upstream fix) — Trade-off:失去 multiplexing,但 SSE streaming 穩定性 >> 性能 overhead。追蹤 nginx 1.27+。
3. **docker upload 用 named volume `pm-system-uploads`** 取代匿名 volume — Customer upgrade 後 file 跨 container recreate persist;orphaned rows 由 `attachment-integrity` startup check surface 出嚟。
4. **build-release per-arch tarball**(唔用 multi-arch manifest list) — 避免 docker.io push auth 問題;6 個獨立 tarball + CHECKSUMS.sha256 + RELEASE-NOTES.md。

---

## Non-goals

<!-- Team 應該填 — Sprint 22 明確唔做嘅嘢 -->

_(blank — team fill-in)_

**Pre-loaded**:

- ❌ 唔做 wiki upload 嘅 OCR(scanned PDF)— Sprint 11 已 deprecated
- ❌ 唔做 wiki fuzzy match(用戶揀嚴格 exact match)— Sprint 21 US-21.3 決定
- ❌ 唔做 wiki merge tool
- ❌ 唔做 LLM call retry / circuit breaker — 太複雜,Sprint 23+ 再考慮
- ❌ 唔做 nginx upstream HTTP/2 SSE fix 自家研發 — 跟 nginx upstream,等 release

---

## Verification

- [x] `bun test src/routes/documents.test.ts` → 30/30 pass [206ms]
- [x] `bun test src/routes/wikis.test.ts` → 30/30 pass [25ms]
- [x] `bun test src/routes/wiki-search.test.ts src/utils/wiki-dedup.test.ts` → 24/24 pass [233ms]
- [x] `docker run --rm nginx:alpine nginx -t -c /tmp/nginx.conf` → syntax ok, test successful
- [x] `docs/TECH-DEBT.md` 加 TD-NEW-8/9/10 + Sprint 22 candidate section
- [x] `docs/QA-TRACKER.md` 加 2026-06-23 Update banner + 收工摘要 + 變更歷史

**Total**: 84 tests pass, 0 fail, 0 new failure introduced by post-Sprint-21 commits.

---

## Retro metadata

- **Sprint start**: 2026-06-16 (post-Sprint-21 retro closure)
- **Sprint end**: 2026-06-23 (audit + tracker update closure)
- **Commits shipped**: 17 (excl. Sprint 21 closure commits 46323bf / 0aaea13)
- **Audit reports**: 4 (`docs/retros/_meta/post-sprint-21-*.md`)
- **TECH-DEBT entries added**: 3 (TD-NEW-8/9/10)
- **Test coverage delta**: 84 tests pass / 0 fail (baseline 不變,只新增 safeSend tests by `88c582d`)
- **紅線狀態**: 紅線 11/12 ✅,紅線 13 N/A (audit-only sprint)

---

**Notes for team fill-in**:
- 上面 "What shipped" section 已經 pre-populate,唔需要改
- "What we learned" / "Next sprint candidates" / "Decision logs" / "Non-goals" 留空,team 喺 sprint 22 wrap-up meeting 討論後填
- 如果發現新嘅 finding(例如客戶升級 v1.0.7 後 `[attachment-integrity]` log 嘅實際 output),加落 "What we learned" 或開新 `docs/retros/_meta/` audit report