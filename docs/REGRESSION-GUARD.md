# PM System — Regression Guard

> **Status**: 2026-06-08 初版
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

---

## 6. 規則

**冇 entry 嘅 fix 唔可以 merge**(紅線 13):
- 開 PR → 自動 check 個 commit message 係咪有 `fix:` → 如果有,要求 RG-XXX entry
- 漏 entry → CI fail

**Root cause + Prevention 兩部分都必填**(紅線 14):
- 淨寫 code 改動冇寫「點解」嘅 fix 唔可以 merge
