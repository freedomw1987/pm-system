# 系統架構文檔

## 1. 系統架構圖

```
                        ┌─────────────────┐
                        │   用戶瀏覽器     │
                        │   (Chrome/Safari)│
                        └────────┬────────┘
                                 │ HTTPS (self-signed)
                        ┌────────▼────────┐
                        │      Nginx       │
                        │  (Reverse Proxy) │
                        │   Port 443       │
                        └────────┬────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                  │
     ┌────────▼────────┐ ┌──────▼────────┐ ┌──────▼────────┐
     │   React SPA      │ │  Elysia API    │ │  PostgreSQL   │
     │   Port 3000      │ │  Port 4000     │ │   Port 5432   │
     │                  │ │              │ │               │
     │ - 登入/登出      │ │ - REST API    │ │ - 用戶        │
     │ - 項目管理       │ │ - JWT 認證    │ │ - 項目        │
     │ - 需求/任務      │ │ - 業務邏輯    │ │ - 需求        │
     │ - 缺陷管理       │ │ - 權限控制    │ │ - 任務        │
     │ - 工作時數       │ │              │ │ - 缺陷        │
     │ - 報表           │ │              │ │ - 工作時數    │
     └──────────────────┘ └──────────────┘ └───────────────┘
```

## 2. 技術棧

| 層面 | 技術 | 版本 |
|------|------|------|
| 前端框架 | React | 18.x |
| UI 庫 | Tailwind CSS | 4.x |
| 構建工具 | Vite | 8.x |
| 後端框架 | Elysia.js | 1.x |
| 運行時 | Bun | 1.x |
| 數據庫 | PostgreSQL | 15.x |
| ORM | Prisma | 7.x |
| 認證 | JWT | - |
| 反向代理 | Nginx | - |
| 容器 | Docker | - |

## 3. 目錄結構

```
pm-system/
├── docs/                 # 項目文檔
│   ├── SPEC.md          # 需求規格
│   ├── ARCHITECTURE.md  # 架構文檔
│   └── API.md           # API 文檔
├── frontend/            # React 前端
│   ├── src/
│   │   ├── components/  # 可复用組件
│   │   ├── pages/      # 頁面
│   │   ├── hooks/      # 自定義 Hooks
│   │   ├── context/    # React Context
│   │   ├── types/      # TypeScript 類型
│   │   └── utils/      # 工具函數
│   ├── public/          # 靜態資源
│   ├── package.json
│   └── vite.config.ts
├── backend/             # Elysia.js 後端
│   ├── src/
│   │   ├── routes/     # API 路由
│   │   ├── middleware/ # 中間件
│   │   ├── services/   # 業務邏輯
│   │   └── utils/     # 工具函數
│   ├── prisma/         # 數據庫 schema
│   └── package.json
├── infra/               # 基礎設施
│   └── docker-compose.yml
└── docker/              # Docker 配置
```

## 4. 數據模型

### 4.1 ER Diagram

```
┌────────────┐       ┌─────────────────┐       ┌────────────┐
│   User     │       │  ProjectMember  │       │  Project   │
│            │       │                 │       │            │
│ id         │◄──────│ user_id        │       │ id         │
│ email      │       │ project_id      │──────►│ name       │
│ name       │       │ role            │       │ status     │
│ password   │       └─────────────────┘       │ created_at │
│ created_at │                                   └────────────┘
└────────────┘                                        │
       │                                              │
       │                                    ┌─────────▼─────────┐
       │                                    │   Requirement     │
       │                                    │                   │
       │                                    │ id                │
       │                                    │ project_id        │
       │                                    │ title             │
       │                                    │ status            │
       │                                    └─────────┬─────────┘
       │                                              │
       │                                    ┌─────────▼─────────┐
       │                                    │      Task         │
       │                                    │                   │
       │                                    │ id                │
       │                                    │ title             │
       │                                    │ assignee_id       │
       │                                    │ status            │
       │                                    └─────────┬─────────┘
       │                                              │
       │                              ┌───────────────┼───────────────┐
       │                              │               │               │
┌──────▼──────┐              ┌────────▼───────┐ ┌─────▼─────┐ ┌──────▼──────┐
│  WorkLog    │              │  TaskRequirement │ │    Bug   │ │  WorkLog    │
│  (Task)     │              │   (many-to-many) │ │          │ │  (Bug)      │
│ id          │              └─────────────────┘ │ id        │ │ id          │
│ user_id     │                                │ task_id   │ │ user_id     │
│ task_id     │                                │ status    │ │ bug_id      │
│ hours       │                                └───────────┘ │ hours       │
│ date        │                                              └──────────────┘
│ note        │
└─────────────┘
```

### 4.2 核心表結構

詳見 `prisma/schema.prisma`

## 5. API 設計

### 5.1 認證 API

