# AI Agent — 智能助手

## 1. 目標

為 PM System 接入 AI Agent，讓用戶可以通過自然語言查詢項目數據，以及上傳項目文檔後由 AI 自動拆解需求和任務。

本系統包含兩種 AI 功能：

| 功能 | 說明 |
|------|------|
| **AI 助手** | 對話式查詢、文件分析、Wiki 生成 |
| **AI Agent** | 作為團隊成員，認領任務、追蹤 Token、生成 Wiki 文檔 |

---

## AI Agent 任务管理系统

### 概述

AI Agent 是系統中的虛擬團隊成員，可以：
- 像人一樣認領和完成任務
- 使用 Token 而非工時計時
- 實時通過 WebSocket 與系統通信
- 任務完成後自動生成 Wiki 文檔

### 核心概念：Agent = User

```prisma
User (isAgent = true)
├── id, name, email, role
├── isAgent = true  ← 標記為 Agent
└── agentConfig = { model, maxConcurrentTasks, personality }
```

優點：
- Agent 自動出現在項目成員列表
- 相同的任務分配機制
- 共享權限系統
- Token 使用量類似 WorkLog

### 數據模型

```prisma
// User 擴展
model User {
  isAgent      Boolean @default(false)
  agentConfig  Json?   // { model, maxConcurrentTasks, personality }
}

// TokenLog（類似 WorkLog）
model TokenLog {
  id           String   @id @default(uuid())
  userId       String   // Agent 用戶 ID
  taskId       String?
  tokensUsed   Int
  inputTokens  Int?
  outputTokens Int?
  model        String   // e.g. "gpt-4o-mini"
  costUSD      Decimal?
  date         DateTime
  description  String?
}

// Task 擴展
model Task {
  claimedByAgentAt DateTime? // Agent 認領時間戳
}
```

### API 端點

#### Agent 管理

| 方法 | 端點 | 描述 |
|------|------|------|
| GET | `/api/agents` | 列出所有 Agent |
| POST | `/api/agents` | 創建新 Agent（管理員）|
| PUT | `/api/agents/:id` | 更新 Agent 配置 |
| DELETE | `/api/agents/:id` | 停用 Agent |
| GET | `/api/agents/:id/stats` | Agent 統計數據 |

#### 任務認領

| 方法 | 端點 | 描述 |
|------|------|------|
| GET | `/api/agents/available-tasks` | 獲取可認領任務 |
| POST | `/api/agents/claim-task` | Agent 認領任務 |
| POST | `/api/agents/release-task` | Agent 釋放任務 |

#### Token 追蹤

| 方法 | 端點 | 描述 |
|------|------|------|
| GET | `/api/token-logs` | 列出 Token 日誌 |
| POST | `/api/token-logs` | 記錄 Token 使用 |
| GET | `/api/token-logs/stats/by-model` | 按模型統計 |
| GET | `/api/token-logs/stats/by-agent` | 按 Agent 統計 |

### WebSocket 實時通信

```
ws://server/ws/agents?token=<auth-token>&agentId=<agent-id>
```

#### 消息類型

**客戶端 → 服務器：**
- `heartbeat` - 心跳包（30秒一次）
- `task_completed` - 任務完成
- `task_failed` - 任務失敗
- `request_tasks` - 請求更多任務

**服務器 → 客戶端：**
- `ping` - 連接確認
- `assign_task` - 分配新任務
- `available_tasks` - 可用任務列表
- `ack` - 消息確認

### Wiki 自動生成

任務完成後自動生成的文檔格式：

```markdown
# [任務標題] 執行紀錄

## 基本資訊
- 任務 ID: xxx
- 完成時間: 2024-01-01 12:00
- 使用 Model: gpt-4o-mini
- 使用 Token: 15000

## 執行日誌
1. 理解任務需求...
2. 分析問題...
3. 制定解決方案...

## 產出內容
```代碼或結果```

## 問題分析
- 遇到的問題: ...
- 解決方案: ...
```

