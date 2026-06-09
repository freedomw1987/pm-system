# PM System — Regression Guard

> **Status**: 2026-06-09 snapshot(post-7-bug-sprint)
> **Rule**: 每個 bug fix 必須有 RG-XXX entry(紅線 13)

---

## 1. 目的

防止修復過嘅 bug 重新出現(regression)。每個 entry 包括:
- **Root cause** — 點解撞
- **Fix** — 點解咁修
- **Prevention** — 點樣避免下次再撞
- **Regression test** — 自動 test 守住

---

## 2. Bug 記錄

### RG-001: AI Agent task claim 失敗(commit 3938a2d)

- **發現日期**: 2026-05 (約,git commit time)
- **Symptom**: Agent 認領 task 後狀態 stuck 在 `in_progress`,但冇實際 work
- **Root cause**: WebSocket reconnection 邏輯有 race condition,Agent 認領後冇 ack 後端就默認失敗
- **Fix**: 加 exponential backoff reconnection + server-side ack timeout
- **Prevention**: 任何 WS 雙向通訊必須有 explicit ack 機制
- **Regression test**: ✅ **2026-06-08 加**(`backend/src/routes/agents.test.ts` 9 tests):
  - `canClaimTask` 守住:agent 必須先驗 status=pending + assigneeId=null
  - 防止 double-claim / claim-in-progress
- **Ref**: commit `3938a2d` debug for ai agent

### RG-002: LLM call hang(commit c79eed1)

- **發現日期**: 2026-05
- **Symptom**: Chat 問問題後 hang 60s+ 冇回應
- **Root cause**: LLM adapter 冇 timeout,慢 API 直接 deadlock
- **Fix**: 加 `AbortController` 30s timeout + retry
- **Prevention**: 任何外部 API 必須有 timeout
- **Regression test**: ❌ 冇
- **Ref**: commit `c79eed1` debug for llm call

### RG-003: WorkLog 部門欄位缺失(commit c42e634)

- **發現日期**: 2026-06
- **Symptom**: 工時列表冇部門欄位,冇法按部門統計
- **Root cause**: Schema 設計時 WorkLog 同 Department 冇 explicit relation,前端 UI 後加
- **Fix**: 加 `User.departmentId` foreign key + frontend 顯示
- **Prevention**: schema 改動時,grep 所有 related UI page 確認冇 missed column
- **Regression test**: ⚠️ **2026-06-08 partial 守住**(`backend/src/routes/worklogs.test.ts` 15 tests):
  - pagination invariant 守住(US-6.2 嘅 9adc1fa 改動)
  - 部門 filter 邏輯仲未 derive test(需要 mock DB)
- **Ref**: commit `c42e634` fix: 工作時數顯示部門欄位及新增部門篩選功能

### RG-004: Project task workflow 不順(commit 55845c9)

- **發現日期**: 2026-06
- **Symptom**: PM 建 task 後 developer 收唔到通知 / 列表冇 update
- **Root cause**: Project-Task-Assignee 流程有 ordering bug
- **Fix**: 重寫 task creation flow + 加 webhook(?)
- **Prevention**: complex workflow 加 integration test
- **Regression test**: ⚠️ PARTIAL(tasks.test.ts 部分覆蓋)
- **Ref**: commit `55845c9` fix: improve project task workflows

### RG-005: Backend bug(commit 7f43cba)

- **發現日期**: 2026-06
- **Symptom**: (commit message 太短,需 git show 確認)
- **Root cause**: TBD — 要 `git show 7f43cba` 確認
- **Fix**: TBD
- **Prevention**: TBD
- **Regression test**: ❌ 冇
- **Ref**: commit `7f43cba` fix: backend bug
- **Action item**: 🟡 補完整 record(下個 sprint)

### RG-006: Auth derive hook 對 fake UUID token throw 500(2026-06-08 E2E 發現)

- **發現日期**: 2026-06-08
- **Symptom**: 用 well-formatted 但不存在嘅 user UUID 嘅 token POST /api/projects
  收到 `HTTP 500 Internal Server Error`,backend log 見 `prisma.project.create()` 撞
  `Foreign key constraint violated on the constraint: projects_created_by_id_fkey`
