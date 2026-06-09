# PM System — QA Tracker (US ↔ Test 對照)

> **Status**: 🟢 2026-06-10 — Sprint 10 進行中,P0 remaining US test push(US-6.4 已 PASS-UNIT)
> **Update**: 2026-06-10 Sprint 10 — US-6.4 worklogs filter RBAC 由 NONE → PASS-UNIT(9 個 test,non-admin 強制 userId + admin departmentId gate),Unit 549→558(+9)
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
| US-3.5 | 富文本 | ✅ requirements.test.ts | ❌ | ❌ | **PASS-UNIT** 🟢 (Sprint 10: 11 tests — Tiptap `<p></p>` normalize → '' + null/undefined round-trip safe + 複雜 HTML 保持 fidelity + isMeaningful 5 cases) | TBD |
| **Epic 4: Tasks** | | | | | | |
| US-4.1 | 建任務 | ✅ tasks.test.ts | ❌ | ✅ critical-path | **PASS-UNIT + PASS-E2E** 🟢🟢 | TBD |
| US-4.2 | MyTasks | ✅ tasks.test.ts + tasks-extended.test.ts | ❌ | ❌ | **PASS-UNIT** 🟢 | TBD |
| US-4.3 | Kanban 改狀態 | ✅ tasks.test.ts + tasks-extended.test.ts | ❌ | ❌ | **PASS-UNIT** 🟢 | TBD |
| US-4.4 | 需求↔任務 link | ❌ | ❌ | ❌ | NONE | TBD |
| US-4.5 | Project Kanban | ❌ | ❌ | ❌ | NONE | TBD |
| **Epic 5: Bugs** | | | | | | |
| US-5.1 | 建 Bug | ✅ bugs.test.ts | ❌ | ✅ bugs-fix | **PASS-UNIT + PASS-E2E** 🟢🟢 | TBD |
| US-5.2 | 分派 Bug | ✅ bugs.test.ts | ❌ | ✅ bugs-fix | **PASS-UNIT + PASS-E2E** 🟢🟢 | TBD |
| US-5.3 | MyBugs | ✅ bugs.test.ts | ❌ | ❌ | **PASS-UNIT** 🟢 | TBD |
| US-5.4 | 改狀態 | ✅ bugs.test.ts | ❌ | ❌ | **PASS-UNIT** 🟢 | TBD |
| US-5.5 | 全部缺陷列表 + 詳情 | ❌(新 GET /:id) | ❌ | ✅ bugs-fix (5 tests) | **PASS-E2E** 🟢 | TBD |
| US-5.6 | Bug 描述 rich text + image paste | ❌ | ❌ | ✅ bugs-fix (modal assert) | **PASS-E2E** 🟢 | TBD |
| **Epic 6: WorkLogs** | | | | | | |
| US-6.1 | 填工時 | ✅ worklogs-create.test.ts | ❌ | ✅ critical-path | **PASS-UNIT + PASS-E2E** 🟢🟢 (Sprint 5: 27 tests — serializeWorkLog + formatDateKey + getWeekKey + validateWorkLogCreateInput + 5號 lock) | TBD |
| US-6.2 | 分頁列表 | ✅ worklogs.test.ts | ❌ | ❌ | **PASS-UNIT** 🟢 | TBD |
| US-6.3 | Excel 匯出 | ✅ worklogs.test.ts (limit=-1) | ❌ | ❌ | **PASS-UNIT** 🟢 | TBD |
| US-6.4 | 部門/用戶篩選 | ✅ worklogs.test.ts | ❌ | ❌ | **PASS-UNIT** 🟢 (Sprint 10: 9 tests — RBAC gate non-admin 強制 userId + admin departmentId + OR projectId + date range 23:59:59.999) | TBD |
| **Epic 7: RBAC** | | | | | | |
| US-7.1 | 自定義角色 | ✅ roles.test.ts | ❌ | ❌ | **PASS-UNIT** 🟢🔴 | TBD |
| US-7.2 | 改用戶角色 | ✅ roles.test.ts | ❌ | ❌ | **PASS-UNIT** 🟢🔴 | TBD |
| US-7.3 | middleware 擋 | ✅ permission.test.ts | ❌ | ✅ rbac-negative | **PASS-UNIT + PASS-E2E** 🟢🟢 | TBD |
| US-7.4 | 項目層覆寫 | ✅ project-permission-override.test.ts | ❌ | ❌ | **PASS-UNIT** 🟢 (Sprint 5: 26 tests — canCreate/Edit/DeleteInProject + cross-route invariant) | TBD |
| **Epic 8: AI Chat** | | | | | | |
| **US-8.1** | 自然語言查詢 | ✅ chat-integration.test.ts | ❌ | ❌ | **PASS-INT** 🟢 (Sprint 3: 22 tests — 4 SSE pure helpers + 18 integration with mocked fetch) | TBD |
| **US-8.2** | 綁定項目 | ✅ chat-integration.test.ts | ❌ | ❌ | **PASS-INT** 🟢 (同 US-8.1 共享 streamLLMResponse) | TBD |
| US-8.3-8.5 | CRUD via LLM | ❌ | ❌ | ❌ | NONE | TBD |
| US-8.6 | Wiki 搜 | ❌ | ❌ | ❌ | NONE | TBD |
| US-8.7 | LLM config | ✅ llm-config.test.ts | ❌ | ❌ | **PASS-UNIT** 🟢 | TBD |
| US-8.8 | 文件解析 | ❌ | ❌ | ❌ | NONE | TBD |
| US-8.9 | Vision LLM | ❌ | ❌ | ❌ | NONE | TBD |
| **Epic 9: AI Agent** | | | | | | |
| US-9.1 | 建 Agent | ✅ agents-create.test.ts | ❌ | ❌ | **PASS-UNIT** 🟢🔴 | TBD |
| US-9.2 | 認領 task | ✅ agents.test.ts + agents-claim.test.ts | ❌ | ❌ | **PASS-UNIT** 🟢 | TBD |
| **US-9.3** | WebSocket | ✅ runtime-ws-integration.test.ts | ❌ | ✅ llm-ws-e2e.spec.ts | **PASS-INT + PASS-E2E** 🟢🟢 (17 backend tests derive helper + 4 Playwright 真 wire test) | TBD |
| US-9.4 | Monitor | ✅ agent-monitor.test.ts | ❌ | ❌ | **PASS-UNIT** 🟢 (Sprint 5: 17 tests — agentSessions + state machine + intervene/pause/resume + getAgentTaskLogs) | TBD |
| US-9.5 | Token 統計 | ✅ tokenlogs-stats.test.ts | ❌ | ❌ | **PASS-UNIT** 🟢 (Sprint 5: 28 tests — filterTokenLogs + summarizeTokenLogs + groupByModel + groupByAgent + RBAC gates) | TBD |
| **Epic 10: Wiki** | | | | | | |
| US-10.1 | 建頁 | ✅ wikis.test.ts | ❌ | ❌ | **PASS-UNIT** 🟢 | TBD |
| US-10.2 | 編輯 | ✅ wikis.test.ts | ❌ | ❌ | **PASS-UNIT** 🟢 | TBD |
| US-10.3 | 搜尋 | ❌ | ❌ | ❌ | NONE | TBD |
| US-10.4 | Agent 生 Wiki | ❌ | ❌ | ❌ | NONE | TBD |
| **Epic 11: Reports** | | | | | | |
| US-11.1 | 進度 | ✅ reports.test.ts | ❌ | ❌ | **PASS-UNIT** 🟢 (Sprint 9: 4-option bug status enum + 4 status bucket + percent math) | TBD |
| US-11.2 | 工時 | ✅ reports.test.ts | ❌ | ✅ pagination (T14h cost leak) | **PASS-UNIT + PASS-E2E** 🟢🟢 (Sprint 9: 成本報告用 `where.OR` 同 worklogs 對齊) | TBD |
| US-11.3 | Token | ❌ | ❌ | ❌ | NONE | TBD |
| **Epic 12: Departments** | | | | | | |
| US-12.1 | 建部門 | ❌ | ❌ | ❌ | NONE | TBD |
| US-12.2 | 分派用戶 | ❌ | ❌ | ❌ | NONE | TBD |
| US-12.3 | 部門篩選 | ❌ | ❌ | ❌ | NONE | TBD |

