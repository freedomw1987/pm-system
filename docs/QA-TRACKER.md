# PM System — QA Tracker (US ↔ Test 對照)

> **Status**: 🟢 2026-06-08 — Sprint 2 補完,79% P0 US 過紅線 12 + 16
> **Rule**: 改 PRD 必更新本檔(紅線 11)

---

## 1. 對照表

### Legend
- **Test Status**: NONE / DRAFT / PARTIAL / PASS / FLAKY
- **Owner**: TBD / 名字

| **US** | **Title** | **Backend Test** | **Frontend Test** | **E2E Test** | **Test Status** | **Owner** |
|--------|-----------|-------------------|-------------------|--------------|-----------------|-----------|
| **Epic 1: Auth** | | | | | | |
| US-1.1 | login | ✅ auth.test.ts | ❌ | ✅ critical-path | **PASS-UNIT + PASS-E2E** 🟢🟢 | TBD |
| US-1.2 | refresh | ✅ auth.test.ts | ✅ authRefresh.test.ts | ❌ | **PASS-UNIT** 🟢 | TBD |
| US-1.3 | logout | ✅ auth.test.ts | ❌ | ❌ | **PASS-UNIT** 🟢 | TBD |
| **Epic 2: Projects** | | | | | | |
| US-2.1 | 建項目 | ✅ projects.test.ts | ❌ | ✅ critical-path | **PASS-UNIT + PASS-E2E** 🟢🟢 | TBD |
| US-2.2 | 加成員 | ✅ projects.test.ts | ❌ | ❌ | **PASS-UNIT** 🟢 | TBD |
| US-2.3 | dashboard | ❌ | ❌ | ❌ | NONE | TBD |
| US-2.4 | 部門 link | ❌ | ❌ | ❌ | NONE | TBD |
| **Epic 3: Requirements** | | | | | | |
| US-3.1 | 建需求 | ✅ requirements.test.ts | ❌ | ✅ critical-path | **PASS-UNIT + PASS-E2E** 🟢🟢 | TBD |
| US-3.2 | 分派 | ✅ requirements.test.ts | ❌ | ❌ | **PASS-UNIT** 🟢 | TBD |
| US-3.3 | MyRequirements | ✅ requirements.test.ts | ❌ | ❌ | **PASS-UNIT** 🟢 | TBD |
| US-3.4 | 改狀態 | ✅ requirements.test.ts | ❌ | ❌ | **PASS-UNIT** 🟢 | TBD |
| US-3.5 | 富文本 | ❌ | ❌ | ❌ | NONE | TBD |
| **Epic 4: Tasks** | | | | | | |
| US-4.1 | 建任務 | ✅ tasks.test.ts | ❌ | ✅ critical-path | **PASS-UNIT + PASS-E2E** 🟢🟢 | TBD |
| US-4.2 | MyTasks | ✅ tasks.test.ts + tasks-extended.test.ts | ❌ | ❌ | **PASS-UNIT** 🟢 | TBD |
| US-4.3 | Kanban 改狀態 | ✅ tasks.test.ts + tasks-extended.test.ts | ❌ | ❌ | **PASS-UNIT** 🟢 | TBD |
| US-4.4 | 需求↔任務 link | ❌ | ❌ | ❌ | NONE | TBD |
| US-4.5 | Project Kanban | ❌ | ❌ | ❌ | NONE | TBD |
| **Epic 5: Bugs** | | | | | | |
| US-5.1 | 建 Bug | ✅ bugs.test.ts | ❌ | ❌ | **PASS-UNIT** 🟢 | TBD |
| US-5.2 | 分派 Bug | ✅ bugs.test.ts | ❌ | ❌ | **PASS-UNIT** 🟢 | TBD |
| US-5.3 | MyBugs | ✅ bugs.test.ts | ❌ | ❌ | **PASS-UNIT** 🟢 | TBD |
| US-5.4 | 改狀態 | ✅ bugs.test.ts | ❌ | ❌ | **PASS-UNIT** 🟢 | TBD |
| **Epic 6: WorkLogs** | | | | | | |
| US-6.1 | 填工時 | ❌ | ❌ | ✅ critical-path | **PASS-E2E** 🟢 | TBD |
| US-6.2 | 分頁列表 | ✅ worklogs.test.ts | ❌ | ❌ | **PASS-UNIT** 🟢 | TBD |
| US-6.3 | Excel 匯出 | ✅ worklogs.test.ts (limit=-1) | ❌ | ❌ | **PASS-UNIT** 🟢 | TBD |
| US-6.4 | 部門/用戶篩選 | ❌ | ❌ | ❌ | NONE | TBD |
| **Epic 7: RBAC** | | | | | | |
| US-7.1 | 自定義角色 | ✅ roles.test.ts | ❌ | ❌ | **PASS-UNIT** 🟢🔴 | TBD |
| US-7.2 | 改用戶角色 | ✅ roles.test.ts | ❌ | ❌ | **PASS-UNIT** 🟢🔴 | TBD |
| US-7.3 | middleware 擋 | ✅ permission.test.ts | ❌ | ✅ rbac-negative | **PASS-UNIT + PASS-E2E** 🟢🟢 | TBD |
| US-7.4 | 項目層覆寫 | ❌ | ❌ | ❌ | NONE | TBD |
| **Epic 8: AI Chat** | | | | | | |
| US-8.1 | 自然語言查詢 | ❌ | ❌ | ❌ | **DEFERRED** 🟡 (chat.ts 1787行,unit test 唔啱) | TBD |
| US-8.2 | 綁定項目 | ❌ | ❌ | ❌ | **DEFERRED** 🟡 (同上) | TBD |
| US-8.3-8.5 | CRUD via LLM | ❌ | ❌ | ❌ | NONE | TBD |
| US-8.6 | Wiki 搜 | ❌ | ❌ | ❌ | NONE | TBD |
| US-8.7 | LLM config | ✅ llm-config.test.ts | ❌ | ❌ | **PASS-UNIT** 🟢 | TBD |
| US-8.8 | 文件解析 | ❌ | ❌ | ❌ | NONE | TBD |
| US-8.9 | Vision LLM | ❌ | ❌ | ❌ | NONE | TBD |
| **Epic 9: AI Agent** | | | | | | |
| US-9.1 | 建 Agent | ✅ agents-create.test.ts | ❌ | ❌ | **PASS-UNIT** 🟢🔴 | TBD |
| US-9.2 | 認領 task | ✅ agents.test.ts + agents-claim.test.ts | ❌ | ❌ | **PASS-UNIT** 🟢 | TBD |
| US-9.3 | WebSocket | ❌ | ❌ | ❌ | **DEFERRED** 🟡 (agent/runtime.ts 645行,WS unit test 唔啱) | TBD |
| US-9.4 | Monitor | ❌ | ❌ | ❌ | NONE | TBD |
| US-9.5 | Token 統計 | ❌ | ❌ | ❌ | NONE | TBD |
| **Epic 10: Wiki** | | | | | | |
| US-10.1 | 建頁 | ✅ wikis.test.ts | ❌ | ❌ | **PASS-UNIT** 🟢 | TBD |
| US-10.2 | 編輯 | ✅ wikis.test.ts | ❌ | ❌ | **PASS-UNIT** 🟢 | TBD |
| US-10.3 | 搜尋 | ❌ | ❌ | ❌ | NONE | TBD |
| US-10.4 | Agent 生 Wiki | ❌ | ❌ | ❌ | NONE | TBD |
| **Epic 11: Reports** | | | | | | |
| US-11.1 | 進度 | ❌ | ❌ | ❌ | NONE | TBD |
| US-11.2 | 工時 | ❌ | ❌ | ❌ | NONE | TBD |
| US-11.3 | Token | ❌ | ❌ | ❌ | NONE | TBD |
| **Epic 12: Departments** | | | | | | |
| US-12.1 | 建部門 | ❌ | ❌ | ❌ | NONE | TBD |
| US-12.2 | 分派用戶 | ❌ | ❌ | ❌ | NONE | TBD |
| US-12.3 | 部門篩選 | ❌ | ❌ | ❌ | NONE | TBD |

