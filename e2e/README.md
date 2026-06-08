# PM System — E2E Tests (Playwright)

> **Status**: 2026-06-08 initial
> **Stack**: Playwright + real docker (frontend :8080 / backend :4001)

---

## 1. 點跑

```bash
# 1. 確保 docker 服務起咗
cd ~/www/pm-system
docker compose up -d

# 2. 確認 seed 完成
docker logs pm-system-backend-1 | grep "Seeding completed"

# 3. 跑 E2E
cd e2e
npm install           # 第一次
npx playwright install chromium
npx playwright test
```

## 2. 點解用 Playwright

- **Vite + Bun stack friendly**:Playwright 對現代 frontend 框架支援好
- **Auto-wait**:唔使手動 `waitForTimeout`,DOM ready 至 action
- **Trace on failure**:失敗自動留 trace,debug 容易
- **CLI / CI / headed 3 mode**:本地 dev + CI pipeline 同一份 spec

## 3. Critical Path

`tests/critical-path.spec.ts` 守住:
1. **API login** + 攞 JWT token
2. **建項目** (`POST /api/projects`)
3. **建需求** (`POST /api/requirements`)
4. **建任務** (`POST /api/tasks`, link 落需求)
5. **填工時** (`POST /api/worklogs`, 2.5 hours)
6. **UI render** — `GET /worklogs` 唔 crash
7. **UI login** — 表單 submit → redirect

**用途**: Production deploy 之前跑呢條做 smoke test(紅線 17)。

## 4. 環境

| 服務 | URL | 來源 |
|------|-----|------|
| Frontend | `http://localhost:8080` | docker nginx |
| Backend (direct) | `http://localhost:4001` | docker port mapping |
| Backend (via nginx) | `http://localhost:8080/api` | proxy_pass |
| DB | `localhost:5433` | docker port mapping |

**重要**:Backend 有 2 條 prefix:
- `/auth/*` — public(冇 `/api`)
- `/api/*` — protected(走 `Authorization: Bearer <token>`)

呢個係 source code 嘅 quirk(`auth.ts` 用 `.use(authRoutes)` 而其他走 `.group('/api')`),Playwright test 已經 handle。

## 5. 已守住嘅 US

- ✅ **US-2.1** 建項目
- ✅ **US-3.1** 建需求
- ✅ **US-4.1** 建任務
- ✅ **US-6.1** 填工時
- ✅ **US-1.1** UI login(部分 — 確認 form submit → redirect,未做 full RBAC matrix)

## 6. 已知 caveats

1. **Sequential execution** (`workers: 1`):所有 critical path share seeded admin user,parallel 會撞
2. **Hardcoded admin**:`admin@test.com / admin123` 嚟自 `backend/prisma/seed.ts`,改 seed 要同步
3. **No UI cleanup on failure**:如果 step 6 後面 fail,project 留喺 DB。要 `cleanupByName` helper 處理(已加)
4. **Token format 是 `userId:role`**(簡單 JWT-less),純 demo 用。生產應該用真 JWT signing

## 7. 下一步(下次 sprint 擴)

- [ ] **E2E 2 條 critical path + RBAC 負面 case**(普通 user 試 POST /projects 收到 403)
- [ ] **Fixtures**:用 `global-setup` 預先建 department / role
- [ ] **Visual regression**:加 screenshot baseline,UI 改動 surface 出嚟
- [ ] **Parallel workers**:當 fixtures 同 RBAC handle 好,可以 split 開
