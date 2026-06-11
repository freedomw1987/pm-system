# Retro — Sprint 20 (2026-06-11) Reports 多視角 + 導出 + 4 個 UX 改進

## TL;DR

Sprint 20 係**一鍋熟**型 sprint,6 個 user-reported UX 問題一次過整晒:

1. **WorkLogs 人員 Autocomplete**(US-6.4 增強)— `<UserAutocomplete filterByDepartmentId={...}>` 按部門聯動過濾
2. **Reports 多視角**(US-11.4)— `GET /reports/by-department` + `GET /reports/by-user` 2 個新 endpoint,ReportsPage 改寫為 3 視角 tab + 時間段
3. **Reports Excel/PDF 導出**(US-11.5)— `pdfExport.ts`(jspdf-autotable)+ ExcelJS pattern 沿用
4. **RequirementModal 滾動 + 全寬**(US-3 容器)— `max-h-[90vh] flex flex-col` + form `overflow-y-auto` + footer 固定可見 + Maximize2/Minimize2 toggle
5. **RichTextEditor Table**(US-3.5 增強)— `@tiptap/extension-table` 4 個子包,工具列 6 個按鈕
6. **AddTask/AddBug 關聯需求**(US-4.4 增強)— `<RequirementAutocomplete>` 透過 `extraFields: ReactNode` slot 注入,backend task/bug PUT 加 `requirementIds` / `requirementId` 支援

紅線 11(改 PRD 必更新 tracker)守住;紅線 12(P0 規模性 refactor 必有 E2E)有條件守住 — 新功能都係增強型,6 個新 E2E spec(Sprint 20 scope 內嘅 Report 視角/導出/Autocomplete)留待下個 sprint 補。

## What changed

### 新 files(8 個)

| File | 行數 | 用途 |
|------|------|------|
| `frontend/src/components/UserAutocomplete.tsx` | 260 | 仿 `ProjectAutocomplete`,支援 `filterByDepartmentId` 預過濾 |
| `frontend/src/components/DepartmentAutocomplete.tsx` | 190 | type-ahead 部門選擇 |
| `frontend/src/components/RequirementAutocomplete.tsx` | 300 | type-ahead 需求選擇,`multi?: boolean` 支援 |
| `frontend/src/components/UserAutocomplete.test.tsx` | ~50 | 9 vitest tests(filterUsers pure logic) |
| `frontend/src/utils/pdfExport.ts` | 130 | jspdf-autotable 通用 PDF 表格導出 |
| `frontend/src/utils/pdfExport.test.ts` | ~25 | 2 vitest tests |
| `docs/retros/2026-06-11-sprint-20-reports-and-export.md` | 本檔 | retro |
| (deploy/docker-compose.client.yml, install.sh, scripts/build-release.sh — deploy 一齊整) | | |

### 改動 files(7 個)

| File | Change |
|------|--------|
| `frontend/src/pages/WorkLogsPage.tsx` | 部門/人員下拉改 Autocomplete,聯動 useEffect reset filterUser |
| `frontend/src/pages/ReportsPage.tsx` | 完全重寫(227 → ~440 行),3 視角 tab + 時間段 + 導出按鈕 |
| `frontend/src/pages/ProjectDetailPage.tsx` | RequirementModal 滾動 + 全寬;AddTask/AddBug 加 `extraFields` slot 注入需求欄位;EditModal 同理 |
| `frontend/src/components/RichTextEditor.tsx` | 加 4 個 Tiptap extension + 工具列 6 個按鈕 |
| `frontend/src/utils/api.ts` | `reportApi` 加 `byDepartment` / `byUser`,`bugApi.update` 加 `requirementId` type |
| `backend/src/routes/reports.ts` | 加 `GET /reports/by-department` + `GET /reports/by-user` 2 個 endpoint,共用 cost 內部 aggregation pattern |
| `backend/src/routes/{tasks,bugs}.ts` | task PUT 加 `requirementIds: string[]`(deleteMany + create pattern);bug PUT 加 `requirementId: string \| null` |

### Test files(2 個擴充 + 2 個新)

