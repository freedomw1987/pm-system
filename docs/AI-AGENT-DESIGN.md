# AI Agent Management — 設計文件
> 記錄 AI Agent v2 的設計決策、架構思路、與未來規劃

---

## 1. 核心理念

### 1.1 AI Agent 是 Worker，不是工具

在這個系統中，**AI Agent 和人類是一等公民**。

- 兩者都有 `name`、`role`、`skills`
- 兩者都能被指派任務（Task）
- 兩者都能記錄工作日誌（WorkLog）
- 兩者都能產生產出物（Artifact）
- 區別只在於：人類透過瀏覽器操作，AI Agent 透過 API 操作

### 1.2 Worker 模型

```
Worker (抽象概念)
├── Human ← User (現有 model)
└── AIAgent ← 新 model
```

同一張 Task 指派清單，人類和 AI Agent 並列顯示。PM 不需要知道底層差異，只需要知道「誰負責這件事」。

---

## 2. 數據模型

### 2.1 核心 Entity

| Model | 用途 |
|-------|------|
| `AIAgent` | AI Agent 的配置（名稱、模型、API endpoint、技能、MCP servers、system prompt） |
| `ProjectAgent` | AI Agent 與 Project 的多對多關係（指派角色） |
| `Artifact` | AI Agent 產出的檔案/文件（連結到 Task 或 Project） |
| `WorkLog` | 工作日誌（擴展支援 `agentId`） |

### 2.2 Task 擴展

| 欄位 | 類型 | 說明 |
|------|------|------|
| `lane` | String | `backlog` / `in_progress` / `in_review` / `done` |
| `assigneeType` | String | `user` 或 `agent` |
| `assigneeId` | String? | User.id 或 AIAgent.id（視 assigneeType 而定） |
| `dueDate` | DateTime? | 截止日期 |

### 2.3 為何不用繼承？

Prisma 不支援 model 繼承。所以我們用：
- **discriminator 欄位** (`assigneeType: 'user' | 'agent'`)
- **同一個欄位不同的意義** (`assigneeId` → User 或 AIAgent)

好處：查詢時簡單，PM 只需要篩選 `assigneeType = 'agent'` 就能看到 AI 負責的任務。

---

## 3. API 設計

### 3.1 AI Agent CRUD

```
GET    /api/agents              # List all agents
GET    /api/agents/:id          # Get single agent
POST   /api/agents              # Create agent (Admin)
PUT    /api/agents/:id          # Update agent (Admin)
DELETE /api/agents/:id          # Soft delete (set isActive=false) (Admin)
GET    /api/agents/status       # Lightweight status poll (for frontend polling)
```

### 3.2 Project-Level Agent Management

```
GET    /api/projects/:id/agents      # Get project's human members + AI agents
POST   /api/projects/:id/agents      # Add AI agent to project (Admin/PM)
DELETE /api/projects/:id/agents/:agentId  # Remove AI agent from project
```

### 3.3 Task APIs

所有 Task API 已支援 `lane`、`assigneeType` 欄位。

```
POST /api/tasks          # 建立任務（可指定 lane、assigneeType）
PUT  /api/tasks/:id      # 更新任務（可指定 lane、assigneeType）
GET  /api/tasks          # 查詢任務（支援 ?lane=backlog 篩選）
```

---

## 4. 前端頁面

### 4.1 AI Agent 管理頁 (`/agents`)

Admin 專用頁面。

功能：
- Agent 列表（卡片式）：名稱、模型、狀態、Skill 數量、MCP server 數量、最後活動時間
- 建立/編輯 Agent modal
- 軟刪除（停用按鈕）

Agent 狀態：
- 🟢 **Online** — idle，可接收任務
- 🟡 **Busy** — 正在執行任務
- 🔴 **Offline** — 未連線或錯誤

### 4.2 Kanban 面板 (`/projects/:id/kanban`)

每個項目有自己的 Kanban 面板。四個預設 Lane：

| Lane | 顏色 | 對應 Status |
|------|------|-------------|
| 📋 Backlog | 灰 | `pending` |
| 📝 In Progress | 藍 | `in_progress` |
| 🔍 In Review | 黃 | `in_progress` |
| ✅ Done | 綠 | `completed` |

任務卡顯示：
- 優先級標籤（🔴 高 / 🟡 中 / 🟢 低）
- 任務標題
- 指派對象（👤 人類 / 🤖 AI Agent）
- 工作日誌數量

點擊任務卡 → 詳情 Modal，可：
- 更改 Lane（即更新狀態）
- 重新指派（人 ↔ AI Agent）

### 4.3 項目詳情頁 Tab

項目詳情頁現有 Tabs：`需求` / `成員` / `Wiki` / `附件`

新增 `Kanban` Tab（Link 形式，點擊跳轉到 `/projects/:id/kanban`）

