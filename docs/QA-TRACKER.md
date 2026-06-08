# PM System — QA Tracker (US ↔ Test 對照)

> **Status**: 🔴 2026-06-08 — 極多 P0 US 0 test
> **Rule**: 改 PRD 必更新本檔(紅線 11)

---

## 1. 對照表

### Legend
- **Test Status**: NONE / DRAFT / PARTIAL / PASS / FLAKY
- **Owner**: TBD / 名字

| US | Priority | Backend Test | Frontend Test | E2E Test | Test Status | Owner |
|----|----------|--------------|---------------|----------|-------------|-------|
| **Epic 1: Auth** | | | | | | |
| US-1.1 login | P0 | ❌ | ❌ | ❌ | NONE | TBD |
| US-1.2 refresh | P0 | ❌ | ✅ authRefresh.test.ts | ❌ | PARTIAL | TBD |
| US-1.3 logout | P0 | ❌ | ❌ | ❌ | NONE | TBD |
| **Epic 2: Projects** | | | | | | |
| US-2.1 建項目 | P0 | ❌ | ❌ | ❌ | NONE | TBD |
| US-2.2 加成員 | P0 | ❌ | ❌ | ❌ | NONE | TBD |
| US-2.3 dashboard | P1 | ❌ | ❌ | ❌ | NONE | TBD |
| US-2.4 部門 link | P2 | ❌ | ❌ | ❌ | NONE | TBD |
| **Epic 3: Requirements** | | | | | | |
| US-3.1 建需求 | P0 | ❌ | ❌ | ❌ | NONE | TBD |
| US-3.2 分派 | P0 | ❌ | ❌ | ❌ | NONE | TBD |
| US-3.3 MyRequirements | P0 | ❌ | ❌ | ❌ | NONE | TBD |
| US-3.4 改狀態 | P0 | ❌ | ❌ | ❌ | NONE | TBD |
| US-3.5 富文本 | P1 | ❌ | ❌ | ❌ | NONE | TBD |
| **Epic 4: Tasks** | | | | | | |
| US-4.1 建任務 | P0 | ✅ tasks.test.ts | ❌ | ❌ | PARTIAL | TBD |
| US-4.2 MyTasks | P0 | ✅ tasks.test.ts | ❌ | ❌ | PARTIAL | TBD |
| US-4.3 Kanban 改狀態 | P0 | ✅ tasks.test.ts | ❌ | ❌ | PARTIAL | TBD |
| US-4.4 需求↔任務 link | P1 | ❌ | ❌ | ❌ | NONE | TBD |
| US-4.5 Project Kanban | P1 | ❌ | ❌ | ❌ | NONE | TBD |
| **Epic 5: Bugs** | | | | | | |
| US-5.1 建 Bug | P0 | ❌ | ❌ | ❌ | NONE | TBD |
| US-5.2 分派 Bug | P0 | ❌ | ❌ | ❌ | NONE | TBD |
| US-5.3 MyBugs | P0 | ❌ | ❌ | ❌ | NONE | TBD |
| US-5.4 改狀態 | P0 | ❌ | ❌ | ❌ | NONE | TBD |
| **Epic 6: WorkLogs** | | | | | | |
| US-6.1 填工時 | P0 | ❌ | ❌ | ❌ | NONE | TBD |
| US-6.2 分頁列表 | P0 | ⚠️ manual `9adc1fa` | ❌ | ❌ | PARTIAL | TBD |
| US-6.3 Excel 匯出 | P1 | ❌ | ❌ | ❌ | NONE | TBD |
| US-6.4 部門/用戶篩選 | P1 | ❌ | ❌ | ❌ | NONE | TBD |
| **Epic 7: RBAC** | | | | | | |
| US-7.1 自定義角色 | P0 | ❌ | ❌ | ❌ | NONE 🔴 | TBD |
| US-7.2 改用戶角色 | P0 | ❌ | ❌ | ❌ | NONE | TBD |
| US-7.3 middleware 擋 | P0 | ❌ | ❌ | ❌ | NONE 🔴 | TBD |
| US-7.4 項目層覆寫 | P1 | ❌ | ❌ | ❌ | NONE | TBD |
| **Epic 8: AI Chat** | | | | | | |
| US-8.1 自然語言查詢 | P0 | ❌ | ❌ | ❌ | NONE | TBD |
| US-8.2 綁定項目 | P0 | ❌ | ❌ | ❌ | NONE | TBD |
| US-8.3-8.5 CRUD via LLM | P0 | ❌ | ❌ | ❌ | NONE | TBD |
| US-8.6 Wiki 搜 | P1 | ❌ | ❌ | ❌ | NONE | TBD |
| US-8.7 LLM config | P0 | ❌ | ❌ | ❌ | NONE | TBD |
| US-8.8 文件解析 | P1 | ❌ | ❌ | ❌ | NONE | TBD |
| US-8.9 Vision LLM | P2 | ❌ | ❌ | ❌ | NONE | TBD |
| **Epic 9: AI Agent** | | | | | | |
| US-9.1 建 Agent | P0 | ❌ | ❌ | ❌ | NONE 🔴 | TBD |
| US-9.2 認領 task | P0 | ❌ | ❌ | ❌ | NONE 🔴 | TBD |
| US-9.3 WebSocket | P0 | ❌ | ❌ | ❌ | NONE | TBD |
| US-9.4 Monitor | P1 | ❌ | ❌ | ❌ | NONE | TBD |
| US-9.5 Token 統計 | P1 | ❌ | ❌ | ❌ | NONE | TBD |
| **Epic 10: Wiki** | | | | | | |
| US-10.1 建頁 | P0 | ❌ | ❌ | ❌ | NONE | TBD |
| US-10.2 編輯 | P0 | ❌ | ❌ | ❌ | NONE | TBD |
| US-10.3 搜尋 | P1 | ❌ | ❌ | ❌ | NONE | TBD |
| US-10.4 Agent 生 Wiki | P2 | ❌ | ❌ | ❌ | NONE | TBD |
| **Epic 11: Reports** | | | | | | |
| US-11.1 進度 | P1 | ❌ | ❌ | ❌ | NONE | TBD |
| US-11.2 工時 | P1 | ❌ | ❌ | ❌ | NONE | TBD |
| US-11.3 Token | P2 | ❌ | ❌ | ❌ | NONE | TBD |
| **Epic 12: Departments** | | | | | | |
| US-12.1 建部門 | P1 | ❌ | ❌ | ❌ | NONE | TBD |
| US-12.2 分派用戶 | P1 | ❌ | ❌ | ❌ | NONE | TBD |
| US-12.3 部門篩選 | P1 | ❌ | ❌ | ❌ | NONE | TBD |