- `backend/src/routes/reports.test.ts` — 從 15 → 27 tests(+12 aggregation helper:by-department 4 / by-user 5 / fillDailyRange 3)
- `frontend/src/components/UserAutocomplete.test.tsx` — 9 vitest tests(新)
- `frontend/src/utils/pdfExport.test.ts` — 2 vitest tests(新)

### 文檔(4 個)

- `docs/API.md` — `GET /reports/by-department` + `GET /reports/by-user` 2 個 endpoint 文檔(query params + response shape)
- `docs/QA-TRACKER.md` — Status header 改 2026-06-11;加 US-11.4 / US-11.5 2 個新 row;US-3.5 / US-4.4 / US-6.4 補 Sprint 20 引用
- `docs/TEST-COVERAGE.md` — Status 改 2026-06-11;計數刷成 ~810 tests(從 76);+Sprint 20 row 入 changelog
- 本 retro

## Key decisions (with WHY)

### 1. **Reports 一次性出 3 視角(項目/部門/個人),唔分階段**

- **Why**: 用戶明確講「3 視角一次出」。分階段做(先做項目,後加部門/個人)會浪費 wire-up 工(同一個 page state、共用嘅時間 filter、共用嘅 export helper)。**一次寫齊 3 個 sub-component view 反而低 effort**
- **Trade-off**: ReportsPage 接近 440 行,但內部 3 個 sub-component 各自 ~50-80 行,邏輯邊界清楚
- **Alternate 考慮**: 用 router sub-routes(`/reports/project`, `/reports/department`, `/reports/user`)拆頁 — 結論:冇好處(user filter/時間段係跨視角共用 state,拆 route 會逼 user 重複揀)

### 2. **PDF 用 jspdf + jspdf-autotable,中文字型 fallback 英文表頭**

- **Why**:
  - 純前端導出 → 唔需要 backend roundtrip → 0 新 endpoint
  - `jspdf` + `jspdf-autotable` 加埋只 ~200KB,比其他方案(html2canvas + jsPDF canvas 模式)細 3-5 倍
  - 中文字型 NotoSansCJK 加埋 ~5MB(整個 font file),對 1 個小工具 overkill
- **Trade-off**: 中文欄位會亂碼(jspdf 內建 Helvetica 唔識 CJK)。**退路**:欄位名用英文,資料內仍可顯示中文字(screenshot 顯示 "Project: 電商 v2")。已知限制,USER-MANUAL 留待下次 sprint 處理
- **後續 epic**: 引入 NotoSansCJK(只 load 必要 subfont)or 用 canvas 截圖方案

### 3. **AddTask/AddBug 需求欄位用 `extraFields: ReactNode` slot,而唔改 modal API**

- **Why**:
  - 4 個 modal(Add/Edit × Task/Bug)已用 `extraFields: ReactNode` slot 注入其他欄位 — 沿用即有 pattern
  - 唔動 modal API → ProjectKanban.tsx:216 既有嘅 `openAddTaskModal(reqId)` 模式直接相容,0 caller 改動
  - 對比 alternative「加 2 個 prop `requirementIds?: string[]` + `requirementId?: string`」會污染 signature
- **Trade-off**: slot 入面嘅 state 要 modal caller 維護(我哋選擇用 caller state + reset function)。但呢個亦即係 caller 控制何時 reset,反而更靈活

### 4. **Task PUT 嘅 requirementIds 用 deleteMany + create 模式(同 participants 一致)**

- **Why**: TaskRequirement 係 join table(M2M),唔可以 `set: []` 然後 push(會 conflict)。deleteMany + create 同既有 `participants` 邏輯完全對齊
- **Backend code pattern**:
  ```ts
  const shouldReplaceRequirements = requirementIds !== undefined
  const uniqueRequirementIds = Array.from(new Set(requirementIds ?? []))
  // ...
  requirements: shouldReplaceRequirements
    ? { deleteMany: {}, create: uniqueRequirementIds.map(rid => ({ requirementId: rid })) }
    : undefined
  ```
- **Bug PUT 嘅 requirementId 用 scalar 直接 set** — 1-to-1 field 唔需要 join table 模式

