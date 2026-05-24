# AI Agent — 智能助手

## 1. 目標

為 PM System 接入 AI Agent，讓用戶可以通過自然語言查詢項目數據，以及上傳項目文檔後由 AI 自動拆解需求和任務。

## 2. 核心功能

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

```prisma
// LLM 配置（系統級）
model LLMConfig {
  id          String   @id @default(uuid())
  apiUrl      String
  apiKey      String   // 加密儲存
  model       String
  updatedAt   DateTime @updatedAt
}

// Wiki 頁面
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

// AI 聊天會話
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

// 聊天訊息
model ChatMessage {
  id         String   @id @default(uuid())
  sessionId  String
  session    ChatSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  role       String   // 'user' | 'assistant' | 'system'
  content    String
  createdAt  DateTime @default(now())
}
```

## 4. API 設計

### 4.1 LLM 配置

| 方法 | 端點 | 描述 | 權限 |
|------|------|------|------|
| GET | /api/llm-config | 獲取配置（不含 API Key）| Admin |
| PUT | /api/llm-config | 更新 LLM 配置 | Admin |

### 4.2 Wiki

| 方法 | 端點 | 描述 | 權限 |
|------|------|------|------|
| GET | /api/wiki | Wiki 頁面列表 | 登入用戶 |
| POST | /api/wiki | 建立 Wiki 頁面 | PM+ |
| GET | /api/wiki/:id | Wiki 頁面詳情 | 登入用戶 |
| PUT | /api/wiki/:id | 更新 Wiki 頁面 | 作者或 PM+ |
| DELETE | /api/wiki/:id | 刪除 Wiki 頁面 | 作者或 PM+ |
| GET | /api/wiki/search?q= | 全文搜索 Wiki | 登入用戶 |

### 4.3 文件解析

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

### 4.4 AI 聊天

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

## 7. 實作階段

### Phase 1：LLM 配置 + Wiki（1 週）
- [ ] `llm_config` 表 + API
- [ ] `wiki_page` 表 + CRUD
- [ ] 全文搜索
- [ ] Wiki 頁面前端

### Phase 2：文件解析（0.5 週）
- [ ] mammoth / xlsx 解析
- [ ] 文件上傳 API
- [ ] LLM 調用整合
- [ ] 自動建立 wiki 頁面

### Phase 3：AI 聊天（1 週）
- [ ] `chat_session` / `chat_message` 表 + API
- [ ] Streaming 回覆
- [ ] RAG（搜尋相關 wiki）
- [ ] 聊天介面前端

### Phase 4：整合（0.5 週）
- [ ] 項目頁面內嵌 AI 查詢
- [ ] QA 測試
- [ ] 文檔更新

## 8. 技術細節

### 8.1 API Key 安全

- 儲存時使用 `AES-256-GCM` 加密
- 金鑰來自 `ENCRYPTION_KEY` 環境變數
- 只有在發送 LLM 請求時解密，記憶體中使用後即棄

### 8.2 Streaming

- 使用 Server-Sent Events (SSE) / `text/event-stream`
- 後端：Node.js streaming response
- 前端：`fetch` + `ReadableStream` 或 `EventSource`（需改用 fetch）

### 8.3 不用向量資料庫的原因

- VM 無 GPU，部署額外服务成本高
- Wiki 內容量通常不大（< 100 頁）
- PostgreSQL tsvector 全文搜索足以應付簡單的語意匹配
- 配合 LLM 的上下文窗口（128k tokens），足以容納相關 wiki 內容

### 8.4 文檔大小限制

- 最大檔案：**5MB**
- 拒絕格式時返回明確錯誤

## 9. 權限矩陣（新增）

| 功能 | Admin | PM | Developer | Tester | Visitor |
|------|-------|-----|-----------|--------|---------|
| 配置 LLM | ✅ | ❌ | ❌ | ❌ | ❌ |
| 建立/編輯 Wiki | ✅ | ✅ | ❌ | ❌ | ❌ |
| 檢視 Wiki | ✅ | ✅ | ✅ | ✅ | ❌ |
| 上傳文件 AI 分析 | ✅ | ✅ | ❌ | ❌ | ❌ |
| 使用 AI 聊天 | ✅ | ✅ | ✅ | ✅ | ❌ |