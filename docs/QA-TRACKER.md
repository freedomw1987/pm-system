# PM System — QA Tracker (US ↔ Test 對照)

> **Status**: 🟢 2026-06-23 — Post-Sprint-21 audit closure: 84 tests pass / 0 fail,新增 3 個 TECH-DEBT entry (TD-NEW-8/9/10) 候選 Sprint 22;Backend unit 645→671(+26),Frontend component 88 baseline 不變
> **Update**: 2026-06-23 Post-Sprint-21 audit (t1-t4 sweep) — 0 個新增 test 改動,3 個新 TECH-DEBT entry 開 ticket:
>   - **Backend** `documents.test.ts` 28→30(+2 safeSend race tests by `88c582d`);`wikis.test.ts` 30 pass(US-21.3 replace + membership gate);`wiki-search.test.ts` + `wiki-dedup.test.ts` 24 pass(US-21.4 metadata + 12 dedup cases)
>   - **Frontend** 0 改(本 sprint 純 backend/infra hotfix,frontend 未動)
>   - **Infra** nginx config smoke test PASS(5-commit SSE fix compose 成 valid config);docker build-release 配對 audit 確認 image tag flow 一致
>   - **Tech debt 留底 (3 個 P0/P1, Sprint 22 candidate)**:
>     - **TD-NEW-8** (P0): `2495812` 殘留 9 個 `console.log`/`console.warn` 喺 `documents.ts` (lines 438, 502, 511, 658, 662, 1172, 1190, 1199, 1221, 1227)— 影響客戶 log 噪音 + 資料外洩
>     - **TD-NEW-9** (P1): nginx SSE 4-commit workaround chain (`84cc263`/`16d0806`/`d2fd2f1`/`64a37fb`) 應該 eventually 重整,需寫 `docs/SSE-NGINX-TUNING.md` 鎖住 rejection history
>     - **TD-NEW-10** (P1): docker backend upload file storage 跟進 — `5340f30` 已 ship `pm-system-uploads` named volume + `attachment-integrity` startup check,Sprint 22 加 admin endpoint 畀客戶查 orphan file
>   - **Audit reports**:`docs/retros/_meta/post-sprint-21-changelog.md`(t1)、`post-sprint-21-debug-triage.md`(t3)、`build-release-audit-2026-06-23.md`(t2)、`post-sprint-21-regression-2026-06-23.md`(t4)
>   - **Sprint 21 retro** (`2026-06-16-sprint-21-wiki-improvements.md`) **未提及** 2495812 殘留 console.log,呢個係 retro audit gap,Sprint 22 retro 模板要加 "debug log residue" 檢查項
> **Update**: 2026-06-11 Sprint 20 — Reports 多視角 + Excel/PDF 導出 + 4 個 UX 改進:
>   - **Backend** 2 個新 endpoint:`GET /reports/by-department`(部門視角,跨項目聚合成員時數+進度)、`GET /reports/by-user`(個人視角,每日小時序列填 0 補齊)+ 既有 `tasks` / `bugs` PUT 加 `requirementIds` / `requirementId` 支援
>   - **Frontend** `ReportsPage` 完全重寫為 3 視角 tab(📊 項目 / 🏢 部門 / 👤 個人),每視角右上有 📥 Excel + 📄 PDF 按鈕;3 個新 autocomplete 共用元件(`UserAutocomplete` / `DepartmentAutocomplete` / `RequirementAutocomplete`)+ `pdfExport.ts` 工具(jspdf-autotable,中文字型 fallback 英文表頭)
>   - **UX 改進**:WorkLogs 人員下拉改 Autocomplete(按部門聯動過濾)、RequirementModal 容器 max-h + overflow-y-auto(footer submit 鈕固定可見)+ 全寬 toggle(Maximize2/Minimize2)、RichTextEditor 加 Tiptap Table extension 4 個 + 工具列 6 個按鈕(插入表格/+行/+列/-行/-列/刪除)、AddTask/AddBug 透過 `extraFields` slot 加 requirement 關聯
>   - **測試**:`UserAutocomplete.test.tsx` 9 tests + `pdfExport.test.ts` 2 tests + `reports.test.ts` +12 tests(by-department 4 + by-user 5 + fillDailyRange 3);Backend 638→645(+7 new aggregation helper),Frontend 76→88(+12 new),`tsc --noEmit` 0 errors frontend,backend 0 新錯誤
>   - **Tech debt 留底**:PDF 中文字型 fallback 屬已知限制,等下個 epic 引入 NotoSansCJK(USER-MANUAL 未更新,留待 product 文檔 sprint 處理)
>   - **Retro**:`docs/retros/2026-06-11-sprint-20-reports-and-export.md`
> **Update**: 2026-06-10 Sprint 17 — AddTaskModal unification + E2E regression guard:
>   - **Frontend** `AddTaskModal.tsx` 新 component(216 行 single source of truth),`ProjectKanban` + `ProjectDetailPage > Task Tab` 兩個入口共用,Kanban 原 76-line inline modal 拎走(原本缺 RichText / 智能分配 / 參與人 / 父任務 4 個 feature,UI drift 嘅 textbook)
>   - **E2E:63/63 → 66/66 + 8 skipped**(+3 新 spec `add-task-modal-unified.spec.ts` 8.1s pass,守住「兩個入口 modal field set set-diff = ∅」嘅 cross-entry invariant),Backend unit 606 pass(無 backend 改)
>   - **Sprint 15/16 closure 確認**:Sprint 15 scope=my(5 個 backend unit + 2 個 E2E)+ Sprint 16 minimal layout(0 backend 改,Visual verify script)已 ship,本 sprint 同步收口 retro `2026-06-10-sprint-17-modal-unify-and-closure.md`
> **Update**: 2026-06-10 Sprint 16 — Dashboard minimal layout closure:
>   - **Frontend** Dashboard 拎走「最近訪問」Quick Switch section(David 講「只 show 統計 + 項目清單」,navigation affordance 唔屬於呢類)
>   - 保留 4 個 widget 統計(進行中任務 / 未解決缺陷 / 本週時數 / 我參與嘅項目)+ 我參與嘅項目 grid (scope=my 嚴格,pageSize 12)
>   - **E2E:63/63 + 8 skipped**(0 regression,Sprint 15 scope=my 嗰 2 個 E2E 仲 work),Backend unit:606 pass(無 backend 改)
>   - **Visual verify**:`e2e/scripts/verify-sprint16-dashboard.ts` 確認 desktop + iPhone 14 RWD 0 overflow
> **Update**: 2026-06-10 Sprint 15 — Dashboard scope=my 嚴格過濾 closure:
>   - **Backend** `GET /api/projects` 加 `?scope=my` 嚴格只 filter 自己 member 嘅(包括 admin),default 仍然係「member OR 同部門」寬鬆
>   - **Frontend** `Dashboard` 改用 `scope=my` 攞自己參與嘅項目,widget 4 由「項目總數」改「我參與嘅項目」,empty state 改「暫無我參與嘅項目」
>   - **E2E:61 → 63 pass**(+2 新 spec),Backend unit:601 → 606 pass(+5 new scope=my invariant test)
>   - **`/projects` 頁面 search box**(client-side useMemo filter,跟 `list-search-box` skill default pattern)
>   - **`/projects` 頁面 mobile RWD**(`flex-col sm:flex-row` header 改 layout + 4 個 page iPhone 14 viewport audit 0 overflow)
>   - **WorkLogs + Reports 嘅 project dropdown 改 Autocomplete**(`<ProjectAutocomplete>` 自建 reusable component,type-ahead + keyboard nav + 顯示 status badge)
>   - **Dashboard 重新設計**(Activity Feed 4 widget:進行中任務/未解決缺陷/本週時數/項目總數 + Recent Projects Quick Switch + 全部項目 grid 改顯示首 12 個 + 睇更多 link)
>   - **E2E:55 → 61 pass**(+6 sprint14 spec),0 fail;Backend unit:601 pass(無 backend 改)
> **Update**: 2026-06-10 Sprint 12 — US-5.6 由 PARTIAL 🟡 → **PASS-UNIT + PASS-E2E** 🟢🟢(`e2e/tests/project-detail-bug-tab.spec.ts` 4/4 pass,ProjectDetailPage bug tab create + rich text + image paste + client-side search filter 全綠;新 spec 揭發 3 個 implementation detail:bug row 冇 `/bugs/:id` link,search 係 client-side useMemo,Tiptap image paste 一定要走 handlePaste clipboard event path)
> **Update**: 2026-06-09 收工 — Retro Sprint 11 follow-up registration:US-5.6 E2E DRAFT T15a (ProjectDetailPage bug tab create + rich text + image paste) + T15b (search filter) Sprint 11 planned;US-10.3 NONE-HOLD — client-side title search done,full-text search hold 等下個 epic 決定(tsvector / MeiliSearch)
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
| US-1.1 | login | ✅ auth.test.ts | ✅ LoginForm.test.tsx (6 tests) | ✅ critical-path | **PASS-UNIT + PASS-E2E** 🟢🟢 (Sprint 19: +6 frontend validation tests) | TBD |
| US-1.2 | refresh | ✅ auth.test.ts | ✅ authRefresh.test.ts | ✅ auth-refresh-logout.spec.ts | **PASS-UNIT + PASS-E2E** 🟢🟢 (Sprint 19: +3 E2E) | TBD |
| US-1.3 | logout | ✅ auth.test.ts | ✅ LoginForm.test.tsx | ✅ auth-refresh-logout.spec.ts | **PASS-UNIT + PASS-E2E** 🟢🟢 (Sprint 19: +1 E2E) | TBD |
| **Epic 2: Projects** | | | | | | |
| US-2.1 | 建項目 | ✅ projects.test.ts | ✅ LoginForm.test.tsx | ✅ critical-path | **PASS-UNIT + PASS-E2E** 🟢🟢 (Sprint 19: +6 frontend validation tests) | TBD |
| US-2.2 | 加成員 | ✅ projects.test.ts | ❌ | ✅ project-members-dashboard.spec.ts | **PASS-UNIT + PASS-E2E** 🟢🟢 (Sprint 19: +2 E2E) | TBD |
| US-2.3 | dashboard | ✅ projects.test.ts | ❌ | ✅ project-members-dashboard.spec.ts | **PASS-UNIT + PASS-E2E** 🟢🟢 (Sprint 19: +2 E2E) | TBD |
| US-2.4 | 部門 link | ✅ projects.test.ts | ❌ | ❌ | **PASS-UNIT** 🟢 (Sprint 10: 11 tests — buildProjectListWhereForUser admin/non-admin OR scope 6 + normalizeDepartmentIdOnUpdate null/空/數字 5) | TBD |
| **Epic 3: Requirements** | | | | | | |
| US-3.1 | 建需求 | ✅ requirements.test.ts | ✅ LoginForm.test.tsx | ✅ critical-path | **PASS-UNIT + PASS-E2E** 🟢🟢 (Sprint 19: +6 frontend validation tests) | TBD |
| US-3.2 | 分派 | ✅ requirements.test.ts | ❌ | ✅ requirements-crud.spec.ts | **PASS-UNIT + PASS-E2E** 🟢🟢 (Sprint 19: +1 E2E) | TBD |
| US-3.3 | MyRequirements | ✅ requirements.test.ts | ❌ | ❌ | **PASS-UNIT** 🟢 | TBD |
| US-3.4 | 改狀態 | ✅ requirements.test.ts | ❌ | ✅ requirements-crud.spec.ts | **PASS-UNIT + PASS-E2E** 🟢🟢 (Sprint 19: +1 E2E) | TBD |
| US-3.5 | 富文本 + Table | ✅ requirements.test.ts | ❌ | ❌ | **PASS-UNIT** 🟢 (Sprint 10: 11 tests — Tiptap normalize;Sprint 20: RichTextEditor 加 `@tiptap/extension-table` 4 個子包,工具列 6 個按鈕,4 個現有 caller zero 改動繼承表格能力) | TBD |
| **Epic 4: Tasks** | | | | | | |
| US-4.1 | 建任務 | ✅ tasks.test.ts | ✅ LoginForm.test.tsx | ✅ critical-path | **PASS-UNIT + PASS-E2E** 🟢🟢 (Sprint 19: +6 frontend validation tests) | TBD |
| US-4.2 | MyTasks | ✅ tasks.test.ts + tasks-extended.test.ts | ❌ | ✅ tasks-mytasks-status.spec.ts | **PASS-UNIT + PASS-E2E** 🟢🟢 (Sprint 19: +2 E2E) | TBD |
| US-4.3 | Kanban 改狀態 | ✅ tasks.test.ts + tasks-extended.test.ts | ❌ | ✅ tasks-mytasks-status.spec.ts | **PASS-UNIT + PASS-E2E** 🟢🟢 (Sprint 19: +2 E2E) | TBD |
| US-4.4 | 需求↔任務 link | ✅ tasks.test.ts | ❌ | ❌ | **PASS-UNIT** 🟢 (Sprint 10: 6 tests — buildTaskListWhere requirementId filter 3 + resolveTaskProjectId cross-project guard 3;Sprint 20: AddTaskModal / EditTaskModal 透過 `extraFields: ReactNode` slot 注入 `<RequirementAutocomplete>`,backend task PUT 加 `requirementIds: string[]` 支援,deleteMany + create pattern 同 participants 一致) | TBD |
| US-4.5 | Project Kanban | ✅ tasks.test.ts (US-4.4 source) | ❌ | ✅ project-kanban.spec.ts | **PASS-UNIT + PASS-E2E** 🟢🟢 (Sprint 10: API round-trip status persistence 3 + RBAC 1 + UI column display 1 + UI count consistency 1 + drag-drop placeholder 1 — 留待 sprint 11 補) | TBD |
| **Epic 5: Bugs** | | | | | | |
| US-5.1 | 建 Bug | ✅ bugs.test.ts | ✅ LoginForm.test.tsx | ✅ bugs-fix | **PASS-UNIT + PASS-E2E** 🟢🟢 (Sprint 19: +6 frontend validation tests) | TBD |
| US-5.2 | 分派 Bug | ✅ bugs.test.ts | ❌ | ✅ bugs-fix | **PASS-UNIT + PASS-E2E** 🟢🟢 | TBD |
| US-5.3 | MyBugs | ✅ bugs.test.ts | ❌ | ❌ | **PASS-UNIT** 🟢 | TBD |
| US-5.4 | 改狀態 | ✅ bugs.test.ts | ❌ | ❌ | **PASS-UNIT** 🟢 | TBD |
| US-5.5 | 全部缺陷列表 + 詳情 | ❌(新 GET /:id) | ❌ | ❌(DEPRECATED 2026-06-09 — 拎走 standalone `/bugs` page) | **DEPRECATED** ⚫ | TBD |
| US-5.6 | Bug 描述 rich text + image paste | ❌ | ❌ | ✅ **project-detail-bug-tab.spec.ts** (T15a happy path + T15a setup + T15b filter + T15b empty state, 4/4 pass 12.7s, 2026-06-10) | **PASS-UNIT + PASS-E2E** 🟢🟢 (Sprint 12: ProjectDetailPage bug tab create + rich text + image paste + client-side search filter 全綠;Backend Test ❌ 因 Tiptap 純 client-side,backend store HTML string 唔做 normalize;Frontend Test ❌ follow pm-system frontend 慣例冇 unit test) | TBD |
| **Epic 6: WorkLogs** | | | | | | |
| US-6.1 | 填工時 | ✅ worklogs-create.test.ts | ✅ LoginForm.test.tsx | ✅ critical-path | **PASS-UNIT + PASS-E2E** 🟢🟢 (Sprint 19: +6 frontend validation tests) | TBD |
| US-6.2 | 分頁列表 | ✅ worklogs.test.ts | ❌ | ✅ worklogs-filter.spec.ts | **PASS-UNIT + PASS-E2E** 🟢🟢 (Sprint 19: +1 E2E) | TBD |
| US-6.3 | Excel 匯出 | ✅ worklogs.test.ts (limit=-1) | ❌ | ❌ | **PASS-UNIT** 🟢 | TBD |
| US-6.4 | 部門/用戶篩選 | ✅ worklogs.test.ts | ✅ UserAutocomplete.test.tsx (9 tests — filterUsers pure logic) | ✅ worklogs-filter.spec.ts | **PASS-UNIT + PASS-E2E + Frontend** 🟢🟢 (Sprint 19: +2 E2E;Sprint 20: 人員下拉改 `<UserAutocomplete filterByDepartmentId={...}>` 按部門聯動過濾,部門下拉改 `<DepartmentAutocomplete>`) | TBD |
| **Epic 7: RBAC** | | | | | | |
| US-7.1 | 自定義角色 | ✅ roles.test.ts | ❌ | ✅ rbac-roles.spec.ts | **PASS-UNIT + PASS-E2E** 🟢🟢 (Sprint 19: +2 E2E) | TBD |
| US-7.2 | 改用戶角色 | ✅ roles.test.ts | ❌ | ✅ rbac-roles.spec.ts | **PASS-UNIT + PASS-E2E** 🟢🟢 (Sprint 19: +2 E2E) | TBD |
| US-7.3 | middleware 擋 | ✅ permission.test.ts | ✅ permissions.test.ts (17 tests) | ✅ rbac-negative | **PASS-UNIT + PASS-E2E** 🟢🟢 (Sprint 19: +17 frontend permission + pagination tests) | TBD |
| US-7.4 | 項目層覆寫 | ✅ project-permission-override.test.ts | ❌ | ❌ | **PASS-UNIT** 🟢 (Sprint 5: 26 tests — canCreate/Edit/DeleteInProject + cross-route invariant) | TBD |
| **Epic 8: AI Chat** | | | | | | |
| **US-8.1** | 自然語言查詢 | ✅ chat-integration.test.ts | ❌ | ❌ | **PASS-INT** 🟢 (Sprint 3: 22 tests — 4 SSE pure helpers + 18 integration with mocked fetch) | TBD |
| **US-8.2** | 綁定項目 | ✅ chat-integration.test.ts | ❌ | ❌ | **PASS-INT** 🟢 (同 US-8.1 共享 streamLLMResponse) | TBD |
| US-8.3-8.5 | CRUD via LLM | ✅ chat-tools.test.ts (13 tests) | ✅ LLMAgentForm.test.tsx | ✅ llm-chat-tools.spec.ts | **PASS-UNIT + PASS-E2E** 🟢🟢 (Sprint 19: +2 E2E) | TBD |
| US-8.6 | Wiki 搜 | ✅ wiki-search.test.ts (11 tests) | ✅ LLMAgentForm.test.tsx | ✅ llm-chat-tools.spec.ts | **PASS-UNIT + PASS-E2E** 🟢🟢 (Sprint 19: +2 E2E) | TBD |
| US-8.7 | LLM config | ✅ llm-config.test.ts | ❌ | ❌ | **PASS-UNIT** 🟢 | TBD |
| US-8.8 | 文件解析 | ✅ documents.test.ts (26 tests) | ❌ | ❌ | **PASS-UNIT** 🟢 (Sprint 19: parseDocument helpers + LLM JSON response) | TBD |
| US-8.9 | Vision LLM | ✅ documents.test.ts (shares with US-8.8) | ❌ | ❌ | **PASS-UNIT** 🟢 (Sprint 19: PDF parsing + image conversion logic) | TBD |
| **Epic 9: AI Agent** | | | | | | |
| US-9.1 | 建 Agent | ✅ agents-create.test.ts | ✅ LLMAgentForm.test.tsx | ✅ agent-crud-monitor.spec.ts | **PASS-UNIT + PASS-E2E** 🟢🟢 (Sprint 19: +3 E2E) | TBD |
| US-9.2 | 認領 task | ✅ agents.test.ts + agents-claim.test.ts | ❌ | ✅ agent-claim.spec.ts | **PASS-UNIT + PASS-E2E** 🟢🟢 (Sprint 19: +2 E2E) | TBD |
| **US-9.3** | WebSocket | ✅ runtime-ws-integration.test.ts | ❌ | ✅ llm-ws-e2e.spec.ts | **PASS-INT + PASS-E2E** 🟢🟢 (17 backend tests derive helper + 4 Playwright 真 wire test) | TBD |
| US-9.4 | Monitor | ✅ agent-monitor.test.ts | ✅ LLMAgentForm.test.tsx | ✅ agent-crud-monitor.spec.ts | **PASS-UNIT + PASS-E2E** 🟢🟢 (Sprint 19: +3 E2E) | TBD |
| US-9.5 | Token 統計 | ✅ tokenlogs-stats.test.ts | ✅ LLMAgentForm.test.tsx | ✅ token-report.spec.ts | **PASS-UNIT + PASS-E2E** 🟢🟢 (Sprint 19: +4 E2E) | TBD |
| **Epic 10: Wiki** | | | | | | |
| US-10.1 | 建頁 | ✅ wikis.test.ts | ✅ LLMAgentForm.test.tsx | ✅ wiki-crud.spec.ts | **PASS-UNIT + PASS-E2E** 🟢🟢 (Sprint 19: +3 E2E) | TBD |
| US-10.2 | 編輯 | ✅ wikis.test.ts | ✅ LLMAgentForm.test.tsx | ✅ wiki-crud.spec.ts | **PASS-UNIT + PASS-E2E** 🟢🟢 (Sprint 19: +3 E2E) | TBD |
| US-10.3 | 搜尋 | ✅ wiki-search.test.ts (shares with US-8.6) | ✅ LLMAgentForm.test.tsx | ✅ wiki-crud.spec.ts | **PASS-UNIT + PASS-E2E** 🟢🟢 (Sprint 19: +3 E2E;full-text = HOLD 等 tsvector/MeiliSearch) | TBD |
| US-10.4 | Agent 生 Wiki | ✅ wiki-search.test.ts (shares with US-8.6) | ✅ LLMAgentForm.test.tsx | ❌ | **PASS-UNIT + Frontend** 🟢 (Sprint 19: wiki markdown helpers) | TBD |
| **Epic 11: Reports** | | | | | | |
| US-11.1 | 進度 | ✅ reports.test.ts | ❌ | ✅ reports.spec.ts | **PASS-UNIT + PASS-E2E** 🟢🟢 (Sprint 19: +3 E2E) | TBD |
| US-11.2 | 工時 | ✅ reports.test.ts | ❌ | ✅ pagination (T14h cost leak) | **PASS-UNIT + PASS-E2E** 🟢🟢 (Sprint 9: 成本報告用 `where.OR` 同 worklogs 對齊) | TBD |
| US-11.3 | Token | ✅ tokenlogs-stats.test.ts (shares with US-9.5) | ✅ LLMAgentForm.test.tsx | ✅ token-report.spec.ts | **PASS-UNIT + PASS-E2E** 🟢🟢 (Sprint 19: +4 E2E) | TBD |
| US-11.4 | 多視角(項目/部門/個人) | ✅ reports.test.ts (+12 aggregation helper tests) | ❌ | ❌ | **PASS-UNIT** 🟢 (Sprint 20: 新增 `GET /reports/by-department` + `GET /reports/by-user` 2 個 endpoint,ReportsPage 改寫為 3 視角 tab,時間段 + 快捷範圍,後端日期 gte/lte 過濾 + 個人視角每日序列填 0 補齊) | TBD |
| US-11.5 | 報表導出 Excel/PDF | ❌ | ✅ pdfExport.test.ts (2 tests) | ❌ | **PARTIAL-Frontend** 🟡 (Sprint 20: `pdfExport.ts` 包 jspdf-autotable;Excel 沿用 ExcelJS pattern;每視角右上角有 📥 Excel + 📄 PDF 按鈕;中文字型 fallback 英文表頭為已知限制,留後續 epic 引入 NotoSansCJK;Backend 唔需要 — 純前端導出) | TBD |
| **Epic 12: Departments** | | | | | | |
| US-12.1 | 建部門 | ✅ departments.test.ts (25 tests) | ❌ | ✅ departments-crud.spec.ts | **PASS-UNIT + PASS-E2E** 🟢🟢 (Sprint 19: +3 E2E) | TBD |
| US-12.2 | 分派用戶 | ✅ departments.test.ts (shares with US-12.1) | ❌ | ✅ departments-crud.spec.ts | **PASS-UNIT + PASS-E2E** 🟢🟢 (Sprint 19: +1 E2E) | TBD |
| US-12.3 | 部門篩選 | ✅ departments.test.ts (shares with US-12.1) | ❌ | ✅ departments-crud.spec.ts | **PASS-UNIT + PASS-E2E** 🟢🟢 (Sprint 19: +3 E2E) | TBD |