### 4.4 左側導航

「設定」區塊新增 `AI Agent` Nav Item（Bot icon，Admin 限定）

---

## 5. 未來規劃（Phase 2+）

### 5.1 Git 整合

- **Code Browser** — Repo URL → 顯示檔案樹 + 內容
- **Commit History** — 列出成員的 commit（含 AI Agent 的 commit）
- **AI Commit** — AI Agent 可根據 Task 完成狀態自動 commit（需用戶開關設定）

### 5.2 AI Agent 自動化

- **Task Trigger** — 設定自動派發規則（例如：當requirement狀態變更，自動建立Task並派發給某Agent）
- **Self-Spawn** — Agent 可根據 System Prompt 自主創建子任務

### 5.3 MCP 整合

Phase 1 只儲存 MCP server 設定（URL、名稱）。Phase 2 需要：
- **Health Check** — 定時檢查 MCP server 是否正常
- **Tool Discovery** — 從 MCP server 讀取可用 tools 列表
- **Tool Execution** — Agent 執行任務時呼叫對應 MCP tool

### 5.4 Agent 技能注册

Phase 1：技能是自由文字（admins 自行輸入）。Phase 2：
- 建立 `Skill` model（名稱、描述、category）
- Agent 可選擇性連結到多個 Skill
- Task 可標明需要特定 Skill（系統自動推薦合適 Agent）

### 5.5 實時更新

Phase 1 使用 polling（每 3 秒查 `/api/agents/status`）。Phase 2 可考慮：
- WebSocket 推送 agent 狀態變更
- 或使用 Server-Sent Events (SSE)

### 5.6 Artifact 瀏覽器

AI Agent 產出的 Artifact（代碼、文檔、圖片）需要有一個統一的瀏覽介面：
- 按 Project / Task 篩選
- 預覽（圖片、Markdown）
- 下載

### 5.7 Agent 執行日誌

Agent 執行任務時的對話/思路需要儲存：
- `AgentExecutionLog` model：taskId、agentId、prompt、response、tokens、cost
- 在 Task 詳情頁可查看 Agent 的執行歷史

---

## 6. 安全性考量

### 6.1 API Key 儲存

`AIAgent.apiKey` 必須加密儲存。目前 Phase 1 尚未實作加密，應儘快實作：

```typescript
// 加密
const encrypted = encrypt(apiKey, process.env.ENCRYPTION_KEY)

// 解密（在调用 Agent API 時）
const decrypted = decrypt(agent.apiKey, process.env.ENCRYPTION_KEY)
```

### 6.2 Permission 控制

新增權限：
- `agents.view` — 查看 Agent 列表
- `agents.create` — 建立 Agent
- `agents.edit` — 編輯 Agent
- `agents.delete` — 刪除/停用 Agent
- `project_agents.create` — 將 Agent 加入專案
- `project_agents.delete` — 將 Agent 從專案移除

Admin 自動擁有所有權限。PM 可操作 `project_agents`。

### 6.3 Agent 執行隔離

AI Agent 執行任務時，應該在一個受限的環境中：
- 不能直接訪問 production database
- MCP tool 呼叫需要 audit log
- Token 用量需要追蹤（避免超支）

---

## 7. 已完成的檔案清單

### Backend
- `backend/prisma/schema.prisma` — 新增 AIAgent、ProjectAgent、Artifact model + Task 擴展
- `backend/src/routes/agents.ts` — AI Agent CRUD API
- `backend/src/routes/project-agents.ts` — Project-Agent 關係 API
- `backend/src/routes/tasks.ts` — Task lane/assigneeType 支援
- `backend/src/index.ts` — 註冊新 routes

### Frontend
- `frontend/src/pages/ProjectKanbanPage.tsx` — Kanban 面板
- `frontend/src/pages/AgentsPage.tsx` — AI Agent 管理頁
- `frontend/src/pages/ProjectDetailPage.tsx` — 新增 Kanban Tab
- `frontend/src/components/Layout.tsx` — AI Agent Nav Item
- `frontend/src/App.tsx` — 新增 routes

### 文檔
- `docs/PRD-ai-agent-v2-phase1.md` — Phase 1 PRD
- `docs/AI-AGENT-DESIGN.md` — 本文件（設計決策記錄）

---

## 8. 部署備忘

### Dev Environment
```bash
# 確保 Prisma schema 已同步
cd backend && bun run db:push

# 重啟 backend（已自動重載）
# 部署 frontend
cd frontend && bun run build
```

### Production
```bash
# Build Docker images
docker compose -f docker-compose.prod.yml build

# Deploy
docker compose -f docker-compose.prod.yml up -d
```

### Database Migration
```bash
cd backend
bun run db:push   # 快速同步（開發用）
# 或
bun run db:migrate  # 正式 migration
```

---

*最後更新：2026-05-25*