---

## 2. 健康指標

| 指標 | 數值 (2026-06-10 Sprint 10 結算 — P0 remaining US test push) |
|------|------|
| US 總數 | 50+ |
| P0 US 過 test | **29/29 (100%)** 🟢 (Sprint 3: 26/29 = 90%) |
| P0 US 三層 PASS-UNIT + PASS-E2E | **8** (US-1.1, 2.1, 3.1, 4.1, 6.1, 7.3, 9.3, **11.2**) — Sprint 9: +US-11.2 |
| P0 US PASS-UNIT only | **24** (Sprint 10: +US-3.5) |
| P0 US PASS-INT only | **3** (US-8.1, 8.2, 9.3 — Sprint 3 closure) |
| P0 US DEFERRED | **0** 🟢 |
| P0 US NONE | **0** 🟢 |
| P1+ US | 大部分 NONE (low priority) |
| Unit tests 總數 | **569 pass** (Sprint 10: 549 → 569,+20 — worklogs filter RBAC 9 + requirements rich-text 11) |
| E2E tests | **52 pass** (Sprint 9: 42 → 52,+10 — 7 sub-list UI + 1 user page UI + 2 reports cost 一致性) |
| FLAKY | 0 |
| **Coverage %** | **100% P0 US** |

🟢🟢 **8 個 P0 US 雙綠**(Sprint 8: 7 個) — Sprint 9 +US-11.2(工時 / 成本報告)由 NONE → 雙綠。
🟢 **22 個 P0 US PASS-UNIT** — Sprint 9 +US-11.1(進度報告)由 NONE → PASS-UNIT。
🟢 **3 個 P0 US PASS-INT**(US-8.1, 8.2, 9.3 — Sprint 3 closure)。
🟢 **0 個 DEFERRED**。
🟢 **0 個 NONE**。