| 方法 | 端點 | 描述 |
|------|------|------|
| POST | /api/auth/login | 用戶登入 |
| POST | /api/auth/logout | 用戶登出 |
| POST | /api/auth/refresh | 刷新 Token |

### 5.2 用戶管理（Admin）

| 方法 | 端點 | 描述 |
|------|------|------|
| GET | /api/users | 用戶列表 |
| POST | /api/users | 創建用戶 |
| GET | /api/users/:id | 用戶詳情 |
| PUT | /api/users/:id | 更新用戶 |
| DELETE | /api/users/:id | 刪除用戶 |

### 5.3 項目管理

| 方法 | 端點 | 描述 |
|------|------|------|
| GET | /api/projects | 項目列表（按權限過濾）|
| POST | /api/projects | 創建項目（PM/Admin）|
| GET | /api/projects/:id | 項目詳情 |
| PUT | /api/projects/:id | 更新項目 |
| DELETE | /api/projects/:id | 刪除項目（Admin）|

### 5.4 需求管理

| 方法 | 端點 | 描述 |
|------|------|------|
| GET | /api/projects/:id/requirements | 需求列表 |
| POST | /api/projects/:id/requirements | 創建需求 |
| PUT | /api/requirements/:id | 更新需求 |
| DELETE | /api/requirements/:id | 刪除需求 |

### 5.5 任務管理

| 方法 | 端點 | 描述 |
|------|------|------|
| GET | /api/tasks | 任務列表（只返回指派的）|
| POST | /api/tasks | 創建任務 |
| GET | /api/tasks/:id | 任務詳情 |
| PUT | /api/tasks/:id | 更新任務 |
| DELETE | /api/tasks/:id | 刪除任務 |

### 5.6 缺陷管理

| 方法 | 端點 | 描述 |
|------|------|------|
| GET | /api/bugs | 缺陷列表 |
| POST | /api/bugs | 創建缺陷 |
| PUT | /api/bugs/:id | 更新缺陷 |
| DELETE | /api/bugs/:id | 刪除缺陷 |

### 5.7 工作時數

| 方法 | 端點 | 描述 |
|------|------|------|
| GET | /api/worklogs | 工作時數列表 |
| POST | /api/worklogs | 創建工作時數 |
| PUT | /api/worklogs/:id | 更新工作時數 |
| DELETE | /api/worklogs/:id | 刪除工作時數 |

### 5.8 報表

| 方法 | 端點 | 描述 |
|------|------|------|
| GET | /api/reports/cost | 項目成本報表 |
| GET | /api/reports/progress | 項目進度報表 |

### 5.9 附件

| 方法 | 端點 | 描述 |
|------|------|------|
| POST | /api/attachments/upload | 上傳附件 |
| GET | /api/attachments/:id | 下載附件 |
| DELETE | /api/attachments/:id | 刪除附件 |

## 6. 安全設計

### 6.1 認證
- JWT Access Token（15分鐘有效期）
- Refresh Token（7天有效期）
- 密碼使用 bcrypt 哈希（鹽值自動生成）

### 6.2 授權
- 基於角色的權限控制（RBAC）
- 每個項目獨立設置成員角色
- 數據訪問按權限過濾

### 6.3 數據保護
- HTTPS（self-signed 測試）
- SQL 注入防護（Prisma ORM）
- XSS 防護（React 自動轉義）

## 7. 部署架構

### 7.1 Docker Compose 結構

```yaml
services:
  nginx:
    image: nginx:latest
    ports:
      - "443:443"
    volumes:
      - ./docker/nginx.conf:/etc/nginx/nginx.conf
      - ./docker/certs:/etc/nginx/certs
    depends_on:
      - frontend
      - backend

  frontend:
    build:
      context: ./frontend
    ports:
      - "3000:3000"
    environment:
      - VITE_API_URL=http://backend:4000

  backend:
    build:
      context: ./backend
    ports:
      - "4000:4000"
    environment:
      - DATABASE_URL=postgresql://postgres:postgres@db:5432/pm_system
      - JWT_SECRET=${JWT_SECRET}
      - UPLOAD_DIR=/app/uploads
    volumes:
      - uploads:/app/uploads
    depends_on:
      - db

  db:
    image: postgres:15
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_DB=pm_system
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  uploads:
  postgres_data:
```

### 7.2 Nginx 配置

- HTTPS reverse proxy
- SPA fallback（React Router）
- 上傳大小限制（50MB）

## 8. 開發規範

### 8.1 Git 規範
- main: 生產代碼
- develop: 開發分支
- feature/*: 功能分支

### 8.2 代碼規範
- 前端：ESLint + Prettier
- 後端：TypeScript strict mode
- 提交信息：Conventional Commits

### 8.3 測試策略
- 單元測試：Jest / Vitest
- API 測試：Supertest
- E2E 測試：Playwright