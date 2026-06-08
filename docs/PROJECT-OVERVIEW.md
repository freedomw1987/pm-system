# PM System — Project Overview

> **Status**: Active development (v1.x, 2026-06)
> **Owner**: Internal IT / Project Management Office
> **Doc last updated**: 2026-06-08

---

## 1. 項目一句話

**公司內部項目管理系統** — 一個支援 RBAC、AI 助手、Wiki、文件解析嘅 Web App,畀 Admin / PM / Developer / Tester / 自定義角色用嚟管理項目、需求、任務、缺陷同工時。

---

## 2. 解決咩問題

公司做多個 project,傳統 Excel / email 管需求、bug、工時 越來越亂:
- 唔知邊個做緊咩 task
- 需求轉咗都唔知歷史
- 工時統計靠 PM 手動加
- 文件散佈 email / 雲盤,新人 onboard 痛苦

PM System 將呢啲統一喺一個地方,加埋 AI 助手用自然語言操作,降低使用門檻。

---

## 3. In-Scope (做)

| 模組 | 功能 |
|------|------|
| **項目管理** | 建項目、加成員、設項目角色 |
| **需求管理** | 建需求、優先級、狀態追蹤 |
| **任務管理** | 任務分派、認領、進度、Task Kanban |
| **缺陷追蹤** | Bug 上報、分派、嚴重程度、狀態 |
| **工時記錄** | WorkLog 計時,日報 / 月報 / 部門統計 |
| **RBAC** | 5 個內建角色 + AdminPanel 自定義角色,顆粒度到 permission key |
| **AI 助手** | 對話式操作需求/任務/Bug/Wiki 搜尋,文件解析,Vision LLM |
| **AI Agent** | Agent = User(特殊 user),自動認領任務,Token 計費 |
| **文件管理** | 上傳 Word/Excel/PDF,AI 自動解析內容 |
| **Wiki** | 項目 Wiki 頁,Markdown 編輯,tags |
| **報表** | 項目進度、產出、Token 用量 |
| **部門管理** | 部門分類,工時按部門篩選 |

## 4. Out-of-Scope (唔做)

- 外部客戶 / 廠商協作
- Code repo / CI 集成
- 即時通訊(用 Discord / Teams)
- 財務 / 報價 / 合約(由其他系統處理)
- Mobile native app(只 RWD web)

---

## 5. 角色 × 權限 (RBAC 速覽)

| 角色 | 默認權限 |
|------|---------|
| **Admin** | 全部 permission key |
| **PM** | 項目、需求、成員管理(own project) |
| **Tech Lead** | 任務分派、需求審批 |
| **Developer** | 睇 + 更新 own 任務、填 WorkLog |
| **Tester** | 睇 + 建 Bug |
| **自定義** | AdminPanel 自由組合 permission key |

詳細 permission key 見 `backend/src/utils/rbac.ts`。

---

## 6. 技術棧

### Backend
- **Runtime**: Bun 1.2
- **Framework**: Elysia.js
- **ORM**: Prisma 5.22
- **DB**: PostgreSQL 16
- **Auth**: JWT (access + refresh)
- **AI**: LLM adapter (OpenAI-compatible) + Vision LLM
- **Real-time**: WebSocket (Agent task monitoring)

### Frontend
- **Build**: Vite + React 18 + TypeScript
- **Styling**: Tailwind CSS
- **Routing**: React Router v7
- **State**: React Context (Auth) + TanStack Query
- **Editor**: Markdown (Wiki), RichText (需求 / 缺陷描述)

### Infra
- **Container**: Docker + docker-compose
- **Reverse Proxy**: nginx (SPA fallback,static asset caching)
- **Reverse Proxy for API**: nginx `/api` → backend:4000
- **DB Migrations**: `prisma migrate deploy` on container start

---

## 7. 部署拓樸

```
[Browser]
   ↓
[nginx :80/443] ← static SPA + /api proxy
   ↓
[frontend container :80]
   ↓
[backend container :4000] ← Elysia + Prisma
   ↓
[postgres :5432] (named volume)
```

- Dev: `docker compose up`,DB 用本地 PG
- Prod: AWS ECS Fargate + RDS(待定)

---

## 8. 目錄結構

```
pm-system/
├── backend/           # Elysia + Prisma
│   ├── src/
│   │   ├── agent/     # AI Agent runtime
│   │   ├── routes/    # 19 個 endpoint modules
│   │   ├── middleware/ # auth + permission
│   │   └── utils/     # prisma client, rbac
│   ├── prisma/        # schema + migrations
│   └── Dockerfile
├── frontend/          # Vite + React
│   ├── src/
│   │   ├── pages/     # 18 個 page
│   │   ├── components/
│   │   ├── context/   # AuthContext
│   │   └── utils/     # api.ts, permissions.ts
│   └── Dockerfile
├── docs/              # 📍 本目錄
│   ├── PROJECT-OVERVIEW.md   ← 你而家睇緊呢份
│   ├── PRD.md
│   ├── ARCHITECTURE.md
│   ├── API.md
│   ├── AI-AGENT.md
│   ├── TEST-COVERAGE.md
│   ├── TECH-DEBT.md
│   ├── QA-TRACKER.md
│   ├── REGRESSION-GUARD.md
│   ├── architecture/  # ADR
│   └── retros/        # Sprint 復盤
├── docker-compose.yml
├── nginx.conf
└── README.md
```

---

## 9. 環境

| 環境 | URL | DB | 用途 |
|------|-----|-----|------|
| Local dev | http://localhost | docker compose | 開發 |
| Staging | (待定) | (待定) | QA 驗證 |
| Production | (待定) | (待定) | 正式上線 |

環境變數:`.env.example` 提供 template。

---

## 10. 重要決策 (索引)

詳細 ADR 喺 `docs/architecture/`:
- `0001-bun-elysia-backend.md` — 用 Bun + Elysia 唔用 Node + Express
- `0002-prisma-5-pg.md` — Prisma 5.22 喺 PG 嘅設定
- `0003-ai-agent-as-user.md` — Agent = User(用 `isAgent` flag)嘅設計

---

## 11. 相關文件

| 想知道... | 睇 |
|----------|-----|
| 點用 | `README.md` |
| API 點 call | `API.md` |
| AI Agent 點運作 | `AI-AGENT.md` |
| User Story / 需求 | `PRD.md` |
| 架構圖 | `ARCHITECTURE.md` |
| QA 進度 | `QA-TRACKER.md` |
| 測試覆蓋 | `TEST-COVERAGE.md` |
| 技術債 | `TECH-DEBT.md` |
| 已修 bug | `REGRESSION-GUARD.md` |
