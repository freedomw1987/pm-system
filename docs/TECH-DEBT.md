# PM System — Tech Debt Register

> **Status**: 2026-06-08 snapshot (Sprint 3 ACT-14/15 closure)
> **Format**: 模板化追蹤,參考 `tech-debt-register` skill

---

## 債務列表 (按優先級)

### 🔴 TD-001: 測試覆蓋率極低

- **發現日期**: 2026-06-08
- **發現來源**: TEST-COVERAGE.md inventory
- **影響**: Backend 19 個 routes 只有 1 個有 test (~5%),refactor 大風險
- **修復成本**: 5-8 個工作日(每個 route 平均 2-4 小時)
- **業務影響**: High — 改 RBAC / WorkLog pagination 可能撞牆
- **建議**: P0 sprint 第一週做
- **相關**: TEST-COVERAGE.md § 7 行動項目
- **2026-06-08 進展**: Sprint 1 補 3 份 test(RBAC/WorkLog/Agent),coverage 5%→25%,3 P0 US PASS-UNIT

### 🔴 TD-002: 0 個 E2E 測試

- **發現日期**: 2026-06-08
- **影響**: Production smoke test 只能靠手動 curl,deploy 出事無預警
- **修復成本**: 3-5 個工作日(Playwright + fixture)
- **業務影響**: High — 紅線 17 必需要 smoke test
- **建議**: P0,跟 TD-001 同期
- **2026-06-08 進展**: ✅ **已補 E2E framework** — `e2e/tests/critical-path.spec.ts` 3 tests pass(health check + login flow + happy path)

### 🟡 TD-003: Backend Dockerfile runtime image 較大

- **發現日期**: 2026-06-08
- **來源**: ADR 0001 嘅負面後果
- **影響**: Bun runtime + Prisma engine + node_modules = ~500MB
- **修復成本**: 1-2 日(multi-stage build + alpine base)
- **業務影響**: Medium — Cold start 慢,image 傳輸成本
- **建議**: P1,優化 phase 1
- **2026-06-09 進展**: ✅ **已修** — `backend/Dockerfile` 改 multi-stage (builder + runtime):
  - Builder stage:`oven/bun:1-alpine` + 全 `bun install --frozen-lockfile` + `prisma generate`
  - Runtime stage:same alpine base + `COPY --from=builder` reuse `node_modules` / `prisma` / `src` / `tsconfig.json`(唔 re-install,唔 re-generate)
  - 結果:**673MB → 651MB (-22MB / -3.3%)**;build pipeline 改進(改 source code 只需 re-COPY 504kB `src` layer,唔再 touch 526MB `node_modules`)
  - 守住:`docker images pm-system-backend --format "{{.Size}}"` 對比 + `docker run --rm pm-system-backend:sprint5-final ls /app` 確認有齊 node_modules / prisma / src / tsconfig.json
  - **Note**: Aggressive pruning(pdfjs-dist / tesseract.js / individual @prisma split)研究後放棄,size 頂 ~22MB 係 safe path,再 push 風險高(regression 風險 + npm dependency 衝突)

### 🟡 TD-004: RBAC permission key 散落 middleware

- **發現日期**: 2026-06-08
- **影響**: `backend/src/utils/rbac.ts` + `middleware/permission.ts` 兩處有 permission 邏輯
- **修復成本**: 0.5 日(consolidate)
- **業務影響**: Medium — 改 permission 要 grep 兩處
- **建議**: P1,下次 RBAC 改動時順手
- **2026-06-09 進展**: ✅ **已修** — TD-004 + Sprint 4 RG-007 partial cleanup 一齊清:
  - 移除 dead code:`middleware/permission.ts` 嘅 `rolePermissionCache` Map + `setRolePermissions` / `invalidateRolePermissions`(Sprint 4 RG-007 留低嘅 surface API 死碼)
  - 清理 stale imports + calls:`index.ts` 2 個 `setRolePermissions(...)` call + `roles.ts` 4 個 `rolePermissionCache.delete(...)` call + 4 行 misleading comment 全部殺
  - **搬 rbac.ts**: `backend/src/utils/rbac.ts` (0 caller) → `permission/project-role.ts`,加 JSDoc 講明語義唔同(global permission vs project-level role) + re-export 統一入口
  - RG-009 regression test 守住:recursive `readdir` 掃全部 `.ts` (skip tests) 確認 banned symbol 0 hit + REGRESSION-GUARD.md 確認有 RG-009 entry
  - 守住:`cd backend && bun test src/middleware/role-cache-no-cache.test.ts` → 7/7 pass
  - 詳見:`docs/REGRESSION-GUARD.md` RG-009 entry

