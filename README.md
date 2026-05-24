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

## 主要模組

- **項目管理** — 建立項目、加入成員、設定項目角色
- **需求管理** — 建立需求、設定優先級、追蹤狀態
- **任務與缺陷** — 工作時數記錄、缺陷追蹤
- **角色與權限** — RBAC 權限控制（顆粒度到 permission 等級）
- **報表** — 項目進度、產出統計

## 快速開始（本地開發）

### 前置需求

- Docker & Docker Compose
- Node.js 20+（如需單獨跑前端）
- Bun（如需跑後端）

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
npm install
npm run dev       # port 5173
```

## License

Internal use only.