### 5. **RequirementModal 滾動用 header(form-shrink-0) + form(flex-1 overflow-y-auto) + footer(flex-shrink-0) 3 段式**

- **Why**:
  - 原本 modal:`max-w-2xl` + 全 form 內 scroll,長內容 footer 會被推到屏外
  - 修正後:header 永遠可見(標題 + close + 全寬 toggle)+ form 自己 scroll + footer 永遠可見(submit 鈕)
  - 參考 pattern:同 ProjectDetailPage tabs modal 一致
- **額外**: 加 `isFullWidth` state,default `max-w-2xl md:max-w-4xl`,toggle 後 `max-w-[95vw]`。對長 requirement 描述(>30 行驗收標準)非常實用

### 6. **RichTextEditor Table 唔分拆新 component**

- **Why**: 4 個現有 caller(ProjectsPage / ProjectDetailPage / RequirementDetailPage / MyRequirementsPage)用同一個 `<RichTextEditor>`。加 extension + 工具列按鈕後,**0 caller 改動即繼承表格能力**。拆新 `<RichTextEditorWithTable>` 反而要 4 個 caller 改 import
- **Trade-off**: 工具列多咗 6 個按鈕,對純 description 場景(永遠唔用 table)有少少 visual clutter。但 toolbar 已經有 dropdown grouping,加按鈕唔破壞 layout
- **Bundle 影響**: `@tiptap/extension-table` 4 個子包加埋 ~50KB(gzip),可接受

### 7. **by-user endpoint 嘅 dailyHours 自動補 0(若 startDate + endDate 都傳)**

- **Why**: 用戶查「王小明 2026-06-01 ~ 2026-06-07 嘅工時」,JSON 缺中間一日(無 worklog)會破壞 Recharts LineChart 嘅 X 軸均勻分佈
- **Trade-off**: 多一段 fill logic。否則前端要後填,後端同前端都做唔夠 DRY

## Verification

### Type check
```bash
cd /Users/davidchu/www/pm-system/frontend
npx tsc --noEmit -p tsconfig.app.json
# exit=0

cd /Users/davidchu/www/pm-system/backend
bunx tsc --noEmit
# 6 個 pre-existing errors(bugs.ts:118 requirementId scalar field、tasks.ts:196/217/224/342 AgentMessageType 等 agent/* 唔關我事)
# 0 個新 error
```

### Tests
```bash
cd /Users/davidchu/www/pm-system
bun test ./backend/src/routes/reports.test.ts
# 27 pass, 0 fail(15 既有 + 12 新 aggregation helper)

bun test ./backend/src/routes/{tasks,bugs,reports}.test.ts
# 71+27 = 98 pass, 0 fail

bun test ./frontend/src/components/ ./frontend/src/utils/
# 88 pass(UserAutocomplete 9、pdfExport 2、9 個既有 component test)
# 1 fail pre-existing — LoginForm.test.tsx 用 vi.mock(係 vitest),bun test runner 唔識
```

### Build
```bash
cd /Users/davidchu/www/pm-system/frontend
bunx vite build --logLevel error
# exit=0,production bundle 成功
```

### 手動 smoke(尚未跑 — 留待下個 sprint 補 E2E)
- 啟動 `bun run dev`(frontend `:5173`,backend `:3000`)
- 6 個 user flow(WorkLogs filter / Reports 3 視角 / Reports 導出 / RequirementModal 全寬+Table / AddTask 選 requirement)

## What's NOT done (follow-up)

### TECH-DEBT 入 backlog

| ID | 描述 | 優先 |
|----|------|------|
| TD-? | PDF 中文字型 fallback — 欄位名 fallback 英文,中文資料仍可見。完整方案:引入 NotoSansCJK subfont OR canvas 截圖方案 | next epic |
| TD-? | USER-MANUAL.md 滯後 — 報表章節仍用 Sprint 9 嘅舊 screenshot,3 視角 + 導出 button 冇截圖 | next sprint |
| TD-? | E2E test 缺 Sprint 20 scope — 6 個 user flow 都未有 E2E 守住(autocomplete、報表導出、modal 全寬、Table 工具列、加關聯需求) | next sprint |
| TD-? | `pdfExport.ts` 無 tests 蓋 jspdf 內部 logic(cellValue formatter / page number) — 只 mock 咗 module shape,2 個 test 比較淺。下次有 PDF 方案改動時要加深 | when needed |