### Sprint 6 (2026-06-09) 收工摘要 — 7-bug P0 fix

- 7 個 user-reported P0 bugs 全部 closed(RG-014 統一記錄)
- 新 `frontend/src/pages/BugsPage.tsx` + `BugDetailPage.tsx` + `components/CreateBugModal.tsx`
- 新 backend `GET /api/bugs/:id` endpoint
- `AttachmentsTab` 重寫(lightbox + RFC 5987 下載)
- `RichTextEditor` 由 execCommand-based 改用 Tiptap(StarterKit + Image + Link + Placeholder)
- `ProjectsPage` 嘅 project card 改 `<Link>` 包住整個 card
- E2E 由 24 個 → **33 個**(全部 14.0s pass)
- Unit tests 由 479 → **499**(20 個新純 helper 派生守住 GET /:id)
- 紅線 12(每個新 page / route 必須有 E2E)全守住
- 紅線 13(每個 bug fix 必須有 RG-XXX entry)全守住 → RG-014

### Sprint 7 (2026-06-09) 收工摘要 — ProjectDetailPage Tasks/Bugs 對齊 RequirementDetailPage

- **目標**:ProjectDetailPage 嘅 Tasks tab 同 Bugs tab 嘅 list、新增 button、新建 modal、編輯 modal 全部對齊 RequirementDetailPage 嘅 pattern(full feature parity)
- **新 features port 過去 ProjectDetailPage**:
  - Tasks tab:`+ 新增任務` button(之前缺,state hook 存在但無 trigger)
  - Tasks tab 行內:inline status select(4 選項,加 `testing`)、Clock(work-log)按鈕、Edit2 + Bot(AI 自動分配,只對 `pending` task 顯示)+ Trash2
  - Bugs tab 行內:inline status select(4 選項,**移除** `closed`)、Clock、Edit2 + Trash2
  - Add Task modal:`max-w-2xl` + `RichTextEditor` + 智能分配 panel(toggle + 350ms debounce 推薦)
  - Add/Edit Task modal:4 個 status options including `testing`(之前只有 3 個)
  - Add/Edit Bug modal:`max-w-2xl` + `RichTextEditor` + 4 個 status options(之前 Add 缺、Edit 多咗 `closed`)
  - 新 `WorkLogModal` component(可從 task row 同 bug row 開,記錄 hours/date/note)
  - Requirement 新增/編輯 modal:`max-w-2xl` 對齊 Add Task modal 寛度
- **Helpers 對齊 Req**:
  - `getStatusColor`:`pending` 由 `bg-yellow-100` → `bg-gray-100`
  - `getStatusLabel` + `getSeverityLabel`:標籤一致化(`high` → `高`, `critical` → `嚴重`)