- **Root cause**: backend/src/index.ts derive hook(line 80-115)對 fake UUID token:
  1. `dbUser = null`(findUnique 唔 returns)
  2. 但用 `userId` 從 token 推斷 role,fall through 過 RBAC check
  3. Route handler (POST /api/projects) 寫 `createdById: user.id` 撞 FK
  4. Prisma throw 500
- **Fix**:
  - derive hook 加 `if (!dbUser) return { user: null }` 早 return
  - 順手修 **privilege escalation**:改用 `dbUser.role` 而唔係 token 嘅 role 字串
    (原本 `Bearer fake-uuid:admin` 都可以 claim admin perms)
  - 加 `console.error` 喺 catch block 方便 debug
- **Prevention**: derive hook 必須嚴格驗 user 真實存在 + role 由 DB 攞(never trust client)
- **Regression test**: ✅ 2026-06-08 fix 後加返(`e2e/tests/rbac-negative.spec.ts` line 125)
  - 預期 403 FORBIDDEN(graceful auth-missing)
  - 順手 verify privilege escalation 守住(同一 fake token 唔再可以 access admin endpoint)
- **Ref**: TECH-DEBT.md TD-011

### RG-007: rolePermissionCache stale — RBAC changes require backend restart(2026-06-09 發現)

- **發現日期**: 2026-06-09
- **Symptom**: Admin 喺 Settings → Roles 改完某個 role 嘅 permission(例如將 `pm` 嘅
  `projects.create` 由 0 變 1),所有現有 login 嘅 user **唔會即時見到新 permission**。
  撞 `403 Forbidden: Permission denied: 'projects.create' is required`,要
  `docker compose restart backend` 先會 reload。
- **Root cause**: `backend/src/index.ts` 嘅 `rolePermissionCache: Map<string, string[]>`
  in index.ts (以及 `middleware/permission.ts` 嘅 `setRolePermissions` sync) — 寫入後
  從此不再 query DB,改完 `Role.permissions` 唔會 invalidate。
- **Fix**:
  - 整個移除 `rolePermissionCache` Map(2026-06-09 Sprint 4)
  - `loadRolePermissions(roleName)` 改為每次都 `prisma.role.findUnique(...)`
  - 保留 `setRolePermissions` (middleware map) 只為 backward compat(將來如要 in-process
    optimization 重新加,要用 TTL / version counter / explicit invalidation 而唔係永久 cache)
  - 1-2ms / request overhead,內部 PM system traffic 低,可接受
- **Prevention**:
  - 任何「cache 某啲 user/role 狀態」嘅 code 必須有 explicit invalidation strategy:
    (a) TTL、(b) version counter 對比 DB、(c) explicit `clear` on mutation event
  - 唔可以「load once then forget」— 改 admin-side state 必直接影響 user-side
- **Regression test**: ✅ 2026-06-09 加(`backend/src/middleware/role-cache-no-cache.test.ts` 4 tests):
  - Source code grep verify `rolePermissionCache` Map 唔再存在
  - `loadRolePermissions` 仍 query DB(無 cache 短路)
  - Derive hook comment 解釋「即時生效」
  - `middleware/permission.ts` 仍由 `user.permissions` 攞(per-request injection)
- **Ref**: TECH-DEBT.md TD-008, USER-MANUAL.md §15.3 FAQ 刪除 workaround

### RG-009: rolePermissionCache dead code 殘留 — partial cleanup 由 Sprint 4 漏咗(2026-06-09 發現)

- **發現日期**: 2026-06-09(Sprint 5)
- **Symptom**: Sprint 4 (RG-007) 聲稱「整個移除 `rolePermissionCache`」,但 grep `backend/src/` 仍 hit 到:
  1. `middleware/permission.ts` 仲 export `rolePermissionCache` Map + `setRolePermissions` / `invalidateRolePermissions`
  2. `index.ts` 仲 import + call `setRolePermissions(...)` 兩次(line 42 + 50,純 write,冇 read)
  3. `routes/roles.ts` 仲 import + call `rolePermissionCache.delete(...)` 4 次(line 274, 341, 343, 385)
  4. 每次 call 嘅 `// Invalidate cache for this role` comment 已經 misleading — cache 已經唔存在