### 新增權限

| 權限 | 說明 |
|------|------|
| `agents.view` | 查看 Agent 列表 |
| `agents.create` | 創建 Agent |
| `agents.edit` | 編輯 Agent |
| `agents.delete` | 刪除/停用 Agent |
| `tokenlogs.view` | 查看 Token 日誌 |
| `tokenlogs.create` | 記錄 Token 使用 |
| `tasks.claim` | 認領任務 |

### 前端功能

| 頁面 | 路徑 | 說明 |
|------|------|------|
| Agent 管理 | `/agents` | 查看/創建/停用 Agent |
| 項目 Kanban | `/projects/:id` → 看板標籤 | 按需求分組，拖拽更新狀態 |

---

## 2. 核心功能（AI 助手）

### 2.1 LLM 配置（管理員）

- 管理員可在系統設定頁面配置 LLM：
  - **API Endpoint** — OpenAI 兼容格式，例如 `https://api.openai.com/v1`
  - **API Key** — 保密儲存（加密）
  - **Model** — 例如 `gpt-4o`、`gpt-4o-mini`、`claude-3-5-sonnet`
- 設定後全系統啟用，所有用戶共享同一 LLM 配置
- API Key 只在調用 LLM 時使用，不記錄日誌

### 2.2 Wiki 知識庫

- 用戶（PM 或更高權限）可建立 wiki 頁面
- 每個 wiki 頁面包含：標題、內容（Markdown）、標籤、所属項目（可選）
- 所有 wiki 內容作為回答問題的 context 來源
- 搜尋方式：PostgreSQL 全文搜索（tsvector），不需額外向量資料庫

### 2.3 文件上傳與 AI 分析

- 支援格式：**Word (.docx)**、**Markdown (.md)**、**Excel (.xlsx)**
- 上傳流程：

  ```
  文件上傳 → 解析內容（mammoth / xlsx）→ 組成 Prompt → LLM 分析
    → 自動建立 wiki 頁面（含 AI 建議的需求和任務）
  ```

- AI 輸出的 wiki 頁面標題格式：`[文件名] 分析`
- 內容包含：
  - 文件摘要
  - 建議的需求（根據文件內容）
  - 建議的任務拆解
  - 原始文件內容（可選）

### 2.4 AI 聊天問答

- 用戶可在項目頁面或獨立聊天介面提問
- 回答時參考：
  1. 該項目的數據（成員、需求數量、進度等）
  2. Wiki 知識庫中相關內容
- 回答以 streaming 方式逐字呈現
- 聊天記錄保存，可用於日後查閱

## 3. 數據模型

### 3.1 LLM 配置（系統級）

```prisma
model LLMConfig {
  id          String   @id @default(uuid())
  apiUrl      String
  apiKey      String   // 加密儲存
  model       String
  updatedAt   DateTime @updatedAt
}
```

### 3.2 Wiki 頁面

```prisma
model WikiPage {
  id         String   @id @default(uuid())
  title      String
  content    String   // Markdown
  tags       String[] // 標籤陣列
  projectId  String?
  project    Project? @relation(fields: [projectId], references: [id])
  authorId   String
  author     User    @relation(fields: [authorId], references: [id])
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  // 全文搜索
  @@index([content], type: FullText)
}
```

### 3.3 AI 聊天會話

```prisma
model ChatSession {
  id         String   @id @default(uuid())
  userId     String
  user       User    @relation(fields: [userId], references: [id])
  projectId  String?  // 可選，限定項目 context
  project    Project? @relation(fields: [projectId], references: [id])
  title      String   // 自動生成或取第一條問題
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  messages   ChatMessage[]
}

model ChatMessage {
  id         String   @id @default(uuid())
  sessionId  String
  session    ChatSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  role       String   // 'user' | 'assistant' | 'system'
  content    String
  createdAt  DateTime @default(now())
}
```

