# PM System — 內部項目管理系統

公司內部使用的項目管理系統，支援多角色權限管理。

## 角色與功能

| 角色 | 說明 |
|------|------|
| **Admin** | 系統管理員，全部權限 |
| **PM** | 項目經理，管理項目、需求、成員 |
| **Developer** | 開發人員，檢視/更新任務、填寫工作日誌 |
| **Tester** | 測試人員，檢視/建立缺陷 |
| **Visitor** | 檢視報表（僅讀取） |
| **自定義角色** | AdminPanel 新增自定義角色，自訂權限組合 |

## 主要模組

- **項目管理** — 建立項目、加入成員、設定項目角色
- **需求管理** — 建立需求、設定優先級、追蹤狀態
- **任務與缺陷** — 工作時數記錄、缺陷追蹤
- **角色與權限** — RBAC 權限控制（顆粒度到 permission 等級）
- **AI 助手** — 自然語言操作項目數據（需求/缺陷/任務/Wiki 搜尋）
- **文件管理** — 上傳 Word/Excel/PDF 文件，自動解析內容
- **Wiki** — 項目 Wiki 文件，Markdown 編輯器
- **報表** — 項目進度、產出統計

## AI 助手

AI 助手是系統的智能助理，可以理解自然語言並執行操作。

### 功能

- **專案綁定** — 每個對話可以綁定到特定項目，操作該項目的數據
- **需求管理** — 自然語言建立、更新需求（"幫我新增一個高優先級需求"）
- **缺陷管理** — 自然語言建立、更新缺陷（"記錄一個 bug"）
- **任務管理** — 自然語言建立、查詢任務（"建立任務指派給張三"）
- **Wiki 搜尋** — 搜尋項目 Wiki 文件並總結內容（"幫我總結這個項目的需求"）
- **工具執行** — 所有操作都有明確的成功/失敗回饋

### 配置（Admin）

首次使用需要由 Admin 在「系統設定」配置 LLM API：

1. 以 Admin 身份登入
2. 進入「系統設定」
3. 填入 API URL 和 API Key，選擇模型
4. 儲存後 AI 助手即可使用

### 支援的模型

任何 OpenAI-compatible API endpoint 都支援，例如：
- OpenAI GPT-4o / GPT-4o-mini
- OpenRouter 上的模型（Claude、Gemma 等）
- 本地模型（Ollama）

## 快速開始（本地開發）

### 前置需求

- Docker & Docker Compose
- Bun（如需跑後端）
- Node.js 20+（如需跑前端）

### 啟動

```bash
git clone https://github.com/freedomw1987/pm-system.git
cd pm-system
docker compose up -d
```

打開 http://localhost:8080

### 預設帳號

| 帳號 | 密碼 | 角色 |
|------|------|------|
| admin@test.com | admin123 | Admin |
| pm@test.com | pm123 | PM |
| developer@test.com | dev123 | Developer |
| tester@test.com | tester123 | Tester |
| visitor@test.com | visitor123 | Visitor |

## 生產環境部署（VM）

### 前置需求

- Docker & Docker Compose 已安裝
- 網域已指向 VM IP
- Let's Encrypt 證書已配置（路徑：`/etc/letsencrypt/live/<domain>/`）
- PostgreSQL 資料庫已存在（可選，compose 會自建）

### 部署步驟

```bash
# 1. SSH 到 VM
ssh ubuntu@<vm-ip>

# 2. 拉取最新代碼
cd ~/projects/pm-system
git pull origin master

# 3. 設定環境變數
export JWT_SECRET=<your-jwt-secret>
export REFRESH_TOKEN_SECRET=<your-refresh-token-secret>

# 4. 構建並啟動
docker compose -f docker-compose.prod.yml up -d --build
```

### Nginx 配置

`nginx.conf` 已包含：
- SSL（HTTPS + HTTP/2）
- `/auth`、`/api` → backend
- `/` → frontend (SPA)
- `/uploads` → 靜態檔案
- Let's Encrypt 證書（`/etc/letsencrypt/live/pm.david-developer.com/`）

### 健康檢查

```bash
curl https://pm.david-developer.com/health
# 預期：200 OK
```

## 架構

```
┌─────────────────────────────────────┐
│           Nginx (443)               │
│   /auth → backend:4000              │
│   /api  → backend:4000              │
│   /     → frontend:80 (nginx)       │
│   /uploads → backend uploads        │
└─────────────────────────────────────┘
         │              │
    frontend:80     backend:4000
    (nginx alpine)    (Bun)
                          │
                     db:5432
                  (postgres:15)
```

- **Frontend** — React + Vite + Tailwind CSS，nginx serving static
- **Backend** — Bun + Elysia.js + Prisma + PostgreSQL
- **Database** — PostgreSQL 15
- **Auth** — JWT（access token + refresh token，7天過期）
- **AI** — OpenAI-compatible LLM API with tool calling

## 環境變數

| 變數 | 說明 | 必要 |
|------|------|------|
| `JWT_SECRET` | Access token 簽名密鑰 | ✅ |
| `REFRESH_TOKEN_SECRET` | Refresh token 簽名密鑰 | ✅ |
| `DATABASE_URL` | PostgreSQL 連線字串 | ✅（compose 已設定）|
| `UPLOAD_DIR` | 上傳檔案儲存目錄 | ✅ |

## 技術棧

| 層 | 技術 |
|----|------|
| Frontend | React 18 + Vite + Tailwind CSS + React Router |
| Backend | Bun + Elysia.js |
| ORM | Prisma |
| Database | PostgreSQL 15 |
| AI | OpenAI-compatible LLM API (tool calling) |
| Reverse Proxy | Nginx |
| Container | Docker + Docker Compose |

## 資料庫遷移

```bash
# 本地
docker compose exec backend bunx prisma migrate deploy

# 或互動式
docker compose exec backend bunx prisma studio
```

## 開發（不使用 Docker）

```bash
# Backend
cd backend
bun install
bunx prisma db push
bun src/index.ts  # port 4000

# Frontend（新terminal）
cd frontend
bun install
bun run dev       # port 5173
```

## License

Internal use only.