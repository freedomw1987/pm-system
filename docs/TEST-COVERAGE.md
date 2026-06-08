# PM System — Test Coverage Report

> **Status**: 2026-06-08 snapshot
> **Method**: `find . -name "*.test.*" -not -path "*/node_modules/*"` 掃 source tree

---

## 1. 當前覆蓋率

| Layer | Test Files | Test Count | 備註 |
|-------|-----------|------------|------|
| Backend Unit (`backend/src/**/*.test.ts`) | 4 | ~46 | tasks + permission + worklogs + agents |
| Backend Integration | 0 | 0 | — |
| Frontend Unit (`frontend/src/**/*.test.ts`) | 1 | 1 | `utils/authRefresh.test.ts` |
| Frontend Component | 0 | 0 | — |
| E2E (Playwright / Cypress) | 0 | 0 | — |
| **Total** | **5** | **~47** | **~25% coverage (rough estimate)** |

### Backend test files (4)

1. `backend/src/routes/tasks.test.ts` — 2 tests(原有,PARTIAL)
2. `backend/src/middleware/permission.test.ts` — **18 tests**(2026-06-08 加,US-7.3)
3. `backend/src/routes/worklogs.test.ts` — **15 tests**(2026-06-08 加,US-6.2 + RG guard)
4. `backend/src/routes/agents.test.ts` — **9 tests**(2026-06-08 加,US-9.2 + RG-001 guard)

---

## 2. Backend Test Inventory

### ✅ `backend/src/routes/tasks.test.ts`
- 涵蓋:Task CRUD
- 覆蓋 US: US-4.1, US-4.2, US-4.3 (PARTIAL)
- 環境:Bun test runner (`bun test`)

### ❌ 缺 test 嘅 routes (18 個)
- `routes/agents.ts` — 🔴 Critical(US-9.1, US-9.2)
- `routes/auth.ts` *(JWT login/refresh — 可能喺 middleware)*
- `routes/llm-config.ts`
- `routes/departments.ts`
- `routes/projects.ts`
- `routes/tokenlogs.ts`
- `routes/reports.ts`
- `routes/requirements.ts`
- `routes/bugs.ts`
- `routes/chat.ts` — 🔴 LLM 路徑
- `routes/attachments.ts`
- `routes/wikis.ts`
- `routes/documents.ts`
- `routes/roles.ts` — 🔴 RBAC critical
- `routes/users.ts`
- `routes/worklogs.ts` — ⚠️ 9adc1fa 改咗分頁但 0 regression test
- `routes/agents.ts` — 🔴
- `routes/agents.ts` — (重複,呢度做 reminder)

### ❌ 缺 test 嘅 modules
- `middleware/auth.ts` — 🔴 Security critical
- `middleware/permission.ts` — 🔴 RBAC critical
- `utils/rbac.ts` — 🔴 Permission 邏輯
- `utils/prisma.ts` — DB client setup
- `agent/runtime.ts` — 🔴 Agent loop
- `agent/task-executor.ts` — 🔴
- `agent/skill-matcher.ts` — 🔴
- `agent/llm-adapters.ts` — 🔴 LLM

---

## 3. Frontend Test Inventory

### ✅ `frontend/src/utils/authRefresh.test.ts`
- 涵蓋:authRefresh 邏輯(token 過期、refresh、失敗處理)
- 覆蓋 US: US-1.2 (PARTIAL)

### ❌ 缺 test 嘅 area
- 18 個 pages 完全冇 test
- `components/*`(WikiEditor, RichTextEditor, ProjectKanban 等)
- `utils/api.ts` (axios wrapper)
- `utils/permissions.ts`(client-side RBAC check)
- `context/AuthContext.tsx`

---

## 4. E2E 測試

- ❌ **完全 0 個 E2E test**
- 候選:Playwright(React friendly)+ MSW mock backend
- 至少 1 條 critical path(登入 → 建項目 → 建需求 → 建任務)係 ship-blocker

---

## 5. Coverage 健康指標

| 指標 | 目標 | 當前 | 狀態 |
|------|------|------|------|
| Backend route test coverage | > 80% | ~5% | 🔴 |
| Frontend critical path test | > 50% | ~3% | 🔴 |
| E2E critical paths | 至少 3 條 | 0 | 🔴 |
| Regression test for fixed bugs | 100% (RG-XXX) | 0% | 🔴 |
| 整體 % (lines covered) | > 70% | unknown(未跑 nyc/c8) | 🔴 |

---

## 6. 建議工具

| Layer | Tool | Why |
|-------|------|-----|
| Backend | `bun test`(內建) | 已經用緊,zero config |
| Backend coverage | `bun test --coverage` 或 `c8` | 視乎 Bun 1.2 support |
| Frontend Unit | Vitest | Vite 已經用,config 簡單 |
| Frontend Component | @testing-library/react | industry standard |
| E2E | Playwright | 跨瀏覽器,React 友善 |

---

## 7. 行動項目

1. **Sprint 1 (P0)**:
   - 補 `routes/agents.ts` test(US-9.1 / 9.2)
   - 補 `middleware/permission.ts` test(US-7.3)
   - 補 `routes/worklogs.ts` 分頁 regression test(US-6.2)
   - 設 E2E framework + 1 條 critical path

2. **Sprint 2 (P1)**:
   - 補 `utils/rbac.ts` 全面 unit test
   - 補 `agent/runtime.ts` 集成 test
   - 補 RBAC middleware integration test(全部 5 角色)

3. **持續**:
   - 每次修 bug → 加 regression test + RG-XXX entry(紅線 13)
   - 每次新 US → 必加 test,先可以 merge(紅線 12)

---

## 8. 變更歷史

| 日期 | 變更 |
|------|------|
| 2026-06-08 | 初版 inventory |