### 3.4 Agent 相關模型

```prisma
// TokenLog（類似 WorkLog，追蹤 Token 使用）
model TokenLog {
  id           String   @id @default(uuid())
  userId       String   // Agent 用戶 ID
  taskId       String?
  tokensUsed   Int
  inputTokens  Int?
  outputTokens Int?
  model        String   // e.g. "gpt-4o-mini"
  costUSD      Decimal?
  date         DateTime
  description  String?
  createdAt    DateTime @default(now())

  user User  @relation(fields: [userId], references: [id])
  task Task? @relation(fields: [taskId], references: [id], onDelete: SetNull)
}

// User 擴展（Agent 標記）
model User {
  // ... existing fields
  isAgent      Boolean @default(false)
  agentConfig  Json?   // { model, maxConcurrentTasks, personality }
}

// Task 擴展（Agent 認領時間戳）
model Task {
  // ... existing fields
  claimedByAgentAt DateTime?
}
```

## 4. API 設計

### 4.1 Agent 管理（新增）

| 方法 | 端點 | 描述 | 權限 |
|------|------|------|------|
| GET | /api/agents | 列出所有 Agent | Admin |
| POST | /api/agents | 創建新 Agent | Admin |
| PUT | /api/agents/:id | 更新 Agent | Admin |
| DELETE | /api/agents/:id | 停用 Agent | Admin |
| GET | /api/agents/:id/stats | Agent 統計 | Admin |
| GET | /api/agents/available-tasks | 可認領任務 | Agent |
| POST | /api/agents/claim-task | 認領任務 | Agent |
| POST | /api/agents/release-task | 釋放任務 | Agent |

### 4.2 Token 日誌（新增）

| 方法 | 端點 | 描述 | 權限 |
|------|------|------|------|
| GET | /api/token-logs | 列出 Token 日誌 | Admin |
| POST | /api/token-logs | 記錄 Token 使用 | Agent |
| GET | /api/token-logs/stats/by-model | 按模型統計 | Admin |
| GET | /api/token-logs/stats/by-agent | 按 Agent 統計 | Admin |

### 4.3 LLM 配置

| 方法 | 端點 | 描述 | 權限 |
|------|------|------|------|
| GET | /api/llm-config | 獲取配置（不含 API Key）| Admin |
| PUT | /api/llm-config | 更新 LLM 配置 | Admin |

### 4.5 Wiki

| 方法 | 端點 | 描述 | 權限 |
|------|------|------|------|
| GET | /api/wiki | Wiki 頁面列表 | 登入用戶 |
| POST | /api/wiki | 建立 Wiki 頁面 | PM+ |
| GET | /api/wiki/:id | Wiki 頁面詳情 | 登入用戶 |
| PUT | /api/wiki/:id | 更新 Wiki 頁面 | 作者或 PM+ |
| DELETE | /api/wiki/:id | 刪除 Wiki 頁面 | 作者或 PM+ |
| GET | /api/wiki/search?q= | 全文搜索 Wiki | 登入用戶 |

### 4.6 文件解析

| 方法 | 端點 | 描述 | 權限 |
|------|------|------|------|
| POST | /api/documents/parse | 上傳文件並 AI 分析 | PM+ |

**請求：** `multipart/form-data`
```
file: <File>
projectId: <string> (可選)
```

**流程：**
1. 解析文件內容
2. 搜尋相關 wiki 內容作為 context
3. 送 LLM 分析，輸出結構化建議
4. 自動建立 wiki 頁面

### 4.7 AI 聊天

| 方法 | 端點 | 描述 | 權限 |
|------|------|------|------|
| GET | /api/chat/sessions | 聊天會話列表 | 登入用戶 |
| POST | /api/chat/sessions | 建立新會話 | 登入用戶 |
| GET | /api/chat/sessions/:id/messages | 會話消息 | 會話擁有者 |
| POST | /api/chat/sessions/:id/messages | 發送消息（streaming）| 會話擁有者 |
| DELETE | /api/chat/sessions/:id | 刪除會話 | 會話擁有者 |