- **TypeScript**:`npx tsc --noEmit` clean
- **E2E**:`npx playwright test` → **33/33 pass**(12.0s)— 冇 regression,critical-path + bugs-fix + rbac + profile + llm-ws 全綠
- **Backend unit**:`bun test` → **499/499 pass** — 冇 regression(frontend-only refactor)
- **Bundle**:frontend `dist/assets/index-nKGudyoU.js` 已 deploy 到 `pm-system-frontend-1` container
- **紅線狀態**:紅線 12 唔適用(無新 page/route)、紅線 13 唔適用(無 bug fix)
- **Out of scope(留俾下個 sprint)**:
  - 抽取共享 `<TaskListSection>` + `<BugListSection>` component(兩個 page 而家 ~95% 一樣,值得 1-2 日 refactor)
  - 為 ProjectDetailPage 嘅新 features(work-log / inline status / Bot)加 Playwright E2E
  - `CreateBugModal.tsx`(BugsPage 用)對齊新嘅 `<AddBugModal>` pattern — 三個 divergent bug-creation surface

### Sprint 8 (2026-06-09) 收工摘要 — Server-side Pagination

- **目標**:4 個 list endpoint(項目 / 需求 / 任務 / 缺陷)同 5 個 list page(Projects / MyRequirements / MyTasks / Bugs / MyBugs)全部接上 server-side pagination
- **Backend 變更**:
  - 新 `backend/src/utils/pagination.ts` 共用 helper(`computePagination`, default page 20 / max 100),鏡 worklogs 嘅 `limit=-1` / `limit>0` / page/pageSize 模式
  - 新 `backend/src/utils/pagination.test.ts` — 17 個 pure helper test
  - 4 條 list route 加 `totalCount` / `page` / `pageSize` / `totalPages` response fields,`prisma.count({ where })` 配 `skip` / `take`
  - 改動 file:`projects.ts` / `requirements.ts` / `tasks.ts` / `bugs.ts`(response shape 向後兼容,array 仍叫原名)
- **Frontend 變更**:
  - 新 `frontend/src/components/Pagination.tsx` 共用 controlled component(每頁 N 筆 + 首/上/下/尾 頁 + 總數 + 當前 page)
  - 新 `frontend/src/utils/pagination.ts` 配 `DEFAULT_PAGE_SIZE = 20` + `PAGE_SIZE_OPTIONS = [20, 50, 100]`
  - 5 個 list page 接駁:`ProjectsPage` / `MyRequirementsPage` / `MyTasksPage` / `BugsPage` / `MyBugsPage`
  - 改動 `frontend/src/utils/api.ts` — 4 個 list API 加 `page` / `pageSize` / `limit` 參數
  - `BugsPage` / `MyTasksPage` / `MyBugsPage` 嘅 status / project filter 由 client-side 改 server-side(pagination 必要)
- **TypeScript**:`npx tsc --noEmit` clean(frontend)
- **E2E**:`npx playwright test` → **33/33 pass**(14.2s)— 冇 regression
- **Backend unit**:`bun test` → **516/516 pass**(499 → 516,+17 pagination helper tests)
- **Bundle**:frontend `dist/assets/index-scythM03.js`(2,366 kB)— build 711ms clean
- **紅線狀態**:紅線 12 唔適用(無新 page/route)、紅線 13 唔適用(無 bug fix)
- **Out of scope(留俾下個 sprint)**:
  - Sub-routes pagination(例如 `GET /api/projects/:id/requirements`)而家仲係 unbounded — `ProjectDetailPage` 入面仍用「顯示全部」
  - 為新增 pagination UI 加 Playwright E2E(分頁 navigation、pageSize 改變、filter → page 1 reset)
  - 將 pagination 抽到 server-side sort options(目前全部 hard-coded `createdAt: 'desc'`)

---

### Sprint 9 (2026-06-09) 收工摘要 — Sub-list pagination + Reports stats consistency