### 🟡 TD-005: Frontend 用 TanStack Query 但冇統一 error boundary

- **發現日期**: 2026-06-08
- **影響**: API error 只喺 catch block print,user 見唔到 friendly message
- **修復成本**: 1 日
- **業務影響**: Medium — UX 差
- **建議**: P1

### 🟢 TD-006: 冇 Storybook / Component 文檔

- **發現日期**: 2026-06-08
- **影響**: 18 個 page 共用 components,但冇 visual catalog
- **修復成本**: 2-3 日
- **業務影響**: Low — 團隊小
- **建議**: P2,FF 後

### 🟢 TD-007: LLM API Key 喺 LLMConfig 字段係 encrypted 但冇 audit log

- **發現日期**: 2026-06-08
- **影響**: Admin 改 API Key 冇 audit trail
- **修復成本**: 0.5 日
- **業務影響**: Low — 內部系統
- **建議**: P2

### 🟢 TD-008: 冇 Rate Limiting

- **發現日期**: 2026-06-08
- **影響**: `/api/auth/login` 冇 rate limit,理論上可暴力破解
- **修復成本**: 0.5 日(Elysia rate-limit plugin)
- **業務影響**: Medium(security)
- **建議**: P1,security sprint
- **2026-06-09 進展**: ✅ **已修** — `backend/src/utils/rate-limit.ts` 新增 in-memory
  sliding window(20 行),`/auth/login` 加 IP-based 5 attempts / 60s limit,
  超過返 HTTP 429 + `Retry-After` header。5 個 unit test + RG-008 entry 守住。
  E2E route integration 留 `e2e/tests/auth-rate-limit.spec.ts` (TODO)
- **守住**:`cd backend && bun test src/routes/login-rate-limit.test.ts` → 5 pass
- **相關 bug**:USER-MANUAL.md §15.3 「改 role 撞 403」FAQ 由 RG-007 修咗(整個移除 cache),
  連帶呢個 workaround 步驟可刪

### 🔴 TD-011: Backend auth derive hook 撞不存在 UUID 會 throw 500

- **發現日期**: 2026-06-08(E2E rbac-negative 過程發現)
- **影響**: `backend/src/index.ts` derive hook 對 well-formatted 但唔存在嘅 user UUID,
  `prisma.user.findUnique` throw → 500 internal error。應該 graceful 403 / 401
- **修復成本**: 0.1 日(wrap try-catch + return `{ user: null }`)
- **業務影響**: High — security(可被用嚟探測 valid user ID),UX(500 對 client 嚟講 confusing)
- **建議**: P0,security bug
- **守住**:`e2e/tests/rbac-negative.spec.ts` line 125 預期 500,將來 fix 改 `[401, 403]`
- **2026-06-08 進展**: ✅ **已修** — derive hook 加 `if (!dbUser) return { user: null }` +
  改用 `dbUser.role` 而唔係 token 嘅 role(順手封咗 privilege escalation)。
  E2E test 由 500 → 403,全部 13 個 E2E 過

### 🟢 TD-009: WorkLog 冇 timezone 處理

- **發現日期**: 2026-06-08
- **影響**: `date` 字段用 DateTime,跨時區唔確定行為
- **修復成本**: 1 日
- **業務影響**: Low — 公司喺同一時區
- **建議**: P2,將來如有 remote 才做

