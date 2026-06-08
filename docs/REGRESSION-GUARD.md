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

---

## 6. 規則

**冇 entry 嘅 fix 唔可以 merge**(紅線 13):
- 開 PR → 自動 check 個 commit message 係咪有 `fix:` → 如果有,要求 RG-XXX entry
- 漏 entry → CI fail

**Root cause + Prevention 兩部分都必填**(紅線 14):
- 淨寫 code 改動冇寫「點解」嘅 fix 唔可以 merge