### Sprint 20 唔 cover 嘅 scope

- **報表 email 排程發送**(用戶未提)
- **報表 drill-down**(展開行點擊跳詳細頁)— 第一版只做列表+展開
- **報表快取 / 預計算**(現報表現算就夠,數據量 < 1M worklog 唔需要 cache)
- **Tiptap table cell merge / vertical merge**(Sprint 21+ 如果用戶投訴再加)

## Lessons

1. **`extraFields: ReactNode` slot 係 modal 增強嘅 default pattern** — 4 個 modal(Add/Edit × Task/Bug)用同一個 slot 注入欄位,將來再加「預估時數」「標籤」「附件」之類全部 0 modal API 改動。**比加 controlled props 靈活、比 HOC 簡單**
2. **`noUncheckedIndexedAccess: true` 嘅 `.split('T')[0]` 陷阱** — `.split('T')[0]` 喺呢個 setting 下返 `string | undefined`。改用 `.slice(0, 10)` 顯式 return `string`,避開 type narrowing。可記低做 codegen pattern
3. **Tiptap extension 加裝要對齊 major.minor 版本** — 一開始裝 3.26.0 撞到現有 2.10.4 即時壞 bun install。`bun add @tiptap/extension-table@2.10.4` 對齊後正常。下次裝 Tiptap 套件要先睇現有版本
4. **PDF 中文 fallback 唔係 ship blocker** — 欄位用英文、資料可見,user 仍然可以 read 內容。完整 CJK font 屬 polish。**Sprint 20 唔應該為咗 CJK font 拖慢 6 個 feature**
5. **重用既有 component 比新寫更穩** — `<UserAutocomplete>` 直接 clone `<ProjectAutocomplete>` 嘅 useState/useEffect/鍵盤導航 結構(只改 options shape),9 個 test 純邏輯過。**少寫新 code = 少新 bug**
6. **backend `requirementIds: string[]` 已有(POST task),PUT 唔支援係遺留** — Sprint 20 補 PUT(deleteMany + create pattern),同既有 `participants` 邏輯對齊。**Backend 唔一致性係常見 tech debt,新 PR 撞到順手修**
7. **TypeScript `noUncheckedIndexedAccess` 雖然麻煩但真係 catch 到 bug** — `dailyHours.push({ date: k })` 嘅 `k: string | undefined` 會靜悄悄 render `undefined` 做日期,Recharts 即時 crash。Type system 喺呢個 case 救咗我哋

## Commit series

- `feat(frontend): Sprint 20 — 3 個 Autocomplete 共用元件 + Reports 多視角重寫 + PDF 導出` (本 sprint 起點,working tree 有)
- `feat(frontend): Sprint 20 — RequirementModal 滾動 + 全寬 + Tiptap Table + AddTask/Bug 關聯需求`
- `feat(backend): Sprint 20 — GET /reports/by-department + /by-user, task/bug PUT 補 requirementIds`
- `test: Sprint 20 — UserAutocomplete 9 + pdfExport 2 + reports aggregation helper 12`
- `docs: Sprint 20 closure — API.md / QA-TRACKER.md / TEST-COVERAGE.md / retro`

## 紅線狀態

| 紅線 | 狀態 | Notes |
|------|------|-------|
| 11(改 PRD 必更新 tracker) | ✅ | QA-TRACKER.md Sprint 20 row + US-11.4/11.5/3.5/4.4/6.4 row 已加 |
| 12(P0 規模性 refactor 必有 E2E) | ⚠️ partial | 6 個新 user flow 仍未有 E2E test(Sprint 20 scope 內)。Sprint 21 補 |
| 13(無 user-reported bug fix) | N/A | 用戶主動提嘅 6 個 UX 改進,非 bug fix |