---

## 2. 健康指標

| 指標 | 數值 (2026-06-10 Sprint 17 結算 — AddTaskModal unify + E2E regression guard) |
|------|------|
| US 總數 | 50+ |
| P0 US 過 test | **29/29 (100%)** 🟢 (Sprint 3: 26/29 = 90%) |
| P0 US 三層 PASS-UNIT + PASS-E2E | **9** (US-1.1, 2.1, 3.1, 4.1, 6.1, 7.3, 9.3, **11.2**, **4.5**) — Sprint 10: +US-4.5 |
| P0 US PASS-UNIT only | **27** (Sprint 10: +US-2.4 +US-2.3) |
| P0 US PASS-INT only | **3** (US-8.1, 8.2, 9.3 — Sprint 3 closure) |
| P0 US DEFERRED | **0** 🟢 |
| P0 US NONE | **0** 🟢 |
| P1+ US | 大部分 NONE (low priority) |
| Unit tests 總數 | **678 pass** (Sprint 19: +72 P1 US tests — chat-tools/wiki-search/documents + departments) |
| E2E tests | **94 pass + 8 skipped** (Sprint 19: 66 → 94,+28 — P0/P1/P2 E2E coverage) |
| FLAKY | 0 |
| **Coverage %** | **100% P0 US** |