- **Root cause**: Sprint 4 嘅 RG-007 fix 範圍太細 — 只 kill 咗 `index.ts` 嘅 Map declaration + 1 個 `cached.get` call site,但冇 audit 過其他 module 仲引用緊個 export 嘅 symbol。Cache 結構本身冇讀者(getter 死碼),所以 runtime 無 bug,但係 surface API 仲有 dead exports,容易誤導將來 developer 以為 cache 仲 work。
- **Fix** (Sprint 5):
  - 移除 `permission.ts` 嘅 `rolePermissionCache` / `setRolePermissions` / `invalidateRolePermissions` 全部 export
  - 移除 `index.ts` 嘅 import + 兩個 `setRolePermissions(...)` call + 4 行 misleading comment
  - 移除 `roles.ts` 嘅 import + 4 個 `rolePermissionCache.delete(...)` call + 4 行 misleading comment
  - `loadRolePermissions(roleName)` + `refreshAllRolePermissions()` signature 改為純 query(無 side effect)
  - TD-004 一齊處理:搬 `utils/rbac.ts` (0 caller) → `permission/project-role.ts`,加 JSDoc 講明語義唔同 + placeholder re-export 統一入口
- **Prevention**:
  - 任何 export 嘅 symbol 如果要 kill,**必須 grep 全 codebase 確認 0 caller**(不只係 source-of-truth file)
  - 任何 "remove a feature" commit 必過三關:(a) declaration 殺、(b) import 殺、(c) call site 殺 + comment 同步
  - Regression test 加 invariant:「banned symbol list 在 production code 必 0 hit」(recursive `readdir` 掃)
- **Regression test**: ✅ 2026-06-09 加(`backend/src/middleware/role-cache-no-cache.test.ts` 加 3 tests):
  - Recursive scan 全部 `.ts` (skip `.test.ts`) 確認 `rolePermissionCache` / `setRolePermissions` / `invalidateRolePermissions` 0 hit
  - `routes/roles.ts` 確認冇 `rolePermissionCache.delete(...)` call
  - `REGRESSION-GUARD.md` 確認有 RG-009 entry
- **Ref**: TECH-DEBT.md TD-004 (cache cleanup 部分) + TD-014 嘅 project-role reorg

### RG-011: Backend Dockerfile 漏 COPY prisma.config.ts — Prisma 7 CLI throw datasource.url required(2026-06-09 發現)

- **發現日期**: 2026-06-09(Sprint 5 closure)
- **Symptom**: `docker compose up -d --build backend` 撞 build 成功,但 container start 跑 `bunx prisma db push` 時 throw:
  ```
  Prisma schema loaded from prisma/schema.prisma.
  Error: The datasource.url property is required in your Prisma config file when using prisma db push.
  ```
  跟住 container exit(1),frontend 可以起但 backend 起唔到,**E2E 完全跑唔到**。
- **Root cause** (2 layers):
  1. `3bbb8b7` (Sprint 3) 加 `backend/prisma.config.ts` 處理 Prisma 7 strict config validation(由 `url = env("DATABASE_URL")` 取代 `url = process.env["DATABASE_URL"]`),但
  2. **Dockerfile 從來冇 `COPY prisma.config.ts`** — 舊 `oven/bun:1-alpine` Dockerfile 只 COPY `prisma/`(schema),`prisma.config.ts` 喺 backend 根目錄,build 時冇 bake 入 image,亦冇 `--from=builder` copy 到 runtime stage。
  3. Bonus: `bunx prisma generate` 喺 builder stage 都會 load `prisma.config.ts`,雖然 `prisma generate` 唔需要 DATABASE_URL,但 `env("DATABASE_URL")` strict helper 撞 undefined var 即 throw `PrismaConfigEnvError: Cannot resolve environment variable: DATABASE_URL`。
- **Fix**:
  - `backend/Dockerfile` builder stage 加 `COPY prisma.config.ts ./` + `RUN DATABASE_URL=postgresql://build:***@localhost:5432/build bunx prisma generate`(dummy URL 過 `env()` strict check)
  - `backend/Dockerfile` runtime stage 加 `COPY --from=builder /app/prisma.config.ts ./prisma.config.ts`(runtime container 嘅 `prisma db push` 同樣要讀 config)
  - `backend/prisma.config.ts` 改用 `import { defineConfig, env } from "prisma/config"` + `url: env("DATABASE_URL")`(本來 `process.env["..."]`,Prisma 7 strict validation 唔 accept)
