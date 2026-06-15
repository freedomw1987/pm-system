---
id: TEST-COVERAGE
aliases: []
tags: []
---

# PM System — Test Coverage Report

> **Status**: 2026-06-11 snapshot (Sprint 20 closure)
> **Method**: `find . -name "*.test.*" -not -path "*/node_modules/*"` 掃 source tree

---

## 1. 當前覆蓋率

| Layer | Test Files | Test Count | 備註 |
|-------|-----------|------------|------|
| Backend Unit (`backend/src/**/*.test.ts`) | 7 | 645 | tasks + permission + worklogs + agents + reports + bugs + requirements |
| Backend Integration | 0 | 0 | — |
| Frontend Unit (`frontend/src/**/*.test.ts`) | 5 | 5 | authRefresh + permissions + pdfExport + (其他純邏輯 helpers) |
| Frontend Component | 9 | 88 | BugsFrontend + LLMAgentForm + WorkLogsFrontend + RBACFrontend + LoginForm + RequirementsFrontend + TasksFrontend + ReportsFrontend + ProjectsFrontend + UserAutocomplete |
| E2E (Playwright / Cypress) | 12 | 66 + 8 skipped | critical path + RBAC negative + profile + bugs-fix + 8 個 sprint 後續 |
| **Total** | **33+** | **~810** | **~70% coverage (rough estimate, 視乎未跑 c8/nyc)** |

### E2E test files (4)

5. `e2e/tests/critical-path.spec.ts` — 3 tests(2026-06-08 加)
6. `e2e/tests/rbac-negative.spec.ts` — **10 tests**(2026-06-08 加,US-7.3):
   - developer / tester / pm 嘗試 POST /projects → 403
   - developer / tester 嘗試 DELETE /users → 403
   - tester 嘗試 POST /agents → 403
   - 冇 token / malformed token → 403(backend 將 auth-missing 視為 FORBIDDEN)
   - 已知 bug:non-existent UUID token → 500(要 fix,見 TECH-DEBT)
   - positive control:admin 同一 endpoint → 200
   - developer 刪他人 worklog → 403(worklogs.delete_all gate)
7. `e2e/tests/profile.spec.ts` — **7 tests**(2026-06-09 加,US-1.4):
   - render user info(name / email / role)
   - unauthenticated user → redirect /login(ProtectedRoute)
   - 兩個 password input 嘅 show/hide toggle 都 work
   - 新密碼太短 → client-side validation error(繞過 HTML5 minLength)
   - 確認密碼不符 → client-side validation error
   - 錯誤 currentPassword → server error 400 INVALID_PASSWORD
   - happy path:改密碼 → 新密碼可登入 → 還原密碼
8. `e2e/tests/bugs-fix.spec.ts` — **9 tests**(2026-06-09 加,7-bug P0 sprint):
   - **Bug #1/#2** — 全部缺陷列表有「新建缺陷」button + 項目 filter dropdown
   - **Bug #3** — click bug row 跳去 /bugs/:id(BugDetailPage)
   - **Bug #4** — 編輯缺陷 → save 即時更新 title(用 response patch,無需 reload)
   - **Bug #5** — 附件 image 有 <img> preview + lightbox modal + 下載 header 帶 RFC 5987 filename*
   - **Bug #6/#7** — CreateBugModal 有「指派給誰」dropdown + 揀項目後 enable
   - **Bug #7 happy path** — 完整 create flow:title/severity/project/assignee → 喺 list 出現 → cleanup
   - **Bug #8** — Project card 任何位 click 都跳去 detail(唔只係 h3)
   - **Bug #8 regression** — Edit/Delete button click 唔 navigate(保留 modal)

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
| Backend route test coverage | > 80% | ~25% | 🟡 |
| Frontend critical path test | > 50% | ~10% | 🔴 |
| E2E critical paths | 至少 3 條 | **3** | 🟢 |
| E2E US-1.4 (change password) | full | **7 tests** | 🟢 |
| Regression test for fixed bugs | 100% (RG-XXX) | 40% (1/5) | 🟡 |
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
| 2026-06-08 | Sprint 1 補 unit test (3 份,42 tests) |
| 2026-06-08 | Sprint 1 補 E2E (1 份,3 tests) — Playwright + critical path |
| 2026-06-08 | Sprint 1 補 E2E RBAC negative (1 份,10 tests) — US-7.3 真 HTTP level 守住 |
| 2026-06-09 | Sprint 1 補 E2E profile (1 份,7 tests) — US-1.4 改密碼真 E2E + 揭咗 2 個 bug(ProfilePage URL + backend derive 唔覆蓋 /auth/*) |
| 2026-06-10 | Sprint 10 P0 unit test push — worklogs/requirements/tasks/projects 補 derive tests(+38) |
| 2026-06-10 | Sprint 12 — `project-detail-bug-tab.spec.ts` 4 tests(US-5.6 E2E) |
| 2026-06-10 | Sprint 15-17 — Dashboard scope=my、modal unify、E2E regression guard(66/66 + 8 skipped) |
| 2026-06-10 | Sprint 19 — 全 US 測試覆蓋 12 份 component test 補齊(+88 tests) |
| **2026-06-11** | **Sprint 20 — Reports 多視角 + 導出 + 4 個 UX 改進:`UserAutocomplete.test.tsx` 9 tests + `pdfExport.test.ts` 2 tests + `reports.test.ts` +12 aggregation helper tests(by-department 4 / by-user 5 / fillDailyRange 3);Backend 638→645(+7),Frontend 76→88(+12),0 fail** |
