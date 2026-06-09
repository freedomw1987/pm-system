# PM System — Product Requirements Document (PRD)

> **Status**: Living document
> **Owner**: PMO + Internal IT
> **Last updated**: 2026-06-08

---

## 1. 產品定位

公司內部用嘅項目管理 Web App。**目標用戶**:項目經理、開發、測試、Admin。**核心價值**:統一需求 / 任務 / 缺陷 / 工時 + AI 助手降低操作成本。

---

## 2. 用戶角色 (Personas)

### P-Admin (系統管理員)
- **目標**:維持系統運作、設定權限、配置 LLM
- **痛點**:用戶亂建角色、LLM Key 唔統一
- **典型任務**:建新角色、配置 LLM API、睇全局報表

### P-PM (項目經理)
- **目標**:追蹤 project 進度、確保 on-time delivery
- **痛點**:Excel 管工時,需求改咗冇歷史
- **典型任務**:建項目、加成員、分派需求、睇進度報表

### P-Tech Lead
- **目標**:協調 developer、審批需求
- **痛點**:task 分派唔均、需求 review 慢
- **典型任務**:分派任務、審批需求、睇 token 用量

### P-Developer
- **目標**:完成自己嘅 task、報工時
- **痛點**:填工時麻煩、要切換多個系統
- **典型任務**:睇自己嘅 task、填 WorkLog、用 AI 助手

### P-Tester
- **目標**:搵 bug、追蹤修復
- **痛點**:bug 重複、狀態唔更新
- **典型任務**:建 bug、睇自己嘅 bug、驗收

### P-Visitor
- **目標**:睇報表(無修改權限)
- **痛點**:冇統一 dashboard

---

## 3. User Stories

> **格式**: `US-X.Y` = Epic X,Story Y。Epic = 模組。
> **Priority**: P0 = 必須 / P1 = 應該 / P2 = 可以
> **Status**: DRAFT / IN-PROGRESS / DONE

### Epic 1: 認證 (Auth)

| ID | Story | Priority | Status |
|----|-------|----------|--------|
| US-1.1 | 作為用戶,我可以 email + 密碼登入 | P0 | DONE |
| US-1.2 | 作為用戶,我可以 refresh token 唔使重新登入 | P0 | DONE |
| US-1.3 | 作為用戶,我可以登出清除 token | P0 | DONE |

### Epic 2: 項目管理 (Projects)

| ID | Story | Priority | Status |
|----|-------|----------|--------|
| US-2.1 | 作為 PM,我可以建項目(名、描述、開始/結束日、Owner) | P0 | DONE |
| US-2.2 | 作為 PM,我可以加成員、設項目角色 | P0 | DONE |
| US-2.3 | 作為 PM,我可以睇項目 dashboard(進度、成員工作量) | P1 | DONE |
| US-2.4 | 作為 PM,我可以將項目連結去部門 | P2 | DONE |

### Epic 3: 需求管理 (Requirements)

| ID | Story | Priority | Status |
|----|-------|----------|--------|
| US-3.1 | 作為 PM,我可以建需求(title, 描述, 優先級, 狀態, 項目) | P0 | DONE |
| US-3.2 | 作為 PM,我可以將需求分派畀 developer | P0 | DONE |
| US-3.3 | 作為 Developer,我可以睇「我的需求」(MyRequirements) | P0 | DONE |
| US-3.4 | 作為 Developer,我可以更新需求狀態 | P0 | DONE |
| US-3.5 | 作為 PM,我可以睇需求嘅 rich text 描述同附件 | P1 | DONE |

### Epic 4: 任務管理 (Tasks)

| ID | Story | Priority | Status |
|----|-------|----------|--------|
| US-4.1 | 作為 Tech Lead,我可以建任務、分派畀 developer | P0 | DONE |
| US-4.2 | 作為 Developer,我可以睇「我的任務」(MyTasks) | P0 | DONE |
| US-4.3 | 作為 Developer,我可以更新任務狀態(Kanban) | P0 | DONE |
| US-4.4 | 作為 Developer,我可以 link 需求 → 任務(TaskRequirement) | P1 | DONE |
| US-4.5 | 作為 PM,我可以睇 Project Kanban 全局視圖 | P1 | DONE |

### Epic 5: 缺陷追蹤 (Bugs)

| ID | Story | Priority | Status |
|----|-------|----------|--------|
| US-5.1 | 作為 Tester,我可以建 Bug(title, 描述, 嚴重程度, 項目) | P0 | DONE |
| US-5.2 | 作為 Tester,我可以將 Bug 分派畀 developer | P0 | DONE |
| US-5.3 | 作為 Developer,我可以睇「我的 Bug」(MyBugs) | P0 | DONE |
| US-5.4 | 作為 Tester,我可以更新 Bug 狀態(open / fixed / verified / closed) | P0 | DONE |
| ~~US-5.5~~ | ~~作為 PM,我可以睇「全部缺陷」列表 + 詳情(/bugs standalone page)~~ | ~~P0~~ | ❌ **DEPRECATED 2026-06-09** (David 拎走 `/bugs` standalone page,只保留「我的缺陷」+ 項目/需求內頁 bug tab 入口) |
| US-5.6 | Bug 描述支援 rich text + image paste | P1 | DONE (Backend + BugDetailPage 嘅 RichTextEditor;E2E 暫時 PARTIAL,等 ProjectDetailPage 補 test) |

### Epic 6: 工時記錄 (WorkLogs)

