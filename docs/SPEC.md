# 項目管理系統 (PM System)

## 1. 項目概述

| 項目 | 內容 |
|------|------|
| 系統名稱 | Internal PM System |
| 用戶規模 | ~50 人 |
| 部署環境 | 公司內部 Server（Docker） |
| 認證方式 | Email + Password（管理員創建） |

## 2. 用戶角色

| 角色 | 主要職責 |
|------|---------|
| **項目經理/產品經理** | 管理項目及需求 |
| **開發技術主管** | 根據需求拆解任務，安排開發人員 |
| **開發人員** | 處理任務，更新狀態，登記工作時數 |
| **測試人員** | 提交缺陷，修復後驗證，登記工作時數 |
| **管理員** | 帳號管理、權限管理、報表查看 |

### 角色特性

- **多人角色**：每個用戶可以有多個角色，不同項目中角色可能不同
- **數據可見性**：
  - 項目經理：只看到自己負責的項目
  - 開發人員：只看到被指派的任務

## 3. 核心功能

### 3.1 項目管理
- 創建/編輯/刪除項目
- 設置項目成員及角色
- 項目狀態追蹤

### 3.2 需求管理
- 創建/編輯/刪除需求
- 需求可附帶附件
- 需求狀態：pending / in_progress / completed

### 3.3 任務管理
- 技術主管根據需求拆解任務
- 任務可跨多個需求（多對多關係）
- 任務可附帶附件
- 指派給開發人員
- 狀態：pending / in_progress / testing / completed

### 3.4 缺陷管理
- 測試人員提交缺陷
- 關聯到具體任務
- 缺陷狀態：open / in_progress / resolved / closed
- 嚴重程度：low / medium / high / critical

### 3.5 工作時數
- 每次登記（任務完成後）或每天登記
- 可補填過往記錄
- 精確到小時，保留兩位小數（0.25 = 15分鐘）
- 可關聯任務或缺陷

### 3.6 報表
- **項目成本報表**：各人員工作時數統計
- **項目進度報表**：完成進度百分比

### 3.7 AI 助手
- **LLM 配置**（Admin）— OpenAI 兼容 API，支援任意模型
- **Wiki 知識庫** — 建立/編輯/搜索 wiki 頁面，作為回答的 context
- **文件 AI 分析** — 上傳 Word/Markdown/Excel，AI 自動拆解需求和任務，建立 wiki 頁面
- **AI 聊天問答** — 自然語言查詢項目數據，streaming 回覆

## 4. 權限矩陣

| 功能 | Admin | PM | Tech Lead | Developer | Tester |
|------|-------|-----|-----------|-----------|--------|
| 管理用戶 | ✅ | ❌ | ❌ | ❌ | ❌ |
| 創建項目 | ✅ | ✅ | ❌ | ❌ | ❌ |
| 刪除項目 | ✅ | ❌ | ❌ | ❌ | ❌ |
| 創建需求 | ✅ | ✅ | ❌ | ❌ | ❌ |
| 創建任務 | ✅ | ❌ | ✅ | ❌ | ❌ |
| 指派任務 | ✅ | ❌ | ✅ | ❌ | ❌ |
| 更新任務 | ✅ | ❌ | ✅ | ✅ | ❌ |
| 提交缺陷 | ✅ | ❌ | ❌ | ❌ | ✅ |
| 修復缺陷 | ✅ | ❌ | ✅ | ✅ | ❌ |
| 登記時數 | ✅ | ❌ | ✅ | ✅ | ✅ |
| 查看報表 | ✅ | ✅ | ❌ | ❌ | ❌ |

## 5. 技術架構

| 層面 | 技術 |
|------|------|
| 前端 | React 18 + Tailwind CSS + Vite |
| 後端 | Elysia.js (Bun) |
| 數據庫 | PostgreSQL 15 |
| 認證 | JWT + Refresh Token |
| 容器 | Docker + Docker Compose |
| 報表 | Recharts |
| 文件存儲 | 本地磁盤（Docker Volume） |

## 6. 開發階段

### Phase 1：基礎架構（1-2 週）
- [ ] 項目初始化（React + Elysia.js + PostgreSQL）
- [ ] Docker Compose 編排
- [ ] 數據庫遷移（Migrations）
- [ ] 用戶認證（JWT）
- [ ] 用戶管理（Admin）

### Phase 2：核心功能（2-3 週）
- [ ] 項目 CRUD
- [ ] 項目成員管理（按項目角色）
- [ ] 需求 CRUD（含附件）
- [ ] 任務 CRUD（含跨需求）
- [ ] 缺陷 CRUD

### Phase 3：工作流程（2 週）
- [ ] 工作時數登記
- [ ] 任務狀態流轉
- [ ] 缺陷狀態流轉
- [ ] 權限控制（各角色）

### Phase 4：報表與優化（1-2 週）
- [ ] 項目成本報表
- [ ] 項目進度報表
- [ ] RWD 優化
- [ ] 測試與部署

**總計：6-9 週**

## 7. 環境配置

| 環境 | 用途 |
|------|------|
| Development | 本地開發 |
| Production | 公司內部伺服器 |

### 環境變量

```env
# Backend
DATABASE_URL=postgresql://user:password@localhost:5432/pm_system
JWT_SECRET=your-secret-key
REFRESH_TOKEN_SECRET=your-refresh-secret
UPLOAD_DIR=/app/uploads

# Frontend
VITE_API_URL=http://localhost:4000
```