**Streaming 回覆實作：**
```
POST /api/chat/sessions/:id/messages
Content-Type: text/event-stream  ← 關鍵
```

## 5. 文件解析方案

| 格式 | 庫 | 輸出 |
|------|-----|------|
| Word (.docx) | `mammoth` | 純文字（保留段落結構）|
| Markdown (.md) | 直接讀取 | 原文 |
| Excel (.xlsx) | `xlsx` (SheetJS) | CSV-like 文字（所有 sheet 合併）|

## 6. 系統提示詞（System Prompt）

```text
你是一個項目管理助手，幫助用戶了解項目狀況。
根據提供的 context（項目數據 + Wiki 知識庫內容）回答問題。
如果 context 不足以回答，請明確說明，並建議用戶可以查看哪些資料。
回答簡潔，適當使用列表和表格格式。
```

## 5. 實作階段

### Phase 1：數據模型擴展 ✅
- [x] `User.isAgent`, `User.agentConfig` 字段
- [x] `TokenLog` 表（追蹤 Token 使用）
- [x] `Task.claimedByAgentAt` 字段
- [x] Prisma 遷移

### Phase 2：Agent API ✅
- [x] Agent CRUD 端點
- [x] 任務認領/釋放 API
- [x] Token 日誌 API

### Phase 3：WebSocket 運行時 ✅
- [x] WebSocket 服務器
- [x] 心跳檢測
- [x] 任務分配
- [x] Wiki 自動生成

### Phase 4：前端功能 ✅
- [x] Agent 管理頁面 (`/agents`)
- [x] 項目 Kanban 看板
- [x] Agent 徽章顯示

### Phase 5：LLM 配置 + Wiki（原有功能）
- [ ] `llm_config` 表 + API
- [ ] `wiki_page` 表 + CRUD
- [ ] 全文搜索
- [ ] Wiki 頁面前端

### Phase 6：文件解析
- [ ] mammoth / xlsx 解析
- [ ] 文件上傳 API
- [ ] LLM 調用整合
- [ ] 自動建立 wiki 頁面

### Phase 7：AI 聊天
- [ ] `chat_session` / `chat_message` 表 + API
- [ ] Streaming 回覆
- [ ] RAG（搜尋相關 wiki）
- [ ] 聊天介面前端

### Phase 8：整合
- [ ] 項目頁面內嵌 AI 查詢
- [ ] QA 測試
- [ ] 文檔更新

## 11. 技術細節

### 11.1 WebSocket 通信

Agent 通過 WebSocket 實時與系統通信：

```
ws://server/ws/agents?token=<auth-token>&agentId=<agent-id>
```

**心跳協議：** 每 30 秒發送一次

```json
{
  "type": "heartbeat",
  "payload": {
    "status": "working",
    "activeTasks": ["task-id-1", "task-id-2"],
    "totalTokensUsed": 50000
  }
}
```

### 11.2 API Key 安全

- 儲存時使用 `AES-256-GCM` 加密
- 金鑰來自 `ENCRYPTION_KEY` 環境變數
- 只有在發送 LLM 請求時解密，記憶體中使用後即棄

### 11.3 Streaming

- 使用 Server-Sent Events (SSE) / `text/event-stream`
- 後端：Bun streaming response
- 前端：`fetch` + `ReadableStream`

### 11.4 不用向量資料庫的原因

- VM 無 GPU，部署額外服务成本高
- Wiki 內容量通常不大（< 100 頁）
- PostgreSQL tsvector 全文搜索足以應付簡單的語意匹配
- 配合 LLM 的上下文窗口（128k tokens），足以容納相關 wiki 內容

### 11.5 文檔大小限制

- 最大檔案：**5MB**
- 拒絕格式時返回明確錯誤