---

## 2. 健康指標

| 指標 | 數值 (2026-06-08 Sprint 2 結算) |
|------|------|
| US 總數 | 50+ |
| P0 US 過 test | **23/29 (79%)** 🟢 (Sprint 1: 8/29 = 28%) |
| P0 US 三層 PASS-UNIT + PASS-E2E | **5** (US-1.1, 2.1, 3.1, 4.1, 7.3) |
| P0 US PASS-UNIT only | **17** (US-1.2, 1.3, 2.2, 3.2, 3.3, 3.4, 4.2, 4.3, 5.1, 5.2, 5.3, 5.4, 6.2, 6.3, 7.1, 7.2, 8.7, 9.1, 9.2) |
| P0 US PASS-E2E only | **1** (US-6.1 缺 unit, 將來補) |
| P0 US DEFERRED | **3** (US-8.1, 8.2, 9.3 — 須 integration test) |
| P0 US NONE | **3** (Epic 8 部分 + 9.4, 9.5) |
| P1+ US | 大部分 NONE (low priority) |
| Unit tests 總數 | **333 pass** (Sprint 1: 45) |
| E2E tests | 13 pass (Sprint 1 同) |
| FLAKY | 0 |
| **Coverage %** | **~79% P0 US** (Sprint 1: 28%) |