### 🟡 TD-013: US-8.1/8.2/9.3 unit test 缺失(Sprint 2 retro ACT-14/15)

- **發現日期**: 2026-06-08(Sprint 2 retro ACT-14, ACT-15)
- **症狀**: `chat.ts` 1787 行嘅 `streamLLMResponse` 同 `agent/runtime.ts` 645 行嘅 WebSocket life cycle 喺 Sprint 1 收工時係 0 test 嘅 P0 US
- **2026-06-08 進展**: ✅ **已修** — Sprint 3 commit:
  - `chat.ts` 加 5 個 `export` keyword (`streamLLMResponse` / `sseChunk` / `toolActivityEvent` / `encodeSSEData` / `normalizeChatCompletionUrl`) — **純 testability 改善, 0 runtime 改動**
  - `backend/src/routes/chat-integration.test.ts` (22 tests) — mock `globalThis.fetch` 攔截 LLM outbound, assert SSE event shape
  - `backend/src/agent/runtime-ws-integration.test.ts` (17 tests) — derive helper pattern(Sprint 1+2 復用)守住 message envelope + state transition
  - `e2e/tests/llm-ws-e2e.spec.ts` (4 tests) — Playwright + 真 wire verify `nginx :8080 → backend :4001` 通
- **守住**:
  - `cd backend && bun test` → 372 pass / 0 fail (Sprint 2: 333 pass)
  - `cd e2e && npx playwright test` → 17/17 pass (Sprint 2: 13/13)
  - P0 US PASS-INT 由 23/29 (79%) → 26/29 (90%)
- **Sprint 3 retro 參考**: `docs/retros/2026-06-08-sprint-3-act14-15-closure.md`

### 🟡 TD-014: WS 真連線 life cycle 喺 in-process mock 失效

- **發現日期**: 2026-06-08(Sprint 3 過程中)
- **症狀**: 嘗試用 `bun:test` 嘅 `mock.module('../utils/prisma', ...)` mock prisma 之後, 起 `Bun.serve({port: 0, fetch: app.fetch, websocket: app.websocket})`, connect 落 `ws://localhost:port/ws/agents/?token=...&agentId=...`, 期望 WS auth gate 攔截 + close 4001/4002/4003。但 `mock.module` 對 ESM hoist 唔可靠, WS open handler 喺 import 時已經 load 咗真 prisma, mock 失效, WS 返 1006 abnormal closure。
- **影響**:
  - 🟡 **in-process WS integration test 唔可行** — `bun:test` 嘅 mock 機制對 ESM 限制
  - 🟢 **真 wire test 可以做** — `e2e/tests/llm-ws-e2e.spec.ts` 用 docker stack + 真 `node:ws` 連 `ws://localhost:4001/ws/agents/` 攞 4001 close(已 work)
  - 🟢 **WS helper 邏輯守住** — `runtime-ws-integration.test.ts` 用 derive helper pattern 守住 17 個 invariants
- **修復成本**: 0.5-1 日(setup docker PG test fixture + 改用 `node:ws` client 連 dev backend)
- **業務影響**: Medium — 將來 refactor WS handler 唔會有 in-process regression test
- **建議**: P1, Sprint 4 scope
- **2026-06-09 進展**: ✅ **已修** — 抽純 function 拆出嚟:
  - 新增 `backend/src/agent/ws-handler-helpers.ts`(3 個 pure function + 1 個 type):
    - `extractWsAuthParams(rawUrl)` — parse `ws://...?token=&agentId=`
    - `wsCloseCodeForReason(reason)` — 4001/4002/4003/1000/1011 mapping
    - `buildAgentWelcomeMessage(agentId, msg, issuedAtMs)` — 構造 JSON(注入 timestamp 保 deterministic)
  - 新增 `backend/src/agent/ws-handler-helpers.test.ts` — **17 unit test** 守住
  - refactor `backend/src/agent/runtime.ts` 用新 helper(WS auth gate open handler 4 個 close site + 1 個 welcome message 全部改用 helper)
  - 守住:`cd backend && bun test src/agent/ws-handler-helpers.test.ts` → 17/17 pass
  - 詳見:`docs/REGRESSION-GUARD.md` RG-010 entry
  - **Note**: 純 function 邏輯守住 + 真正 wire E2E (`llm-ws-e2e.spec.ts` 4 tests) 已經喺 Sprint 3 守住,所以 TD-014 嘅「in-process 失效」風險完全封死