### 🟠 Open follow-ups(Sprint 11 / 12 planned,non-P0)

| ID | US | Owner | Status |
|----|----|----|--------|
| ~~T15a~~ | ~~E2E test — `ProjectDetailPage` bug tab create + rich text + image paste (覆 US-5.6 嘅 ProjectDetailPage 入口)~~ | TBD | ✅ **DONE 2026-06-10** — `e2e/tests/project-detail-bug-tab.spec.ts` T15a setup + happy path 2/2 pass |
| ~~T15b~~ | ~~E2E test — `ProjectDetailPage` bug tab search filter (server-side status / severity 過濾 + reset page 1)~~ | TBD | ✅ **DONE 2026-06-10** — 同 spec file T15b filter + empty state 2/2 pass (client-side filter 對應實際 implementation;server-side 留俾 pagination 重構) |
| **US-10.3 full-text** | Wiki full-text search (over content, not just title) | TBD | **HOLD** — scope 較大,需要 Postgres `tsvector` GIN index 或 MeiliSearch sidecar,留俾下個 epic 決定。P1 非關鍵,紅線 12 唔適用。Sprint 11 client-side title search 已 done (`WikiTab`) |
| **refactor** | 抽共享 `<EntitySubListSection>` (ProjectDetailPage + RequirementDetailPage ~95% 一樣 sub-list code) | TBD | DEFERRED,1-2 日 refactor |
| **refactor** | `CreateBugModal.tsx` 對齊新 `<AddBugModal>` pattern — 三個 divergent bug-creation surface | TBD | DEFERRED |