---

## 2. 健康指標

| 指標 | 數值 |
|------|------|
| US 總數 | 50+ |
| NONE (0 test) | ~47 |
| PARTIAL | 4 |
| PASS | 0 |
| FLAKY | 0 |
| **Coverage %** | **~5%** |

🔴 **Ship blocker**: 紅線 12 規定 P0 US 必須 PARTIAL/PASS。當前 0 個 P0 US 達標。

---

## 3. 補 test 優先序(下一個 sprint)

1. 🔴 **US-7.3 RBAC middleware** — security critical
2. 🔴 **US-9.1 + US-9.2 Agent lifecycle** — 紅線 16(E2E for P0)
3. 🔴 **US-4.1 / 4.2 / 4.3 Task** — 已有 PARTIAL,擴到 full coverage
4. 🟡 **US-1.1 login** — 簡單,先做
5. 🟡 **US-6.2 WorkLog 分頁** — 有 manual verify 但無 automated regression

---

## 4. 變更歷史(本檔)

| 日期 | 變更 |
|------|------|
| 2026-06-08 | 初版 derive 自 PRD + backend source |

---

## 5. 變更規則

**改 PRD 必更新本檔**(紅線 11):
- 新 US → 加 row,Test Status = NONE
- 改 US(scope / priority) → 標 PARTIAL
- 刪 US → 標 DEPRECATED 而唔係刪 row
- 補 test → 改 Test Status

**冇更新 tracker = 任務冇做**(紅線 11 鐵律)。