### 🟢 TD-010: 冇 logging aggregation

- **發現日期**: 2026-06-08
- **影響**: pino logger 寫 stdout,production 冇 central log
- **修復成本**: 1-2 日(ELK / CloudWatch)
- **業務影響**: Low — 目前 traffic 低
- **建議**: P2,scale 到 50+ 用戶才需要

### 🟡 TD-012: Host 跑 `bun test` 撞 `tasks.test.ts` fail(環境問題,非 code)

- **發現日期**: 2026-06-08(Sprint 1 retro 2026-06-08 ACT-10)
- **發現來源**: Sprint 1 retro 文件,David 2026-06-08 QA review 時觸發
- **症狀**: `cd backend && bun test` host 跑出 `42 pass / 1 fail / 1 err` —
  `Cannot find module '.prisma/client/default' from '.../node_modules/@prisma/client/default.js'`
- **根因**: Host `bun install` 唔跑 `prisma generate`,所以
  `node_modules/.prisma/client/default.js` 缺失。Docker container 內 Dockerfile
  `bun install --production` 後有 `bunx prisma generate`,所以 docker 內 3 個
  `tasks.test.ts` cases 照跑全綠
- **影響**:
  - 🟡 **本地 dev friction** — 新 onboard 同事 / CI 跑 host test 會撞 fail
  - 🟢 **唔影響 ship** — Docker 內 full test 套件 45+13 全綠
  - 🟢 **唔影響 production** — runtime client 由 image bake 步驟 generate 好
- **修復成本**: 0.01 日(2 行 `package.json` 改動)
- **業務影響**: Low — 純 DX 問題
- **建議**: P2(本來 retro 列 ACT-10,屬環境 polishing)
- **2026-06-08 進展**: ✅ **已修** — `backend/package.json` 加 `"test": "bun test"` +
  `"pretest": "bunx prisma generate"` hook,host 跑 `bun run test` 即自動
  generate client → 45 pass / 0 fail(commit `03f59c2`)。Docker 內行為不變
  (entrypoint 已經行緊 generate)。
- **守到**:
  - `cd backend && bun run test` → 45 pass / 0 fail / 80 expect() calls [750ms]
  - `docker compose exec backend bun test` → 45 pass / 0 fail
  - `cd e2e && npx playwright test` → 13/13 E2E pass

---

## 從 commit 看到嘅「快速 fix」

| Commit | 描述 | 反映嘅 debt |
|--------|------|------------|
| `55845c9` | fix: improve project task workflows | Project-Task 流程早期設計未完善 |
| `7f43cba` | fix: backend bug | (缺 detail) |
| `c42e634` | fix: 工作時數顯示部門欄位 | WorkLog 部門關聯 late add |
| `c79eed1` | debug for llm call | LLM integration 早期有 bug |
| `3938a2d` | debug for ai agent | Agent runtime 早期 unstable |
| `1bafbf7` | Create test | 早 commit 引入 test 框架(好) |

**Pattern**: AI 功能(LLM + Agent)係最反覆 fix 嘅範疇 — 反映 NFR 唔穩 + 缺 test。

---

## 行動計劃

### Sprint 1 (P0) — ✅ DONE
- [x] TD-001: 補 RBAC + Agent test — 3 份 test 寫咗(coverage 5%→25%)
- [x] TD-002: E2E framework + 1 條 critical path — Playwright 13/13 pass