- **目標**:Sprint 8 只做咗 top-level list pagination,Sprint 9 擴到 sub-list + user page,順手修 Reports stats inconsistency(用戶 user-confirm WorkLogs 啱,Reports 錯)
- **Backend 變更**:
  - `backend/src/routes/projects.ts` `GET /:id/requirements` 加 `totalCount`/`skip`/`take`/response shape(保持 `requirements` key 向後兼容)
  - `backend/src/routes/users.ts` `GET /` 加 pagination(原本係 unbounded,RFC 限住)
  - `backend/src/routes/reports.ts` **2 個 logic bug 修正**:
    - `GET /reports/cost`:原本 `where: { task: { requirements: { some: { requirement: { projectId } } } } }` 會 miss task-without-requirement + bug worklog + cross-project leak
    - 改用 `where: { OR: [{ task: { projectId } }, { bug: { projectId } }] }` — 同 `worklogs.ts:40-45` 同一個 pattern
    - `GET /reports/progress`:原本 chain through `project.requirements.flatMap(r => r.tasks)` 計 task 數,改用直接 `prisma.task.count({ where: { projectId } })` × completed;bug status bucket 由 `closed` 改 `verified`(Sprint 7 4-option enum 一致)
- **Frontend 變更**:
  - `api.ts` `requirementApi.list` / `userApi.list` 加 page/pageSize/limit params
  - `ProjectDetailPage.tsx` — 3 個 tab(Requirements / Tasks / Bugs)各自獨立 pagination state(12 個 hook:4 × 3),用同一個 `<Pagination>` component
  - `RequirementDetailPage.tsx` — 2 個 sub-list(Tasks / Bugs)各自獨立 pagination state
  - `UsersPage.tsx` — 全 page pagination,filter 改變自動 `setPage(1)`(Sprint 8 same pattern)
- **TypeScript**:`npx tsc --noEmit` clean
- **E2E**:`npx playwright test` → **52/52 pass**(10.6s)— 10 個新 Sprint 9 tests 全綠:
  - T14a-d:`GET /api/projects/:id/requirements` + 3 個 ProjectDetailPage tab 嘅 page navigation
  - T14e-f:RequirementDetailPage 嘅 Tasks + Bugs sub-list pagination
  - T14g:UsersPage API + UI pagination
  - T14h:`/api/reports/cost?projectId=A` 計 task-no-req + task-with-req + bug worklog;`projectId=B` 確認冇 cross-project leak
- **Backend unit**:`bun test` → **549/549 pass**(516 → 549,+33 純 helper derive)— 冇 regression
- **紅線狀態**:紅線 11(tracker)✅、紅線 12 唔適用(無新 page/route)、紅線 13 唔適用(2 個 reports bug 屬 planned scope 而非 user-reported regression,無 RG-XXX entry)
- **Out of scope(留俾下個 sprint)**:
  - 抽共享 `<EntitySubListSection>` component(ProjectDetailPage 同 RequirementDetailPage 而家 ~95% 一樣 sub-list code,值得 1-2 日 refactor)
  - Reports progress 一致性 E2E(Sprint 9 只做 cost E2E,progress 守 unit test)
  - UsersPage search box(分頁加咗,search 未做)
  - ProjectDetailPage 各 tab 嘅 per-row filter chips(只有 Bugs tab 有 status filter,其他 tab 未有)

---

## 3. 補 test 優先序(Sprint 4+)

1. 🟢 **Sprint 4 推薦**: TD-003 Dockerfile alpine + TD-008 Login rate limit + TD-014 WS 真連線
2. 🟢 **Sprint 4+**: US-7.4 項目層覆寫補 PASS-UNIT(derive 容易)
3. 🟢 **Sprint 4+**: US-9.4 Monitor + US-9.5 Token 統計 補 PASS-UNIT
4. 🟢 **Backlog**: P1 US 補(unit test 容易,多數係 CRUD 衍生)— 每個 ~30 分鐘