- **Prevention**:
  - 任何 Prisma 7 嘅 `prisma.config.*` 引入 Dockerfile 時,**必須 audit `COPY` line** 是否 bake 入 image
  - Builder stage 跑 `prisma generate` 時必須 pass dummy env var 過 `env()` strict helper(URL 唔需要真實,runtime container 有真實 env)
  - 加 regression test: production image 必須含齊關鍵 CLI config file(以 `docker run --rm <image> ls /app/prisma.config.ts` 守住)
- **Regression test**: 🔜 下個 sprint:加 `verify-docker-config.test.ts` 跑 `docker run --rm pm-system-backend ls /app/prisma.config.ts`,assert exit 0 + stdout 有 `prisma.config.ts`
- **Ref**: TECH-DEBT.md Sprint 5 closure 註腳;GitHub issue [#28590](https://github.com/prisma/prisma/issues/28590)

### RG-010: WS handler helpers — pure function extraction(TD-014 closure, 2026-06-09)

- **發現日期**: 2026-06-09(Sprint 5)
- **Symptom**: Sprint 3 retro 發現 `bun:test` 嘅 `mock.module` 對 ESM hoist 唔可靠, in-process WS integration test 撞 open handler 嘅真 prisma load 失效,WS 返 1006 abnormal closure。Sprint 3 嘅 fallback 係用 `e2e/tests/llm-ws-e2e.spec.ts` 跑真 wire test 守住。
- **Root cause**: WS auth gate (line 358-414 嘅 open handler) 入面混雜咗 URL parsing + DB lookup + close code + welcome message 構造,**冇一處可以 unit test 唔需要 boot WS server**。
- **Fix** (Sprint 5):
  - 抽 `backend/src/agent/ws-handler-helpers.ts`(3 個 pure function + 1 個 type + 1 個 version constant):
    - `extractWsAuthParams(rawUrl)` — parse `ws://...?token=&agentId=` query string
    - `wsCloseCodeForReason(reason)` — 4001/4002/4003/1000/1011 mapping
    - `buildAgentWelcomeMessage(agentId, msg, issuedAtMs)` — 構造 JSON(注入 timestamp 保 deterministic)
  - 新增 `backend/src/agent/ws-handler-helpers.test.ts` — 17 unit test 守住
  - refactor `backend/src/agent/runtime.ts` 嘅 WS auth gate open handler 用新 helper(4 個 close site + 1 個 welcome message 全部改用 helper)
- **Prevention**:
  - 任何混雜 I/O 嘅 callback/handler 入面,**至少要將 pure 邏輯抽可獨立 unit test 嘅 helper**(URL parse / 構造 payload / close code mapping / state transition 等等)
  - 唔可以依賴 E2E / 真 wire test 做為唯一守住 — in-process unit test 提供最快 feedback loop
  - 守住 helper signature 唔好亂改 — 用 `__WS_HELPER_VERSION__` constant + 守住 test 防止 silent drift
- **Regression test**: ✅ 2026-06-09 加(`backend/src/agent/ws-handler-helpers.test.ts` 17 tests):
  - `extractWsAuthParams` 6 tests — `ws://` + `wss://` schemes、missing params、URL-encoded tokens
  - `wsCloseCodeForReason` 6 tests — 每個 reason mapping 守住 + unknown reason fallback
  - `buildAgentWelcomeMessage` 4 tests — JSON shape、deterministic、no-shared-state
  - `__WS_HELPER_VERSION__` 守住(pinned 1.0.0)
  - 守住:`cd backend && bun test src/agent/ws-handler-helpers.test.ts` → 17/17 pass
- **Ref**: TECH-DEBT.md TD-014 完整 closure

### RG-008: /api/auth/login 冇 rate limit — 可暴力破解(2026-06-09 發現)

- **發現日期**: 2026-06-09
- **Symptom**: `/auth/login` 對 failed password attempt **冇任何 rate limit**,
  attacker 可以無限速度撞 6-char password(36^6 = 2.2B combinations,
  慢啲嘅 hash 都可以幾日內破)。
- **Root cause**: `backend/src/routes/auth.ts` `POST /login` handler 入面,
  失敗 401 response 之後冇任何 counter / IP throttling / exponential backoff。
  對比其他 endpoint(都有 RBAC permission check 順手擋),login endpoint 因為
  係 public route 所以冇 cover。
- **Fix**:
  - 新增 `backend/src/utils/rate-limit.ts`(20 行,in-memory sliding window)
  - 策略:**每個 IP 5 attempts / 60s,超過返 429 + `Retry-After` header**
  - IP 從 `x-forwarded-for` (第 1 個) → `x-real-ip` → `unknown` fallback
  - Blocked attempts 唔計入 limit(防 lockout 永久延長)
  - Production upgrade path:換 Redis sliding window 一行 import
- **Prevention**:
  - 任何 public endpoint(無 auth 保護)必加 rate limit,即使只係 login / register /
    forgot-password
  - 任何 return 401 / 403 / 400 嘅 auth endpoint 必 audit「有冇 IP-based throttle」
- **Regression test**: ✅ 2026-06-09 加(`backend/src/routes/login-rate-limit.test.ts` 5 tests):
  - 5 個 attempts 過(remaining 倒數),第 6 個 blocked (ok=false, resetMs>0)
  - 不同 IP 隔離(A IP blocked 唔影響 B IP)
  - Sliding window 過期後允許新 attempts
  - Blocked attempts 唔延長 lockout(store 永唔變)
  - 真 route `/auth/login` 6th attempt 返 429 + `retry-after` header
    (E2E 喺 `e2e/tests/auth-rate-limit.spec.ts`,host unit test 唔 mock 整個 stack)
- **Ref**: TECH-DEBT.md TD-008

---

## 3. Pattern 觀察

從 5 個 RG entry 嘅 pattern:
1. **AI / Agent 係最脆弱** — RG-001, RG-002 都係 LLM / Agent
2. **欠 timeout / retry** — RG-002 反映 external API handling 唔夠
3. **欠 regression test** — 5/5 都冇 automated test 守住
4. **Schema evolution 有遺留** — RG-003

**行動**: 全部 RG entry 喺 TD-001 / TD-002 sprint 一齊補 regression test。

---

## 4. Regression test 模板

```typescript
// tests/regression/RG-XXX.test.ts
import { describe, expect, test } from 'bun:test';

describe('RG-XXX: <bug 簡述>', () => {
  test('should NOT <舊 bug 行為> when <觸發條件>', async () => {
    // arrange: setup state 模擬 bug
    // act: 觸發
    // assert: 確保唔會出現舊 bug
  });
});
```

---

## 5. 變更歷史

| 日期 | 變更 |
|------|------|
| 2026-06-08 | 初版 5 entries(derive 自 git log) |
| 2026-06-08 | 加 RG-006:Auth derive hook 撞 fake UUID throw 500(由 TD-011 衍生,fix 後補 regression test) |
| 2026-06-09 | 加 RG-007:rolePermissionCache stale — RBAC changes require backend restart(由 TD-008 cache 改動衍生,fix 後補 regression test) |
| 2026-06-09 | 加 RG-008:/api/auth/login 冇 rate limit — 可暴力破解(由 TD-008 rate limit 改動衍生,fix 後補 regression test) |
| 2026-06-09 | 加 RG-010:WS handler helpers — pure function extraction(TD-014 closure) |
| 2026-06-09 | 加 RG-011:Backend Dockerfile 漏 COPY prisma.config.ts — Prisma 7 CLI throw datasource.url required |
| 2026-06-09 | 加 RG-012:E2E 所有 spec 共用 `login:unknown` rate-limit bucket — 撞 429 |

---

## 6. 規則

**冇 entry 嘅 fix 唔可以 merge**(紅線 13):
- 開 PR → 自動 check 個 commit message 係咪有 `fix:` → 如果有,要求 RG-XXX entry
- 漏 entry → CI fail

**Root cause + Prevention 兩部分都必填**(紅線 14):
- 淨寫 code 改動冇寫「點解」嘅 fix 唔可以 merge

### RG-012: E2E 所有 spec 共用 `login:unknown` rate-limit bucket — 撞 429(2026-06-09 發現)

- **發現日期**: 2026-06-09(Sprint 5 收工時跑 E2E 發現)
- **Symptom**: `e2e/tests/rbac-negative.spec.ts` 跑 8 個 test,每個都 `POST /auth/login`,
  第 5 個開始連續 4 個 test 撞 `429 Too Many Login Attempts`(RG-008 嘅 side effect)。
  4 個 test fail,雖然 backend 行為正確,係 E2E 設計問題。
- **Root cause**: Backend `auth.ts` 嘅 rate limit key 用 `x-forwarded-for` 第 1 個 IP,
  fallback `'unknown'`。Playwright 嘅 `page.request` / `request.post` **唔自動 inject** `X-Forwarded-For`,
  Elysia 攞到 `null` → 落 `?? 'unknown'` fallback,**所有 E2E login 撞同一個 bucket `login:unknown`**。
  17 個 E2E test 個 spec 平均 1-2 個 login 嘗試,撞 5/60s limit。
- **Fix**:
  - 新增 `e2e/tests/_helpers.ts`,export `loginAs(req, role, testTitle)`,自動 inject
    `X-Forwarded-For: 127.0.0.<n>` header,IP suffix 由 test title hash derive(`[1, 200]`)
  - `rbac-negative.spec.ts` 8 個 `loginAs` call site 全改用 helper
  - `critical-path.spec.ts` 嘅 `apiLogin` helper 改用 helper,test 函數加 `testInfo` parameter
  - `llm-ws-e2e.spec.ts` 冇 login call 唔需要改
  - Backend 0 改動
- **Prevention**:
  - E2E spec 寫 login **必須** import `loginAs` from `_helpers`(唔可以 inline fetch `/auth/login`)
  - 唔可以 reuse 同一個 IP 跨 test(RG-008 嘅 IP isolation invariant 應用落 E2E)
  - 唔可以 skip 個 helper,「快」唔係 skip 嘅理由(backend rate limit 唔認得 caller)
  - 加新 E2E spec 嘅 PR review checklist:`grep -E "post\(.*auth/login" e2e/tests/` 必須
    全部經 helper
- **驗證**:
  - `rbac-negative.spec.ts` 8 個 test 全部 200/403 pass(rate limit bucket 獨立)
  - `critical-path.spec.ts` happy path + health check + UI login 3/3 pass
  - 整體 E2E 17/17 pass(之前 13/17)
- **Ref**: 同 RG-008 嘅 IP-based rate limit 直接相關,屬 E2E 設計修正


### RG-013: /profile 改密碼功能 dead — ProfilePage fetch 錯 URL + backend /auth/* 冇 derive hook(2026-06-09 發現)

- **發現日期**: 2026-06-09(Sprint 1 補 /profile E2E 時撞)
- **Symptom**: `e2e/tests/profile.spec.ts` 寫 US-1.4 改密碼 happy path,撳 submit 之後
  永遠見唔到「密碼已成功更新」訊息。直接 curl backend 試:
  - `POST /api/auth/change-password` → 404(nginx proxy 去 `/api/*` 唔識呢條 path)
  - `POST /auth/change-password`(帶 valid token)→ **永遠 401** UNAUTHORIZED
- **Root cause**(兩個 bug):
  1. **Frontend URL bug**: `frontend/src/pages/ProfilePage.tsx:32` 寫
     `fetch('/api/auth/change-password', ...)` — 跟 `authApi.ts` pattern 唔一致,
     `authApi.ts` 全部用 `/auth/login`、`/auth/refresh`(`/auth/*` 唔帶 `/api` prefix)。
     `nginx.conf` `/api/*` 路由會 proxy 個 path 入 backend,但 backend 嘅 `authRoutes`
     mount 喺 root(無 prefix),所以 backend route 係 `/auth/change-password`。
     `/api/auth/change-password` 落 backend 冇 match 嘅 route → 404。
  2. **Backend derive 缺位**: `backend/src/index.ts` 嘅 auth derive hook 之前只喺
     `.group('/api', ...)` 入面用,`authRoutes` 喺 `.use(authRoutes)` 喺 root level
     冇 derive → `/auth/change-password` 嘅 handler 永遠攞 `user = undefined` → 永遠 401。
     US-1.4 改密碼功能完全 dead,冇人用過所以一直冇人發現。
- **Fix**:
  1. ProfilePage.tsx: `fetch('/auth/change-password', ...)` 跟返 `authApi` pattern
  2. Extract derive 邏輯去 `backend/src/middleware/auth.ts` 做 `authDerive` export,
     index.ts 喺 `.use(authRoutes)` 之前 `.derive(authDerive)`(app level),令 /auth/* 同 /api/*
     兩個 group 都用同一份 derive
  3. `docker compose up -d --build backend frontend` 重新起 container
- **Prevention**:
  - E2E spec 必須做 full happy path(唔可以淨做 client-side 嗰半)— 本 bug 之所以 dead 咗
    就係從來冇 E2E 試過撳 submit 落到後端
  - Backend 新 route mount 喺 `authRoutes`(root level)**必須** verify derive hook 覆蓋到
  - 唔可以假設「改完 RBAC / auth 唔影響其他 route」,要 E2E 守住 invariant
  - 加新 frontend page 嘅 fetch URL review checklist:用 `authApi.ts` 而唔係直接 `fetch`,
    URL prefix 必須同 nginx 嘅 `location` rule 對得著
- **驗證**:
  - `e2e/tests/profile.spec.ts` 7/7 pass(包含 happy path 改密碼 → 新密碼可登入 → 還原)
  - 整體 E2E 24/24 pass(原本 17 + 新加 7)
  - 手動 curl `POST /auth/change-password` 帶 valid token → 200(改之前 永遠 401)
- **Ref**: 新嘅 ProfilePage E2E 係 7 tests 嘅 full coverage


### RG-014: 全部缺陷列表(US-5.x)7 個 P0 bug — 2026-06-09 發現/修

- **發現日期**: 2026-06-09(孔德樂 DeLe + 匿名 user 報告)
- **Scope**: 7 個 bug,全部圍繞「缺陷 / 附件 / 項目 card」三個 area
- **Symptom 一覽**:

| # | Bug | Severity | Reporter |
|---|-----|----------|----------|
| 1 | 全部缺陷列表頁缺少可新增缺陷操作 | medium | 孔德樂 DeLe |
| 2 | 全部缺陷列表頁無法查看缺陷詳情 | medium | 孔德樂 DeLe |
| 3 | 編輯缺陷-修改標題和描述,保存後信息未更新 | high | 孔德樂 DeLe |
| 4 | 全部缺陷列表缺少按項目篩選 | medium | 孔德樂 DeLe |
| 5 | 附件-已上傳附件圖片未支持預覽,下載也失敗 | medium | 孔德樂 DeLe |
| 6 | 新增缺陷缺少指派給誰選項,並且缺陷描述裡面無法貼圖片 | high | 孔德樂 DeLe |
| 7 | 項目點擊卡片無法跳轉到詳情頁,只能通過點擊項目名稱跳轉 | low | 未指定 |

- **Root cause**(分類):
  - **(1) + (6)**: 從來冇 `/bugs` page — 只有 `/my-bugs`(個人 scope),冇「全部缺陷」入口
  - **(2)**: 冇 `GET /api/bugs/:id` endpoint,亦冇 `/bugs/:id` 詳情 page
  - **(3)**: `RequirementDetailPage` 嘅 bug edit 雖然有,但 save 後只行 `loadData()`
    重 load(無 patch state),會見到 stale data 短暫 flash;真正的 bug 係
    喺 `MyBugsPage` 冇 edit 入口
  - **(4)**: `BugsPage` 缺 `projectId` query param + dropdown
  - **(5)**: 兩重 bug —
    a) `Content-Disposition: attachment; filename="中文.png"` 冇 RFC 5987 編碼,
       Chrome 直接丟 filename,`<a href download>` 落唔到原始檔名
    b) `<a href="/api/attachments/...">` 唔帶 Authorization header(browsers 唔
       會跨 origin attach header),API 要求 Bearer token
  - **(6)**: `RequirementDetailPage` 嘅 Create Bug 有 assignee,其他入口(MyBugsPage)冇;
    描述係 plain `<textarea>`,冇 rich text / image paste
  - **(7)**: `ProjectsPage` 嘅 project card 整個係 `<div>`,只有 `<h3>` 入面包咗 `<Link>`,
    撳 card 其他位冇反應

- **Fix**(對應表):

| Bug | Fix |
|-----|-----|
| 1 | 新 `frontend/src/pages/BugsPage.tsx` + sidebar 加「全部缺陷」link |
| 2 | 新 `frontend/src/pages/BugDetailPage.tsx` + backend `GET /api/bugs/:id`(routes/bugs.ts) |
| 3 | `BugDetailPage` edit handler 用 response `setBug(res.data.bug)` 直接 patch,唔再 reload |
| 4 | `BugsPage` 加 `<select>` project filter,server-side `params.projectId` + client-side 兜底 filter |
| 5a | `attachments.ts` 改用 RFC 5987 `filename*=UTF-8''<encoded>` + ASCII fallback |
| 5b | `AttachmentsTab` 下載改用 `fetch + blob + a.click`,帶 Authorization header |
| 5c | `AttachmentsTab` 加 `<img src="?inline=1">` thumbnail + lightbox modal |
| 6 | 新 `CreateBugModal`(Tiptap rich text + image paste + assignee dropdown) |
| 7 | `ProjectsPage` card 整個包入 `<Link>`,edit/delete button 加 `e.preventDefault()` |

- **Prevention**:
  - **新 page / route** 一定要有對應 E2E test(否則 RBAC、UI 跳轉、save 行為 全部盲點)
  - **Backend 下載 endpoint** 一定要用 RFC 5987 filename 編碼,前端 download 一定要 `fetch + blob`,
    唔可以靠 `<a href>` navigate
  - **Image upload** 一定要畀 inline preview(`?inline=1` 模式 + lightbox)
  - **List → Detail 跳轉** 嘅 row 必須係 `<Link>`(唔可以係 `<div onClick>` 偽造)
  - **List header** 一定要有「新建」button 對應 modal 入口(否則 user 搵唔到 create path)
  - **List 一定要有 filter** 至少一個維度(project / status / severity)— 否則 5+ 個就 unusable
  - **Edit 後嘅 state update** 一定要用 response 直接 patch local state,避免
    「重 load → 短暫 stale → 新 data」嘅 flash
  - **Rich text editor** 一定要用 Tiptap(StarterKit + Image + Link + Placeholder),唔可以
    自製 contentEditable(無 paste handler,無 sanitisation,無 undo/redo)
- **Regression test**: ✅ **2026-06-09 加**(`e2e/tests/bugs-fix.spec.ts` 9 tests):
  - **bug #1/#2**:`/bugs` page renders,「新建缺陷」button 喺度,項目 filter dropdown 喺度
  - **bug #3**:click bug row 跳去 `/bugs/:id`,BugDetailPage 有「返回缺陷列表」link
  - **bug #4**:edit title/description → save → UI 即時 contain new title(用 `main h1` 避開 sidebar 嘅 `PM System` h1 撞 strict mode)
  - **bug #5**:upload 1x1 PNG → `/api/attachments/:id?inline=1` 返 200 + `image/png` + `filename*=UTF-8''` header
  - **bug #5 UI**:thumbnail `<img>` render → click 開 lightbox → lightbox 嘅 `<img>` 可見
  - **bug #6 + #7(create modal)**:有「指派給誰」label + 揀項目後 assignee dropdown 有 options
  - **bug #6 + #7(happy path)**:title/severity/project/assignee → submit → 綠色 success banner → server 確認 bug 出現 → cleanup
  - **bug #8**:click card 任何位(右下角「個成員」文字)都跳去 `/projects/:id`
  - **bug #8 regression**:click 個 card 嘅 edit button → 出 modal,**唔** navigate(用 `e.preventDefault` + `e.stopPropagation`)
- **驗證**:
  - `e2e/tests/bugs-fix.spec.ts` **9/9 pass**(8.8s)
  - 整體 E2E **33/33 pass**(之前 24 + 新加 9)
  - Backend unit tests **499/499 pass**(冇改 bug test,加咗新 endpoint 但純 add,無 modify)
  - 全部 frontend 8 個 pages 引用 Tiptap `RichTextEditor` 統一支援 image paste + 4 個現有 caller
    (Projects / ProjectDetail / RequirementDetail / MyRequirements)零改動,API backward compatible
- **Ref**:
  - 新 frontend files:`pages/BugsPage.tsx` + `pages/BugDetailPage.tsx` + `components/CreateBugModal.tsx`
  - Backend:`backend/src/routes/bugs.ts` 加 `GET /:id` endpoint
  - Frontend:`components/AttachmentsTab.tsx` 重寫(lightbox + RFC 5987 下載)
  - Backend:`backend/src/routes/attachments.ts` `GET /:id` 改用 RFC 5987 + `?inline=1` mode
  - Frontend:`utils/api.ts` `bugApi.get` + `attachmentApi.upload` type 加 'bug'
  - Layout:`components/Layout.tsx` sidebar 加「全部缺陷」nav item