### 11.6 Token 使用量估算

使用 TokenLog 追蹤 Agent 工作量：

| 任务类型 | 预估 Token |
|---------|-----------|
| 简单查询 | 1,000 - 5,000 |
| 文档生成 | 10,000 - 50,000 |
| 代码生成 | 20,000 - 100,000 |
| 复杂分析 | 50,000 - 200,000 |

## 12. 文件清單

### 後端

| 文件 | 說明 |
|------|------|
| `backend/prisma/schema.prisma` | 數據模型（User, TokenLog, Task 擴展）|
| `backend/src/routes/agents.ts` | Agent CRUD + 任務認領 API |
| `backend/src/routes/tokenlogs.ts` | Token 日誌 API |
| `backend/src/agent/runtime.ts` | WebSocket 實時通信運行時 |
| `backend/src/middleware/permission.ts` | 權限定義（新增 agents.*, tokenlogs.*）|
| `backend/src/index.ts` | 路由註冊 |

### 前端

| 文件 | 說明 |
|------|------|
| `frontend/src/pages/AgentsPage.tsx` | Agent 管理頁面 |
| `frontend/src/components/ProjectKanban.tsx` | 項目 Kanban 看板 |
| `frontend/src/pages/MyTasksPage.tsx` | Agent 徽章顯示 |
| `frontend/src/utils/api.ts` | API 客戶端（新增 agentApi, tokenLogApi）|
| `frontend/src/types/index.ts` | 類型定義（Agent, TokenLog）|
| `frontend/src/App.tsx` | 路由配置 |
| `frontend/src/components/Layout.tsx` | 側邊欄（新增 Agent 管理入口）|

## 13. 示例

### 創建 Agent

```bash
curl -X POST http://localhost:4000/api/agents \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin-token>" \
  -d '{
    "email": "agent-dev1@test.com",
    "name": "AI 開發助手",
    "password": "agent123",
    "role": "developer",
    "agentConfig": {
      "model": "gpt-4o-mini",
      "maxConcurrentTasks": 3
    }
  }'
```

### 認領任務

```bash
curl -X POST http://localhost:4000/api/agents/claim-task \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <agent-token>" \
  -d '{"taskId": "task-uuid-here"}'
```

### 記錄 Token 使用

```bash
curl -X POST http://localhost:4000/api/token-logs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <agent-token>" \
  -d '{
    "taskId": "task-uuid-here",
    "tokensUsed": 15000,
    "inputTokens": 12000,
    "outputTokens": 3000,
    "model": "gpt-4o-mini",
    "description": "完成用戶登入 API 開發"
  }'
```

### 創建 Wiki 頁面

```bash
curl -X POST http://localhost:4000/api/wikis \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "projectId": "project-uuid",
    "title": "[任務完成] 用戶登入 API - 2024-01-01",
    "content": "# 用戶登入 API 執行紀錄\n\n## 基本資訊\n...",
    "tags": ["agent", "task-completion"]
  }'
```

### 10.1 Agent 相關權限（新增）

| 權限 | 說明 |
|------|------|
| `agents.view` | 查看 Agent 列表和狀態 |
| `agents.create` | 創建新 Agent |
| `agents.edit` | 編輯 Agent 配置 |
| `agents.delete` | 停用 Agent |
| `tokenlogs.view` | 查看 Token 使用日誌 |
| `tokenlogs.create` | 記錄 Token 使用（Agent 使用）|
| `tasks.claim` | 認領任務 |

### 10.2 完整權限矩陣

| 功能 | Admin | PM | Developer | Tester | Visitor | Agent |
|------|-------|-----|-----------|--------|---------|-------|
| 配置 LLM | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 管理 Agent | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 認領任務 | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| 記錄 Token | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| 查看 Token 日誌 | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| 建立/編輯 Wiki | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| 檢視 Wiki | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| 上傳文件 AI 分析 | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| 使用 AI 聊天 | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |