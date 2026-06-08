# PM-System — Client Release Changelog

客戶交付嘅版本歷史。每個 release 對應一個 git tag。

---

## v1.0.0 — 2026-06-09(Initial client release)

### First release
- Multi-arch image:**linux/amd64 + linux/arm64** (per-arch tarball, install.sh 自動偵測 uname -m 揀合 arch 嗰個 load)
- Frontend:nginx-alpine static SPA
- Backend:Bun + Elysia + Prisma 7 + PostgreSQL 15
- 內置 migrations(用 `prisma migrate deploy`):
  - `20260521053128_init`
  - `20260601000000_task_participants_subtasks`
  - **`20260609000000_sync_schema_to_v2` ← 新加**(補返 2026-05-21 init 之後用 db push 改過嘅 schema)
- **會跑 seed**(`bun prisma/seed.ts`):
  - 5 個 built-in user:admin@/pm@/techlead@/dev@/tester@test.com(密碼見 `prisma/seed.ts`)
  - 1 個 AI agent:`agent-dev1@test.com` / `agent123`
  - 1 個 sample project「範例項目」+ members + requirements + tasks + bugs

### Files shipped
- `pm-system-frontend-v1.0.0-amd64.tar`
- `pm-system-frontend-v1.0.0-arm64.tar`
- `pm-system-backend-v1.0.0-amd64.tar`
- `pm-system-backend-v1.0.0-arm64.tar`
- `docker-compose.client.yml`
- `.env.client.example`
- `install.sh`
- `CHECKSUMS.sha256`
- `RELEASE-NOTES.md`

### Install
詳見 `install.sh`(客戶跑呢個一鍵裝,1 個 command + 0 個 source file)。

### Default login (from seed)
| Email | Password | Role |
|-------|----------|------|
| admin@test.com | admin123 | admin |
| pm@test.com | pm123 | pm |
| techlead@test.com | tl123 | tech_lead |
| dev@test.com | dev123 | developer |
| tester@test.com | test123 | tester |
| agent-dev1@test.com | agent123 | developer (AI agent) |

### Known issue (release-blocking 已修)
- 2026-05-21 init migration 之後,項目用 `prisma db push` 改咗 8 個 table + 6 個 column,**冇 fold back 落 migration**。客戶機 `migrate deploy` 會 fail。**已修**:`20260609000000_sync_schema_to_v2` migration 加返所有缺 column / 缺 table / 缺 FK。