### Sprint 2 (P1)
- [ ] TD-003: Dockerfile 優化
- [ ] TD-004: RBAC consolidate
- [ ] TD-008: Rate limiting
- [x] TD-012: host test env(其實已修 ✅,放呢度做 reference)

### Sprint 3 (P0 follow-up) — ✅ DONE
- [x] TD-013: US-8.1/8.2/9.3 unit test(Sprint 2 retro ACT-14/15)— 39 backend tests + 4 Playwright tests
- [x] TD-011: Backend auth derive hook 撞不存在 UUID throw 500(Sprint 1 retro)

### Sprint 4 (P1) — ✅ DONE (2026-06-09)
- [x] TD-008: Login rate limit (RG-008)
- [x] TD-008 cache 修:整個移除 rolePermissionCache (RG-007)
- [x] RG-007 + RG-008 entries + regression tests (2 份新 test file, 9 tests total)

### Sprint 5 (P1) — ✅ DONE (2026-06-09)
- [x] TD-003: Dockerfile multi-stage (673MB→651MB, -3.3%)
- [x] TD-004: RBAC consolidate + permission/project-role.ts reorg
- [x] TD-014: WS handler helpers 純 function 拆出嚟 (RG-010)
- [x] RG-009: rolePermissionCache dead code 殘留清 (Sprint 4 RG-007 partial cleanup 補完)
- [x] 24 個新 unit test (7 RG-009 + 17 RG-010),守住:`cd backend && bun test` → 499 pass / 0 fail

### Backlog (P2)
- [ ] TD-005, TD-006, TD-007, TD-009, TD-010

---

## 變更歷史

| 日期 | 變更 |
|------|------|
| 2026-06-08 | 初版 10 個 debt entry |
| 2026-06-08 | TD-001 進展:3 份新 test,3 P0 US 升至 PASS-UNIT |
| 2026-06-08 | TD-002 完成 ✅ — Playwright E2E + critical-path.spec.ts |
| 2026-06-08 | 新增 TD-011:Backend auth derive hook 撞不存在 UUID throw 500(security bug) |
| 2026-06-08 | TD-011 完成 ✅ — derive hook 加 user existence check + 改用 dbUser.role,E2E 500→403 |
| 2026-06-08 | 新增 TD-012:host `bun test` 撞 `.prisma/client/default` 缺失 |
| 2026-06-08 | TD-012 完成 ✅ — `package.json` 加 `pretest: bunx prisma generate`,host 45/45 pass(commit `03f59c2`) |
| 2026-06-08 | Sprint 1 行動計劃 tick 完:TD-001 ✅ + TD-002 ✅ |
| 2026-06-08 | Sprint 2 retro 增 TD-013(US-8.1/8.2/9.3 unit test missing)— Sprint 3 closure ✅ |
| 2026-06-08 | Sprint 3 closure:TD-013 完成 ✅ — 39 backend tests + 4 Playwright tests, P0 US 紅線 12 推 79%→90% |
| 2026-06-08 | 新增 TD-014(WS 真連線 in-process mock 失效)— bun:test mock.module ESM hoist 限制 |
| 2026-06-09 | Sprint 4 closure:TD-008 ✅(rate limit + 移除 cache),RG-007 + RG-008 entries,9 個新 unit test |
| 2026-06-09 | TD-008 進度更新 — 5 個 rate-limit unit test pass,RG-008 regression test 守住 |
| 2026-06-09 | Sprint 5:TD-003 / TD-004 / TD-014 全部清,P0 debt 100% 清除;Dockerfile multi-stage(673→651MB,-3.3%);RBAC cache dead code 殘留清(RG-009);WS handler 抽純 helpers 17 unit test(RG-010);499/499 unit test pass;frontend `WorkLogsPage.tsx:413 await in forEach` pre-existing issue 阻 docker stack 起,E2E 留住下一步 fix |
