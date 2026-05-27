---
title: "項目管理系統開發服務建議書"
subtitle: "Statement of Work"
author: ""
date: "2026年5月"
---

# 項目管理系統（PM System）開發服務建議書

**文件版本**：v1.0  
**編制日期**：2026年5月  
**適用範圍**：Internal PM System 報價與提案  

---

## 1. 項目背景與目標

### 1.1 項目背景

本項目旨在為貴公司內部建立一套完整的**項目管理系統（PM System）**，以提升項目團隊的需求管理、任務追蹤、缺陷管理與工作時數統計效率，並支援 AI 智能助手功能，協助團隊以自然語言查詢項目數據、自動化文檔分析與 Wiki 知識庫管理。

### 1.2 系統目標

- 實現需求→任務→缺陷的完整工作流管理
- 支援多人多角色、跨項目的權限控制
- 提供項目成本與進度報表
- 接入 AI Agent 作為虛擬團隊成員，認領任務並自動生成 Wiki 文檔
- 支援 AI 助手功能：文件分析、WIKI 知識庫、AI 聊天問答

---

## 2. 系統功能範圍

### 2.1 核心功能模組

| # | 功能模組 | 功能說明 |
|---|---------|---------|
| 1 | **用戶管理** | 帳號創建、角色設定（Admin / PM / Tech Lead / Developer / Tester）、JWT 認證與權限控制 |
| 2 | **項目管理** | 項目的 CRUD、成員管理與角色設定、項目狀態追蹤 |
| 3 | **需求管理** | 需求的 CRUD、附件上傳、狀態流轉（pending / in_progress / completed） |
| 4 | **任務管理** | 任務的 CRUD（可跨多個需求）、附件上傳、指派負責人、狀態流轉（pending / in_progress / testing / completed） |
| 5 | **缺陷管理** | 缺陷的 CRUD、關聯任務、嚴重程度（low / medium / high / critical）、狀態流轉（open / in_progress / resolved / closed） |
| 6 | **工作時數** | 工作時數登記（精確到小時，保留兩位小數）、可補填過往記錄、關聯任務或缺陷 |
| 7 | **報表** | 項目成本報表（各人員工時統計）、項目進度報表（完成百分比） |
| 8 | **AI 助手（後端已完成）** | Agent CRUD、任務認領/釋放、WebSocket 實時通信、Token 使用追蹤、Wiki 自動生成 |
| 9 | **AI 助手（待完成）** | LLM 配置、WIKI 知識庫、文件 AI 分析、AI 聊天問答（Streaming） |

### 2.2 已完成的系統組件

以下 Phase 1–4 已完成（參見 AI-AGENT.md Phase 1–4）：

- ✅ 數據模型擴展（User.isAgent、TokenLog、Task.claimedByAgentAt 等）
- ✅ Agent CRUD API、任務認領/釋放 API、Token 日誌 API
- ✅ WebSocket 實時通信運行時（心跳檢測、任務分配、Wiki 自動生成）
- ✅ 前端 Agent 管理頁面、項目 Kanban 看板、Agent 徽章顯示

### 2.3 待完成的系統組件

| Phase | 內容 | 說明 |
|-------|------|------|
| Phase 5 | LLM 配置 + Wiki | `llm_config` 表、Wiki CRUD、PostgreSQL 全文搜索、前端頁面 |
| Phase 6 | 文件解析 | mammoth / xlsx 解析、文件上傳 API、LLM 調用整合、自動建立 Wiki |
| Phase 7 | AI 聊天 | Streaming 回覆、RAG（Wiki 作為 Context）、聊天介面 |
| Phase 8 | 整合與 QA | 項目頁面內嵌 AI 查詢、QA 測試、文檔更新 |

---

## 3. 技術架構

### 3.1 技術棧

| 層面 | 技術 |
|------|------|
| 前端框架 | React 18 + Tailwind CSS + Vite |
| 後端框架 | Elysia.js（運行時：Bun） |
| 數據庫 | PostgreSQL 15 + Prisma ORM 7 |
| 認證 | JWT + Refresh Token |
| 實時通信 | WebSocket |
| 容器化 | Docker + Docker Compose |
| 報表 | Recharts |
| 文件存儲 | 本地磁盤（Docker Volume） |
| AI 整合 | OpenAI 兼容 API（自備 API Key） |

### 3.2 部署架構

```
┌─────────────────┐
│   用戶瀏覽器     │
│  (Chrome/Safari) │
└────────┬────────┘
                 │ HTTPS (Nginx Reverse Proxy)
┌────────▼────────┐
│      Nginx      │
│   Port 443      │
└────────┬────────┘
                 │
┌────────▼────────┐ ┌────────▼────────┐ ┌────────▼────────┐
│   React SPA     │ │  Elysia API    │ │  PostgreSQL    │
│   Port 3000     │ │  Port 4000     │ │   Port 5432    │
│                 │ │                │ │                │
│  - 登入/登出    │ │  - REST API    │ │  - 用戶/項目   │
│  - 項目管理     │ │  - JWT 認證    │ │  - 需求/任務   │
│  - 需求/任務    │ │  - 權限控制    │ │  - 缺陷/時數   │
│  - 缺陷管理     │ │  - AI 整合     │ │                │
│  - 報表         │ │                │ │                │
└────────────────┘ └────────────────┘ └─────────────────┘
```

### 3.3 安全設計

- **HTTPS**：反向代理層強制 TLS（Nginx）
- **認證**：JWT Access Token（15分鐘）+ Refresh Token（7天）+ bcrypt 密碼哈希
- **授權**：RBAC 角色權限控制，數據按權限過濾
- **SQL 注入防護**：Prisma ORM 參數化查詢
- **API Key 安全**：AES-256-GCM 加密儲存，記憶體中使用後即棄