🟢🟢 **5 個 P0 US 雙綠**(Sprint 1: 1 個)。Sprint 2 從 1 → 5。
🟢 **17 個 P0 US PASS-UNIT**(Sprint 1: 3 個)。Sprint 2 從 3 → 17,加咗 14 個。
🟡 **3 個 P0 US DEFERRED**(Sprint 2 retro ACT-14/15:Sprint 3 做 integration test)。
🔴 **0 個 ship blocker**(Sprint 1 標 🔴 嘅 US-7.1, US-9.1 全部 PASS-UNIT)。

---

## 3. 補 test 優先序(Sprint 3+)

1. 🟡 **Sprint 3**: US-8.1/8.2/9.3 integration test(WS client + OpenAI mock)— **8-12 個鐘 scope**
2. 🟡 **Sprint 3**: US-6.1 填工時補 PASS-UNIT(已有 PASS-E2E)— ~30 分鐘
3. 🟢 **Sprint 3+**: 補 P0+ US-1.x ~ 9.x 嘅 frontend test(紅線 16 E2E 之外的第三層)— 視乎 spec
4. 🟢 **Backlog**: P1 US 補(unit test 容易,多數係 CRUD 衍生)— 每個 ~30 分鐘

**已完成**(2026-06-08 Sprint 2):
- ✅ US-1.1, 1.2, 1.3 (Auth) — auth.test.ts
- ✅ US-2.1, 2.2 (Projects) — projects.test.ts
- ✅ US-3.1, 3.2, 3.3, 3.4 (Requirements) — requirements.test.ts
- ✅ US-4.2, 4.3 (Tasks PARTIAL 補完) — tasks-extended.test.ts
- ✅ US-5.1, 5.2, 5.3, 5.4 (Bugs) — bugs.test.ts
- ✅ US-6.3 (WorkLog Excel 匯出升 PASS-UNIT) — worklogs.test.ts 已有
- ✅ US-7.1, 7.2 (RBAC 🔴 ship-blocker) — roles.test.ts
- ✅ US-8.7 (LLM config) — llm-config.test.ts
- ✅ US-9.1 (Agent 🔴 ship-blocker) — agents-create.test.ts + agents-claim.test.ts
- ✅ US-10.1, 10.2 (Wiki) — wikis.test.ts

**Sprint 1 已完成**(2026-06-08):
- ✅ US-6.2 WorkLog 分頁
- ✅ US-7.3 RBAC middleware
- ✅ US-9.2 Agent claim-task

---

## 4. 變更歷史(本檔)

| 日期 | 變更 |
|------|------|
| 2026-06-08 | 初版 derive 自 PRD + backend source |
| 2026-06-08 | Sprint 1 補 test 行動:3 份新 test (RBAC/WorkLog/Agent),3 個 P0 US 升至 PASS-UNIT,coverage 5%→25% |
| 2026-06-08 | Sprint 1 補 E2E:Playwright + critical-path.spec.ts,3 tests 過,5 個 P0 US 升至 PASS-E2E |
| 2026-06-08 | Sprint 1 補 E2E RBAC negative:rbac-negative.spec.ts,10 tests 過,US-7.3 升至 PASS-UNIT+PASS-E2E |
| 2026-06-08 | Fix TD-011(derive hook + role 從 DB 攞),E2E 500→403 |
| 2026-06-08 | **Sprint 2 P0 Unit Test Push**:9 份新 test file (auth/projects/requirements/bugs/roles/agents-create/agents-claim/tasks-extended/wikis/llm-config),288 個 unit test,15 個 P0 US 由 NONE/PARTIAL 升至 PASS-UNIT,P0 US coverage 28%→79% |
| 2026-06-08 | Sprint 2 標記 US-8.1/8.2/9.3 為 DEFERRED(chat.ts 1787 行 + agent/runtime.ts 645 行,unit test 唔啱,改用 integration test approach)— Sprint 3 做 |
| 2026-06-08 | Sprint 2 關閉 Sprint 1 標 🔴 嘅 US-7.1 + US-9.1 兩個 ship-blocker(0 個 ship-blocker 剩低) |

---

## 5. 變更規則

**改 PRD 必更新本檔**(紅線 11):
- 新 US → 加 row,Test Status = NONE
- 改 US(scope / priority) → 標 PARTIAL
- 刪 US → 標 DEPRECATED 而唔係刪 row
- 補 test → 改 Test Status

**冇更新 tracker = 任務冇做**(紅線 11 鐵律)。