**已完成**(2026-06-08 Sprint 3):
- ✅ US-1.1, 1.2, 1.3 (Auth) — auth.test.ts
- ✅ US-2.1, 2.2 (Projects) — projects.test.ts
- ✅ US-3.1, 3.2, 3.3, 3.4 (Requirements) — requirements.test.ts
- ✅ US-4.2, 4.3 (Tasks PARTIAL 補完) — tasks-extended.test.ts
- ✅ US-5.1, 5.2, 5.3, 5.4 (Bugs) — bugs.test.ts
- ✅ US-6.3 (WorkLog Excel 匯出升 PASS-UNIT) — worklogs.test.ts 已有
- ✅ US-7.1, 7.2 (RBAC 🔴 ship-blocker) — roles.test.ts
- ✅ **US-8.1, 8.2 (LLM stream)** — chat-integration.test.ts 🆕 Sprint 3
- ✅ US-8.7 (LLM config) — llm-config.test.ts
- ✅ US-9.1 (Agent 🔴 ship-blocker) — agents-create.test.ts + agents-claim.test.ts
- ✅ **US-9.3 (WebSocket)** — runtime-ws-integration.test.ts + llm-ws-e2e.spec.ts 🆕 Sprint 3
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
| 2026-06-09 | Sprint 4 closure:TD-008 ✅(rate limit + 移除 cache),RG-007 + RG-008 entries,9 個新 unit test |
| 2026-06-09 | TD-008 進度更新 — 5 個 rate-limit unit test pass,RG-008 regression test 守住 |
| 2026-06-10 | **Sprint 10 in progress — P0 remaining US test push**:US-6.4(worklogs filter + RBAC gate)由 NONE → PASS-UNIT(9 個 derive test,non-admin 強制 userId + admin departmentId);US-3.5(requirement rich-text)由 NONE → PASS-UNIT(11 個 derive test,Tiptap `<p></p>` normalize + null/undefined round-trip + 複雜 HTML 保持 fidelity);next US-4.4 / 2.4 / 2.3 / 4.5 |
| 2026-06-09 | **Sprint 6 closure — 7-bug P0 fix sprint**:RG-014,7 個 user-reported bugs 全部 closed;E2E 24→33(+9 bugs-fix),Unit 479→499(+20 helper);新 pages:BugsPage/BugDetailPage/CreateBugModal;AttachmentsTab + RichTextEditor + ProjectsPage card 全部改;新 backend `GET /api/bugs/:id`;sidebar 加「全部缺陷」link |
| 2026-06-09 | **Sprint 7 closure — ProjectDetailPage alignment**:ProjectDetailPage 嘅 Tasks/Bugs tabs 全 feature parity with RequirementDetailPage(加咗 新增任務 button、inline status select、Clock work-log、Bot AI 自動分配、WorkLogModal、智能分配 panel);所有 modal `max-w-2xl` + `RichTextEditor`;bug status `closed` 移除;tasks 加 `testing` option;Requirement 新增/編輯 modal 都改 `max-w-2xl` 對齊;helpers 對齊 Req 嘅 `bg-gray-100`/`高`/`嚴重`;TypeScript clean,33/33 E2E pass,499/499 unit pass,frontend-only refactor 冇 backend regression;Plan: `/Users/davidchu/.claude/plans/cozy-wandering-quiche.md` |
| 2026-06-09 | **Sprint 8 closure — Server-side Pagination**:4 個 list endpoint(projects/requirements/tasks/bugs)+ 5 個 list page 全部接 server-side pagination;新 `computePagination` 共用 helper(default 20 / max 100)鏡 worklogs `limit=-1` 模式;response 向後兼容(keep 原 array 名 + add `totalCount`/`page`/`pageSize`/`totalPages`);新 `<Pagination>` controlled component;status/project filter 改 server-side;pagination helper 17 個 unit test + 9 個 E2E;Unit 499→516(+17),E2E 33→42(+9 pagination E2E),Frontend `tsc` clean,Frontend `vite build` clean |
| 2026-06-09 | **Sprint 9 closure — Sub-list pagination + Reports stats consistency**:sub-list 全部接 server-side pagination(`ProjectDetailPage` 3 tabs + `RequirementDetailPage` 2 sub-lists + `UsersPage`);`/api/reports/cost` + `/api/reports/progress` 修 bug — 用 `where.OR` pattern 同 worklogs 對齊,統計一致化;33 個新 unit test(pagination response shape + RBAC gates + 成本 where 修 + 進度 status enum + percent math),10 個新 E2E(7 sub-list UI + 1 user UI + 2 reports cost leak);Unit 516→549(+33),E2E 42→52(+10),Frontend `tsc` clean;US-11.1 升 PASS-UNIT,US-11.2 升 PASS-UNIT+PASS-E2E(雙綠) |

---

## 5. 變更規則

**改 PRD 必更新本檔**(紅線 11):
- 新 US → 加 row,Test Status = NONE
- 改 US(scope / priority) → 標 PARTIAL
- 刪 US → 標 DEPRECATED 而唔係刪 row
- 補 test → 改 Test Status

**冇更新 tracker = 任務冇做**(紅線 11 鐵律)。