---

## 4. AI Agent 功能詳情

### 4.1 Agent 作為虛擬團隊成員

系統中的 AI Agent 具備以下能力：

- **任務認領**：Agent 可像人一樣認領和完成任務
- **Token 替代工時**：使用 Token 而非工時計時，追蹤使用量與成本
- **WebSocket 實時通信**：每 30 秒心跳，保持連接，實時接收任務分配
- **Wiki 自動生成**：任務完成後自動生成執行紀錄 Wiki 頁面

### 4.2 AI 助手功能

| 功能 | 說明 |
|------|------|
| **LLM 配置** | 管理員配置 OpenAI 兼容 API Endpoint、API Key、模型 |
| **WIKI 知識庫** | 建立/編輯/全文搜索 Wiki 頁面，作為 AI 回答的 Context |
| **文件 AI 分析** | 上傳 Word / Markdown / Excel，AI 自動拆解需求和任務，建立 Wiki 頁面 |
| **AI 聊天問答** | 自然語言查詢項目數據，Streaming 逐字呈現，聊天記錄保存 |

### 4.3 數據模型關聯

```
User (isAgent = true)
├── Agent 配置 { model, maxConcurrentTasks, personality }
└── TokenLog（類似 WorkLog）
    ├── tokensUsed, inputTokens, outputTokens, model, costUSD
    └── 關聯 Task
```

---

## 5. 開發時程與估算

### 5.1 開發階段規劃

| 階段 | 主要內容 | 預估工期 |
|------|---------|---------|
| Phase 1：基礎架構 | 項目初始化、Docker Compose、數據庫遷移、用戶認證、用戶管理 | 1-2 週 |
| Phase 2：核心功能 | 項目 CRUD、成員管理、需求 CRUD（含附件）、任務 CRUD、缺陷 CRUD | 2-3 週 |
| Phase 3：工作流程 | 工作時數登記、狀態流轉、權限控制 | 2 週 |
| Phase 4：報表與優化 | 項目成本/進度報表、RWD 優化、測試與部署 | 1-2 週 |
| **Phase 5：LLM + Wiki** | `llm_config` 表 + API、Wiki CRUD、全文搜索、前端 | **1-1.5 週** |
| **Phase 6：文件解析** | mammoth / xlsx 解析、文件上傳 API、LLM 整合、Auto Wiki | **1-1.5 週** |
| **Phase 7：AI 聊天** | Streaming 回覆、RAG、聊天介面 | **1 週** |
| **Phase 8：整合 QA** | 項目頁面內嵌 AI、QA 測試、文檔更新 | **1 週** |

> **已報價範圍**：Phase 5–8（AI 助手功能）已完成核心架構，待實現 Phase 5–8 功能。Phase 1–4 若未完成，須另行估算。

### 5.2 交付里程碑

| 里程碑 | 交付內容 | 預估時間 |
|--------|---------|---------|
| M1 | Phase 5：LLM 配置 + Wiki 知識庫 | 第 1-2 週 |
| M2 | Phase 6：文件 AI 分析 | 第 2-3 週 |
| M3 | Phase 7：AI 聊天問答 | 第 3-4 週 |
| M4 | Phase 8：整合 QA 測試 + 文檔 | 第 4-5 週 |

---

## 6. 報價方案

### 6.1 服務範圍說明

本報價基於 **Phase 5–8** 的 AI 助手功能開發，包含以下交付物：

- Phase 5 至 Phase 8 的後端 API 與前端功能
- 代碼編寫、單元測試、API 測試
- 系統部署配置（Docker Compose）
- 操作手冊與 API 文檔更新

### 6.2 報價估算

> **說明**：以下為初步估算，具體費用根據實際需求會議後確定。

| 項目 | 說明 |
|------|------|
| **開發費用** | 待協商 |
| **部署費用** | 包含在開發費用內 |
| **後續維護** | 另行報價 |

### 6.3 付款條件

| 期次 | 觸發條件 | 付款比例 |
|------|---------|---------|
| 第一期 | 項目啟動 | 30% |
| 第二期 | M1 / M2 交付 | 30% |
| 第三期 | 最終交付與驗收 | 40% |

---

## 7. 假設條件與風險

### 7.1 假設條件

1. 貴公司已具備運行 Docker 的內部伺服器環境
2. LLM API（如 OpenAI）由貴公司提供或代為採購
3. 數據遷移（如有）由貴公司提供原始數據格式
4. 需求確認以本合同附件需求規格（SPEC.md）為準

### 7.2 風險提示

| 風險 | 緩解措施 |
|------|---------|
| LLM API 可用性依賴外部服務 | 提供 API Key 配置介面，支援多 API Endpoint |
| 大文件上傳影響系統效能 | 設定 5MB 檔案大小限制 |
| AI 回答品質依賴 Wiki Context 完整性 | 建議項目上線初期由 PM 補充 Wiki 內容 |
| Phase 1-4 若未完成，影響 Phase 5-8 整合 | 須確認基礎功能狀態，或一併報價 Phase 1-4 |

---

## 8. 聯絡方式

| 項目 | 內容 |
|------|------|
| 服務供應商 | （待填） |
| 專案經理 | （待填） |
| 聯絡郵箱 | （待填） |
| 報價日期 | 2026年5月 |

---

**附件清單**：
1. SPEC.md — 需求規格說明書
2. ARCHITECTURE.md — 系統架構文檔
3. API.md — API 接口文檔
4. AI-AGENT.md — AI Agent 功能規格

---

*本文件僅供提案使用，具體合作條款以正式合約為準。*