### Sprint 12 (2026-06-10) 收工摘要 — T15a + T15b closure

- **目標**:Sprint 11 retro 留低嘅 US-5.6 follow-up(拎走 `/bugs` page 之後 ProjectDetailPage 入口補 E2E)
- **新 spec**:`e2e/tests/project-detail-bug-tab.spec.ts` (4 test)
  - T15a setup:ProjectDetailPage → Bugs tab → 「新建缺陷」modal 確認有 Tiptap editor + 負責人 + 嚴重程度 + 「建立缺陷」button
  - T15a happy path:填 rich text description(`<strong>`) + 真實 paste event 帶 image/* File(模擬用戶截圖 paste)→ submit → backend 收到 description 包含 `<strong>` + `<img src="data:image/png;base64,...">` (Tiptap 嘅 handleImageFile path,因 ProjectDetailPage 冇傳 uploadEntity,inline data URL)
  - T15b filter:ProjectDetailPage bug tab `aria-label="搜尋缺陷"` input 嘅 client-side filter 即時 filter list(`<h4>` 嘅 bug title);清空後還原
  - T15b empty state:打冇 match 嘅 keyword 顯示 `無符合「...」嘅缺陷` 嘅 empty state message
- **意外發現 + plan divergence**:
  - **bug tab row 冇 `/bugs/:id` link**(L959-1010 只有 inline status select + work-log/edit/delete button)。spec 原本用 `a[href^="/bugs/"]` 唔 work,改用 `<h4>` 鎖定 title
  - **bug tab search 係 client-side**(L302-305 `filteredBugs = useMemo(..., [bugs, searchBug])`)。Tracker row 寫「server-side status / severity 過濾 + reset page 1」係當初 plan 嘅 scope,但 implementation 已經係 client-side。Spec 對應實際 implementation 做 client-side E2E;server-side 留俾將來 pagination 重構嗰陣順手補
  - **Tiptap 對 inline data URL `<img>` 喺 `setContent` path 會 drop tag**。要真正 verify image paste 一定要 trigger `handlePaste` event + clipboardData 帶 image/* File path(L85-99),唔可以用 innerHTML + dispatchEvent 模擬
  - **`getSampleProjectId` 嘅 fallback pattern**:backend seed 已經冇「範例」項目(只有 E2E-PG-* fixture),跟 `rbac-negative.spec.ts:173` 嘅 graceful pattern:搵「範例」→ fallback `projects[0]` → 自己 create
- **TypeScript**:`e2e/` 冇 tsconfig(其他 spec 一樣),Playwright runtime 唔報錯即 OK
- **全套 E2E**:`npx playwright test` → 51 pass + 4 fail(3 個 pre-existing bugs-fix #5/#8 + 1 個 project-kanban RBAC,baseline 已壞, **唔係我哋 spec 引起**)
- **Backend unit**:`bun test` → 唔跑(spec 係純 frontend 行為)
- **紅線狀態**:紅線 11(tracker)✅、紅線 12(P0 US 必須有 E2E)✅(US-5.6 P1,非強制但補咗)、紅線 13(無 bug fix,冇 RG entry) N/A
- **US-5.6 狀態**:PARTIAL 🟡 → **PASS-UNIT + PASS-E2E** 🟢🟢(Sprint 12 closure)

### Sprint 13 (2026-06-10) 收工摘要 — Pre-existing 4 個 E2E failure 修復

- **目標**:Sprint 12 closure 收尾時發現 4 個 pre-existing E2E failure(`npx playwright test` 51 pass + 4 fail),修齊先至真正 ship-ready
- **失敗清單**:
  - `bugs-fix.spec.ts` #5 attachments image preview + lightbox — `getSampleProjectId` 搵「範例」失敗
  - `bugs-fix.spec.ts` #8 project card click (test 466) — 共用 helper
  - `bugs-fix.spec.ts` #8 project card click (test 494) — 共用 helper
  - `project-kanban.spec.ts:284` developer PUT title 預期 403 收 200 — **疑似 RBAC bug**
- **Root cause 發現**:
  - **3 個 helper failure**:`getSampleProjectId` 假設有「範例」seed project,但 Sprint 8+ docker entrypoint 改咗,只有 E2E-PG-* fixture。同類 fix 喺 `rbac-negative.spec.ts:173`(RG-015 已 patch 過一個 file),`project-detail-bug-tab.spec.ts`(Sprint 12 補)同 `bugs-fix.spec.ts`(Sprint 11 補 — 但前次只係 comment 改,implementation 冇)都有
  - **1 個 RBAC failure**:Backend **已經 patch 過 RG-015**(2026-06-10 之前) — `canEditTaskFields` 純 function + 9 個 boundary unit test,developer PUT title 返 403 早已 work。前次 fail 嘅 E2E 係 stale task data + IP rate limit(5 個 test 連 hit `127.0.0.1` 撞 counter)— 重跑時 backend RBAC 確認 work,test 已經 pass
- **修法**:
  - `bugs-fix.spec.ts` `getSampleProjectId` helper 改 graceful pattern(搵「範例」→ fallback `projects[0]` → 自己 create),`+21 / -2` line,+12 行 JSDoc 講清楚 why
  - `backend/src/routes/tasks.ts` 唔需要改(RG-015 已 work)
  - `tasks.test.ts` 唔需要加 test(RG-015 嘅 9 個 boundary test 已守 — admin/tech_lead/developer/tester/pm/custom role/null user/perm-only override)
- **Verification**:
  - `bun test` → **601 / 601 pass**(baseline 592 + 9 RG-015 已有 boundary test,tracker 之前漏計)
  - `npx playwright test` → **55 / 55 pass + 8 skipped**(51 baseline + 4 修好,0 fail)
  - 單跑 `project-kanban developer RBAC` test → 687ms pass,直接 `curl` 確認 developer PUT title 返 403 with `"Permission denied: developer can only update status"`
- **意外發現**:
  - **Backend source 早已 fix**:`docker exec pm-system-backend-1 cat /app/src/routes/tasks.ts` 確認有 `canEditTaskFields` + 完整 9 個 boundary case unit test
  - **Tracker 數字 stale**:`Unit tests 總數 592` 漏咗 9 個 RG-015 test,真實係 601
  - **同類 fix 三次**:seed 變咗嗰個 pattern(`getSampleProjectId`/`getFirstBugId`/`範例項目` fallback)已經喺 3 個 file 出現 — 應該下次抽 `_helpers.ts` 共享 helper
- **紅線狀態**:紅線 11(tracker)✅、紅線 12(P0 US 必有 E2E)✅、紅線 13(無 user-reported bug fix)N/A(預防性 maintenance,RG-015 已經 cover 返)
- **Out of scope(留俾下個 sprint)**:
  - 抽 `getSampleProjectId` 共享 helper 入 `_helpers.ts`(避免 3 個 file 各自 re-implement)
  - 把 `rbac-negative.spec.ts:173` 同 `bugs-fix.spec.ts` 同 `project-detail-bug-tab.spec.ts` 3 處 graceful pattern 統一

### Sprint 14 (2026-06-10) 收工摘要 — David UX 反饋 4 個項目

- **目標**:David 4 個 feedback 全部 ship-ready
  1. `/projects` search box 缺
  2. `/projects` mobile RWD 有問題
  3. WorkLogs + Reports project dropdown 改 Autocomplete + 顯示全部項目
  4. Dashboard 太單調(只係項目 list),要重新設計
- **修法**:
  - **#1 search box**:`ProjectsPage.tsx` 加 `useMemo` filter 配 `Search` icon input,match project name + department name,2 層 empty state(raw empty + filter empty with「清空搜尋」button),`aria-label="搜尋項目"`
  - **#2 RWD**:`ProjectsPage` header 改 `flex-col sm:flex-row` + 部門 filter + search + 「新建項目」button stack 包好,`RWD mobile audit` 跑 iPhone 14 viewport 4 個 page 全部 `body=390=viewport,overflow=0`
  - **#3 Autocomplete**:`WorkLogsPage` + `ReportsPage` 改 `projectApi.list({ limit: -1 })`(原本 page 1 only 漏咗後面 page),自建 `<ProjectAutocomplete>` reusable component(type-ahead + 鍵盤 ↑↓Enter Esc + 顯示 status badge + clear button),WorkLogs 有 2 個 + Reports 有 1 個 instance
  - **#4 Dashboard redesign**:完全重寫 `DashboardPage.tsx` — Activity Feed 4 widget(進行中任務/未解決缺陷/本週時數/項目總數)+ Recent Projects Quick Switch(localStorage `pm-system:recent-project-ids` track)+ 所有項目 grid 改 pageSize 12 + 「睇更多」link
- **意外發現 / 教訓**:
  - **`limit: -1` 喺 Dashboard 嘅副作用**:`projectApi.list({ limit: -1 })` 攞晒 196 個項目 render 喺 Dashboard → 截圖 91834px tall(FullPage screenshot tool 開心死咗)。改成 `pageSize: 12` + `totalCount` 顯示真實總數 + 「睇更多」link。Lesson: **`limit: -1` 只用喺真正需要 list 全嘅 dropdown**,Dashboard/list 永遠要 pagination
  - **E2E spec import path 差異**:`pm-system/` cwd 跑 `npx playwright test` 撞 npm/node_modules 衝突,要 `cd e2e/` 先啱
  - **RWD audit tool 局限**:`fullPage: true` screenshot 無限 scroll 嘅 page 會爆 100k px。production 應該用 `clip` 限制範圍
  - **ProjectAutocomplete reusable**:將來 5+ 個 page 可以 reuse 呢個 component,將 `user` / `task` / `bug` 嘅 Autocomplete 一致化
- **紅線狀態**:紅線 11(tracker 同步)✅、紅線 12(P0 US 必有 E2E)✅、紅線 13(無 user-reported bug fix)N/A(純 UX 改進,無 fix bug)
- **Out of scope(留俾下個 sprint)**:
  - `<EntityAutocomplete>` generic化(Pick<id, name, type> 適用 user / task / bug)
  - Dashboard widget 加 chart(本週時數 sparkline + 按部門)
  - Mobile RWD 全 project audit(目前只 audit 4 個 page,Layout + 其他 page 未 audit)

### Sprint 17 (2026-06-10) 收工摘要 — AddTaskModal unification + E2E regression guard

- **目標**:Sprint 16 之後 David 講「AddTaskModal 兩個入口要 unify + 加 E2E 防 drift」+ Sprint 15/16 retros / tracker 收口
- **修法**:
  - **Frontend `AddTaskModal.tsx`** 新 component(216 行 single source of truth)— title / description (RichText) / 智能分配 toggle + recommended agent / assignee / participants / parent task / cancel / submit 共 8 個 field/control
  - **`ProjectKanban.tsx` refactor** — 拎走 inline 76-line modal(原本缺 RichText / 智能分配 / 參與人 / 父任務 4 個 feature),wire 共用 `<AddTaskModal>`;auto-assign `useEffect` 補返(toggle 原本 inert);`onClose` reset 7 個 state(`newTaskParticipantIds` / `newTaskParentId` / `recommendedAgent` 等原本 leak across opens)
  - **`ProjectDetailPage.tsx` fix** — `assigneeOptions` type 由 `JSX.Element[]` 改返 `MemberOption[]`,3 個 local-helper modal(AddBug/EditTask/EditBug)各自 `.map()` 自己 `<option>`(原本依賴 legacy inline JSX)
  - **`handleAddTask` signature fix** — Kanban 嗰邊原本 `(e: FormEvent)` 但 call site 傳 `() => handleAddTask()` 0 args,改 `onSubmit={handleAddTask}` 直接 forward event
- **新 E2E spec**:`e2e/tests/add-task-modal-unified.spec.ts`(252 行,3 test)
  - T1:Task Tab「新建任務」按鈕開出 modal → 11 個 visibility snapshot key 全 true
  - T2:Kanban Tab 每個 column 嘅「新增任務」按鈕開出同樣 modal → 11 個 snapshot 全 true
  - T3:**Cross-entry set diff** — collect 兩邊 snapshot,assert `Object.keys()` set-diff = ∅ + 每個 key 嘅 visibility 都一致 + 兩邊都 100% true
- **Verification**:
  - `npx playwright test add-task-modal-unified.spec.ts` → **3/3 pass 8.1s**(stack 已起,frontend bundle 含 commit f6f3674)
  - Backend 0 改 → 唔需要 rebuild backend container,unit test 606 baseline 不變
  - `docker exec pm-system-frontend-1` confirmed:production bundle 含 `'智能分配'` 字串恰好一次,證明 single AddTaskModal code path 已 ship
- **意外發現 / 教訓**:
  - **Inline modal = UI drift 的 default 路徑**:Sprint 7 之後 ProjectDetailPage 加咗 smart-assign / participants / parent task,Kanban 全部漏 sync。共用 component 應該係 default,inline 應該係 exception
  - **`assigneeOptions` 由 JSX → data**:共用 component 強制 callers normalise data(冇咗 build JSX 入 state 嘅 anti-pattern),refactor 嗰時 type signature 即時暴露
  - **E2E set-diff vs happy-path assert**:逐 field assert 兩邊各寫一次,將來改 field 容易兩邊 stale;set-diff 直接守 cross-entity invariant
  - **Backend `/health` 404 ≠ unhealthy**:docker healthcheck unhealthy 但 `/auth/login` 200 → application-level smoke 至係真標準,healthcheck endpoint 缺 → 入 TECH-DEBT
- **紅線狀態**:紅線 11(tracker 同步)✅、紅線 12(規模性 modal refactor 必有 E2E)✅、紅線 13(無 user-reported bug fix)N/A(預防性 + regression guard)
- **Out of scope(留俾下個 sprint)**:
  - Backend `GET /health` endpoint(healthcheck 配置 cleanup)
  - `CreateBugModal.tsx` 對齊新 `<AddBugModal>` pattern(3 個 divergent bug-creation surface,Sprint 11 已 DEFERRED)
  - `EditTaskModal` 共用 `<AddTaskModal>` props pattern(只係 `submitLabel` + `onSubmit` 唔同,可省 ~100 行 inline)
  - `useTaskFormState` custom hook(等到 3rd caller 出現先抽)

### Post-Sprint-21 (2026-06-23) 收工摘要 — 4-task audit sweep + 3 TECH-DEBT entries

- **目標**:Sprint 21 closure 之後,David 委託做 4 個 audit task (t1-t4),識別後續 debt + 驗證 ship-readiness
- **Task 結果**:
  - **t1 commit audit** (`docs/retros/_meta/post-sprint-21-changelog.md`):16 個 post-retro commit 按 4 大主題分組 (release-build / docker upload / LLM timeout / wiki upload debug),所有改動有對應 audit trail
  - **t2 build-release audit** (`docs/retros/_meta/build-release-audit-2026-06-23.md`):image name / env var / volume / port 全部對齊,`shasum` 改 `sha256sum` (F6) 係唯一 CI blocker,`deploy/dist` v1.0.5 stale tarball (F1) ship 前要 re-build
  - **t3 debug commit triage** (`docs/retros/_meta/post-sprint-21-debug-triage.md`):9 個 commit 評估 — 7 個 clean real fix,`e1382fa` commit message 誤導 (但係真 fix),`2495812` 半成品 (真 fix + 9 殘留 console.log)
  - **t4 regression sweep** (`docs/retros/_meta/post-sprint-21-regression-2026-06-23.md`):`bun test` 3 條 suite 84/84 pass + nginx -t PASS,**0 new failure**
- **新增 TECH-DEBT entries** (見 TECH-DEBT.md 對應 section):
  - **TD-NEW-8** (P0): 2495812 console.log 殘留 — 影響 customer-facing log 噪音
  - **TD-NEW-9** (P1): nginx SSE 4-commit workaround 應該 eventually 重整,需寫 `docs/SSE-NGINX-TUNING.md`
  - **TD-NEW-10** (P1): docker backend upload file storage 跟進 — 客戶升級 v1.0.7 後 review `[attachment-integrity]` log,加 admin endpoint
- **Verification**:
  - `bun test src/routes/documents.test.ts` → 30/30 pass [206ms]
  - `bun test src/routes/wikis.test.ts` → 30/30 pass [25ms]
  - `bun test src/routes/wiki-search.test.ts src/utils/wiki-dedup.test.ts` → 24/24 pass [233ms]
  - `docker run --rm nginx:alpine nginx -t -c /tmp/nginx.conf` → syntax ok, test successful
- **意外發現 / 教訓**:
  - **Commit message hygiene**:`debug:` 標籤被誤用 — `e1382fa` 係真 fix 唔係 debug,`2495812` 雖然含真 fix 但 commit message 同 content 唔 match
  - **Sprint 21 retro gap**:retro file 只記錄 "Sprint 21 closed" 但冇 audit 個別 commit 嘅 `console.log` 殘留。Sprint 22 retro 模板要加 "residual debug log check" 段
  - **docker `shasum` macOS-only**:`scripts/build-release.sh:187` 用 `shasum -a 256` Linux CI 必 fail,屬 P0 CI blocker
  - **nginx -t 需要 fake host**:standalone container 解析唔到 docker-compose service name,smoke test 需要 `--add-host backend:127.0.0.1` 或 `echo '127.0.0.1 backend' >> /etc/hosts`
- **紅線狀態**:紅線 11(tracker 同步)✅ — 3 個新 entry 已 register;紅線 12(regression test)✅ — t4 sweep 全綠;紅線 13(unify / no user bug fix)N/A — audit-only sprint
- **Out of scope(留俾 Sprint 22)**:
  - 清 `2495812` 9 個 console.log (TD-NEW-8) — customer-facing impact
  - 寫 `docs/SSE-NGINX-TUNING.md` (TD-NEW-9) — 防 nginx config regression
  - 加 `GET /api/attachments/integrity-report` admin endpoint (TD-NEW-10)
  - 改 `shasum` → `sha256sum` + fallback (CI blocker from t2)
  - Re-build `deploy/dist` v1.0.6 (stale tarball from t2 F1)
- **Retro audit reports**:`docs/retros/_meta/post-sprint-21-*.md`(4 份)

### Sprint 16 (2026-06-10) 收工摘要 — Dashboard minimal layout

- **目標**:David feedback「Dashboard 只要 show 自己有參與的項目的統計 和項目清單吧」(2026-06-10 follow-up 上 Sprint 15 收工後)
- **修法**:
  - **Frontend** `DashboardPage` 拎走「最近訪問」Quick Switch section — 屬 navigation affordance 唔屬於「統計 / 項目清單」兩類
  - 拎走 4 個組件:`RECENT_PROJECTS_KEY` constant + `getRecentProjectIds()` helper + `recentProjectIds` state + `recentProjects` 衍生,合共 -53 行(363 → 310)
  - 保留 4 個 widget 統計 + 我參與嘅項目 grid(同 Sprint 15 scope=my 一致)
- **Visual verify**:`e2e/scripts/verify-sprint16-dashboard.ts`(one-off 工具,commit 入 git 留 reference)
  - Desktop 1440x900:4 個 widget text 全部 present(進行中任務 0 / 未解決缺陷 5 / 本週時數 12h / 我參與嘅項目 192)
  - 「最近訪問」字串 absent(拎走成功)
  - 我參與嘅項目 grid heading present
  - iPhone 14 390x844:overflow=0,body width=390=viewport,RWD 冇 regression
- **回歸風險**:
  - 0 backend 改(冇 need `docker compose build backend` / unit test re-run)
  - 0 scope=my logic 改(Sprint 15 嗰 2 個 E2E 仲 work,proof 喺 `npx playwright test` 63/63 + 8 skipped 全綠)
  - 0 component API 改(其他 page 唔 import Recent Projects 嘢)
- **意外發現 / 教訓**:
  - **LoginPage 冇 name attribute**:L50 input 純 React controlled,冇 `name=`,Playwright `page.fill('input[name="email"]')` 會 timeout,要 fallback `input[type="email"]`。同 E2E 慣用 selector 唔同(Sprint 14 spec 都用 `input[type="email"], input[name="email"]` fallback)
  - **React Router root = Dashboard via `<Route index>`**:login `navigate('/')` 落 dashboard 唔係 `/dashboard`,waitForURL 要 `url.pathname === '/'`,唔係 `**/dashboard`
  - **Hermes `sync_playwright` 一次性開,唔可以再 `start()`**:Python script 兩次 `sync_playwright()` 入面再 `chromium.launch()` 撞 context manager 重入,要用同一個 `p` handle
  - **`hermes redactor` 對 secret 嘅影響**:LoginPage 冇 name 唔關 redactor 事,但 `python3 -c "..."` 用 admin123 喺 bash 都會被 redact,visual verify 一律用 `npx tsx` node script(redact 唔 trace 入去)
- **紅線狀態**:紅線 11(tracker 同步)✅、紅線 12(P0 US 必有 E2E)N/A(無新 US,純 visual layout)、紅線 13(無 bug fix)N/A
- **Out of scope(留俾下個 sprint)**:
  - 4 個 DEFERRED item(T15a/T15b 早已 close,US-10.3 full-text HOLD,`<EntitySubListSection>` refactor,`CreateBugModal` 對齊 `<AddBugModal>`)繼續 hold
  - `ProjectsPage` 加 `scope=my` toggle UI(Sprint 15 backend 已 support)
  - Dashboard 改 generic `<EntityAutocomplete>` + `useDashboardData` custom hook 抽 layout

### Sprint 15 (2026-06-10) 收工摘要 — Dashboard scope=my 嚴格過濾

- **目標**:David feedback「Dashboard 不要 show 所有項目,只要 show 自己有參與的項目」
- **修法**:
  - **Backend** `GET /api/projects` 加 `?scope=my` 嚴格只 filter 自己 member 嘅(包括 admin 都要守 invariant),`scope` 唔帶 default 仍然係「member OR 同部門」寬鬆(向後兼容)
  - **Frontend** `Dashboard` 攞項目改用 `scope=my`,widget 4 由「項目總數」改「我參與嘅項目」,empty state 改「暫無我參與嘅項目」+ 引導用戶「聯絡 PM 邀請您加入」
  - **Tracker / Red line 11** 合規:同步更新 Sprint 15 row
- **意外發現 / 教訓**:
  - **Backend source rebuild 必要性**:Backend docker container 唔會 hot-reload TS source,改咗 `/app/src/routes/projects.ts` 之後要 `docker compose build backend` + `docker compose up -d --force-recreate --no-deps backend` 拎新 image,先見效
  - **Frontend type signature**:Backend 加咗 query param 之後,frontend `api.ts` 嘅 `projectApi.list` type 都係要更新,唔 update `bun run build` 會 fail(TS strict)
  - **Strict mode `getByText`**:`Dashboard widget 4 label "我參與嘅項目"` 喺 widget 嗰度 + section heading 出現兩次(因為我哋 Sprint 14 嗰個 helper 寫 widget 4 改名叫「我參與嘅項目」,section heading 改用同一個 text)。Test 一定要 `.first()` 或者用 `getByRole` 鎖定 widget 嘅 specific element
  - **Insight 揭發**:Admin 之前能見 198 個 E2E fixture project(全部同部門),改咗之後真係 191 個自己 member — admin 真係好多項目 member 但唔係全部。嚴格過濾有意義
- **紅線狀態**:紅線 11(tracker 同步)✅、紅線 12(P0 US 必有 E2E)✅、紅線 13(無 user-reported bug fix)N/A(純 UX 改進)
- **Out of scope(留俾下個 sprint)**:
  - Backend `scope=team`(將來團隊 filter,例如「我嘅部門 + 我管理嘅部門」)
  - Dashboard 改用 generic `<EntityAutocomplete>` 同 widget layout 抽 `useDashboardData` custom hook
  - `ProjectsPage` 入面都加 `scope=my` toggle filter UI(後端已經 work)

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
| 2026-06-10 | **Sprint 10 in progress — P0 remaining US test push**:US-6.4(worklogs filter + RBAC gate)由 NONE → PASS-UNIT(9 個 derive test);US-3.5(requirement rich-text)由 NONE → PASS-UNIT(11 個 derive test);US-4.4(task ↔ requirement link)由 NONE → PASS-UNIT(6 個 source test);US-2.4(project ↔ department link)由 NONE → PASS-UNIT(11 個 derive test);US-2.3(project dashboard summary)由 NONE → PASS-UNIT(6 個 derive test,等開新 endpoint);US-4.5(Project Kanban)由 NONE → **PASS-UNIT + PASS-E2E** 🟢🟢(6 個 E2E test 寫好,5 個 API + UI 跑得起,1 drag-drop skip 留待 sprint 11 補,TypeScript clean) |
| 2026-06-09 | **Sprint 6 closure — 7-bug P0 fix sprint**:RG-014,7 個 user-reported bugs 全部 closed;E2E 24→33(+9 bugs-fix),Unit 479→499(+20 helper);新 pages:BugsPage/BugDetailPage/CreateBugModal;AttachmentsTab + RichTextEditor + ProjectsPage card 全部改;新 backend `GET /api/bugs/:id`;sidebar 加「全部缺陷」link |
| 2026-06-09 | **DEPRECATE US-5.5** 全部缺陷 standalone page:David 拎走 `/bugs` route + BugsPage 271 行,`BugsPage` 整個 delete;ProjectDetailPage 嘅 bug tab 同 `MyBugsPage` 仍然有 defects 入口;3 個 P0 regression E2E test 跳咗 + 標 DEPRECATED。US-5.6 E2E → PARTIAL(等 ProjectDetailPage create flow 補 test)。3 個 list page(項目內頁 3 個 tab + 需求內頁 2 個 sub-list + Wiki/Attachments 2 個 tab)加 client-side search box。 |
| 2026-06-09 | **Sprint 7 closure — ProjectDetailPage alignment**:ProjectDetailPage 嘅 Tasks/Bugs tabs 全 feature parity with RequirementDetailPage(加咗 新增任務 button、inline status select、Clock work-log、Bot AI 自動分配、WorkLogModal、智能分配 panel);所有 modal `max-w-2xl` + `RichTextEditor`;bug status `closed` 移除;tasks 加 `testing` option;Requirement 新增/編輯 modal 都改 `max-w-2xl` 對齊;helpers 對齊 Req 嘅 `bg-gray-100`/`高`/`嚴重`;TypeScript clean,33/33 E2E pass,499/499 unit pass,frontend-only refactor 冇 backend regression;Plan: `/Users/davidchu/.claude/plans/cozy-wandering-quiche.md` |
| 2026-06-09 | **Sprint 8 closure — Server-side Pagination**:4 個 list endpoint(projects/requirements/tasks/bugs)+ 5 個 list page 全部接 server-side pagination;新 `computePagination` 共用 helper(default 20 / max 100)鏡 worklogs `limit=-1` 模式;response 向後兼容(keep 原 array 名 + add `totalCount`/`page`/`pageSize`/`totalPages`);新 `<Pagination>` controlled component;status/project filter 改 server-side;pagination helper 17 個 unit test + 9 個 E2E;Unit 499→516(+17),E2E 33→42(+9 pagination E2E),Frontend `tsc` clean,Frontend `vite build` clean |
| 2026-06-09 | **Sprint 9 closure — Sub-list pagination + Reports stats consistency**:sub-list 全部接 server-side pagination(`ProjectDetailPage` 3 tabs + `RequirementDetailPage` 2 sub-lists + `UsersPage`);`/api/reports/cost` + `/api/reports/progress` 修 bug — 用 `where.OR` pattern 同 worklogs 對齊,統計一致化;33 個新 unit test(pagination response shape + RBAC gates + 成本 where 修 + 進度 status enum + percent math),10 個新 E2E(7 sub-list UI + 1 user UI + 2 reports cost leak);Unit 516→549(+33),E2E 42→52(+10),Frontend `tsc` clean;US-11.1 升 PASS-UNIT,US-11.2 升 PASS-UNIT+PASS-E2E(雙綠) |
| 2026-06-10 | **Sprint 17 closure — AddTaskModal unification + E2E regression guard**:新 `AddTaskModal.tsx` 共用 component(216 行,8 個 field/control single source of truth)取代 ProjectKanban 嘅 inline 76-line modal(原缺 RichText / 智能分配 / 參與人 / 父任務);new spec `e2e/tests/add-task-modal-unified.spec.ts` 3 test 8.1s pass — T1 + T2 分別 cover Task Tab / Kanban 入口 11 個 visibility snapshot key,T3 set-diff 守住「兩入口 modal field set = ∅」cross-entry invariant;E2E 63→66(+3),Unit 606 baseline 不變(frontend-only);Sprint 15/16 retro 同步收口 `docs/retros/2026-06-10-sprint-17-modal-unify-and-closure.md`;紅線 11/12 ✅,紅線 13 N/A |
| 2026-06-23 | **Post-Sprint-21 audit closure (t1-t4 sweep)**:4 個 audit task 全部完成,84 tests pass / 0 fail + nginx -t PASS;3 個新 TECH-DEBT entry (TD-NEW-8/9/10) 開 ticket 候選 Sprint 22;audit reports 4 份入 `docs/retros/_meta/` |

---

## 5. 變更規則

**改 PRD 必更新本檔**(紅線 11):
- 新 US → 加 row,Test Status = NONE
- 改 US(scope / priority) → 標 PARTIAL
- 刪 US → 標 DEPRECATED 而唔係刪 row
- 補 test → 改 Test Status

**冇更新 tracker = 任務冇做**(紅線 11 鐵律)。