| ID | Story | Priority | Status |
|----|-------|----------|--------|
| US-6.1 | 作為 Developer,我可以填 WorkLog(日期、時數、任務、描述) | P0 | DONE |
| US-6.2 | 作為 PM,我可以睇 WorkLogs 列表(server-side 分頁) | P0 | DONE |
| US-6.3 | 作為 PM,我可以將 WorkLogs 匯出 Excel | P1 | DONE |
| US-6.4 | 作為 PM,我可以按部門 / 用戶 / 日期篩選工時 | P1 | DONE |

### Epic 7: RBAC 權限

| ID | Story | Priority | Status |
|----|-------|----------|--------|
| US-7.1 | 作為 Admin,我可以建自定義角色,揀 permission key 組合 | P0 | DONE |
| US-7.2 | 作為 Admin,我可以將用戶嘅角色改做自定義角色 | P0 | DONE |
| US-7.3 | 作為任何用戶,系統根據我嘅角色擋住我冇權限嘅 endpoint | P0 | DONE |
| US-7.4 | 作為 PM,我可以喺項目層面再覆寫角色權限(own project only) | P1 | DONE |

### Epic 8: AI 助手 (Chat)

| ID | Story | Priority | Status |
|----|-------|----------|--------|
| US-8.1 | 作為用戶,我可以用自然語言查詢項目數據 | P0 | DONE |
| US-8.2 | 作為用戶,我可以將對話綁定項目,操作項目數據 | P0 | DONE |
| US-8.3 | 作為用戶,我可以叫 AI 建 / 更新需求 | P0 | DONE |
| US-8.4 | 作為用戶,我可以叫 AI 建 / 更新 Bug | P0 | DONE |
| US-8.5 | 作為用戶,我可以叫 AI 建 / 查任務 | P0 | DONE |
| US-8.6 | 作為用戶,我可以叫 AI 搜尋 Wiki 然後總結 | P1 | DONE |
| US-8.7 | 作為 Admin,我可以配置 LLM API(URL, Key, Model) | P0 | DONE |
| US-8.8 | 作為用戶,我可以上傳文件,AI 自動解析 | P1 | DONE |
| US-8.9 | 作為用戶,我可以上傳 PDF / 圖片,用 Vision LLM 解析 | P2 | DONE |

### Epic 9: AI Agent

| ID | Story | Priority | Status |
|----|-------|----------|--------|
| US-9.1 | 作為 Admin,我可以建 AI Agent(等於建 isAgent=true 嘅 User) | P0 | DONE |
| US-9.2 | 作為 Agent,我可以自動認領可執行嘅任務 | P0 | DONE |
| US-9.3 | 作為 Agent,我可以透過 WebSocket 實時上報進度 | P0 | DONE |
| US-9.4 | 作為 PM,我可以喺 AgentMonitor 睇所有 agent 嘅實時狀態 | P1 | DONE |
| US-9.5 | 作為 PM,我可以睇 Token 用量統計(按 model / agent) | P1 | DONE |

### Epic 10: Wiki

| ID | Story | Priority | Status |
|----|-------|----------|--------|
| US-10.1 | 作為 PM,我可以建 Wiki 頁(title, Markdown, tags, project) | P0 | DONE |
| US-10.2 | 作為 PM,我可以編輯 Wiki 頁 + 排序 | P0 | DONE |
| US-10.3 | 作為用戶,我可以喺 Chat 用自然語言搜 Wiki | P1 | DONE |
| US-10.4 | 作為 Agent,我可以喺完成任務後自動生 Wiki 文檔 | P2 | DONE |

### Epic 11: 報表 (Reports)

| ID | Story | Priority | Status |
|----|-------|----------|--------|
| US-11.1 | 作為 PM,我可以睇項目進度報表(任務完成率) | P1 | DONE |
| US-11.2 | 作為 PM,我可以睇工時報表(按人 / 部門) | P1 | DONE |
| US-11.3 | 作為 PM,我可以睇 Token 用量報表 | P2 | DONE |

### Epic 12: 部門管理 (Departments)

| ID | Story | Priority | Status |
|----|-------|----------|--------|
| US-12.1 | 作為 Admin,我可以建部門 | P1 | DONE |
| US-12.2 | 作為 Admin,我可以將用戶分派去部門 | P1 | DONE |
| US-12.3 | 作為 PM,我可以按部門篩選工時報表 | P1 | DONE |

---

## 4. Non-Functional Requirements (NFR)

| NFR | 目標 | 備註 |
|-----|------|------|
| Performance | 首屏 < 2s,API P95 < 500ms | 200 用戶以下 |
| Security | JWT + RBAC middleware,SQL injection 防護(Prisma) | OWASP top 10 |
| Reliability | DB daily backup,RDS multi-AZ(prod) | |
| Usability | RWD mobile,中文 UI,常用操作 3-click 內完成 | |
| Observability | pino logger,Agent WebSocket log | |
| Maintainability | TypeScript strict,monorepo-friendly | |

---

## 5. 假設 + 限制

- 假設公司 < 200 用戶,單 instance 夠用
- 假設瀏覽器為主,Mobile 為輔(無 native app)
- 限制:依賴外部 LLM(API Key 由 Admin 配置)
- 限制:Wiki 唔支援即時多人協作(走 Git-style 順序編輯)

---

## 6. 變更歷史

| 日期 | 變更 | 來源 |
|------|------|------|
| 2026-06-08 | 初版 derive 自 source code + 既有 docs | doc batch |
