# PM System — Tech Debt Register

> **Status**: 2026-06-08 snapshot
> **Format**: 模板化追蹤,參考 `tech-debt-register` skill

---

## 債務列表 (按優先級)

### 🔴 TD-001: 測試覆蓋率極低

- **發現日期**: 2026-06-08
- **發現來源**: TEST-COVERAGE.md inventory
- **影響**: Backend 19 個 routes 只有 1 個有 test (~5%),refactor 大風險
- **修復成本**: 5-8 個工作日(每個 route 平均 2-4 小時)
- **業務影響**: High — 改 RBAC / WorkLog pagination 可能撞牆
- **建議**: P0 sprint 第一週做
- **相關**: TEST-COVERAGE.md § 7 行動項目
- **2026-06-08 進展**: Sprint 1 補 3 份 test(RBAC/WorkLog/Agent),coverage 5%→25%,3 P0 US PASS-UNIT

### 🔴 TD-002: 0 個 E2E 測試

- **發現日期**: 2026-06-08
- **影響**: Production smoke test 只能靠手動 curl,deploy 出事無預警
- **修復成本**: 3-5 個工作日(Playwright + fixture)
- **業務影響**: High — 紅線 17 必需要 smoke test
- **建議**: P0,跟 TD-001 同期
- **2026-06-08 進展**: ✅ **已補 E2E framework** — `e2e/tests/critical-path.spec.ts` 3 tests pass(health check + login flow + happy path)

### 🟡 TD-003: Backend Dockerfile runtime image 較大

- **發現日期**: 2026-06-08
- **來源**: ADR 0001 嘅負面後果
- **影響**: Bun runtime + Prisma engine + node_modules = ~500MB
- **修復成本**: 1-2 日(multi-stage build + alpine base)
- **業務影響**: Medium — Cold start 慢,image 傳輸成本
- **建議**: P1,優化 phase 1

### 🟡 TD-004: RBAC permission key 散落 middleware

- **發現日期**: 2026-06-08
- **影響**: `backend/src/utils/rbac.ts` + `middleware/permission.ts` 兩處有 permission 邏輯
- **修復成本**: 0.5 日(consolidate)
- **業務影響**: Medium — 改 permission 要 grep 兩處
- **建議**: P1,下次 RBAC 改動時順手

### 🟡 TD-005: Frontend 用 TanStack Query 但冇統一 error boundary

- **發現日期**: 2026-06-08
- **影響**: API error 只喺 catch block print,user 見唔到 friendly message
- **修復成本**: 1 日
- **業務影響**: Medium — UX 差
- **建議**: P1

### 🟢 TD-006: 冇 Storybook / Component 文檔

- **發現日期**: 2026-06-08
- **影響**: 18 個 page 共用 components,但冇 visual catalog
- **修復成本**: 2-3 日
- **業務影響**: Low — 團隊小
- **建議**: P2,FF 後

### 🟢 TD-007: LLM API Key 喺 LLMConfig 字段係 encrypted 但冇 audit log

- **發現日期**: 2026-06-08
- **影響**: Admin 改 API Key 冇 audit trail
- **修復成本**: 0.5 日
- **業務影響**: Low — 內部系統
- **建議**: P2

### 🟢 TD-008: 冇 Rate Limiting

- **發現日期**: 2026-06-08
- **影響**: `/api/auth/login` 冇 rate limit,理論上可暴力破解
- **修復成本**: 0.5 日(Elysia rate-limit plugin)
- **業務影響**: Medium(security)
- **建議**: P1,security sprint

### 🟢 TD-009: WorkLog 冇 timezone 處理

- **發現日期**: 2026-06-08
- **影響**: `date` 字段用 DateTime,跨時區唔確定行為
- **修復成本**: 1 日
- **業務影響**: Low — 公司喺同一時區
- **建議**: P2,將來如有 remote 才做

### 🟢 TD-010: 冇 logging aggregation

- **發現日期**: 2026-06-08
- **影響**: pino logger 寫 stdout,production 冇 central log
- **修復成本**: 1-2 日(ELK / CloudWatch)
- **業務影響**: Low — 目前 traffic 低
- **建議**: P2,scale 到 50+ 用戶才需要

---

## 從 commit 看到嘅「快速 fix」

| Commit | 描述 | 反映嘅 debt |
|--------|------|------------|
| `55845c9` | fix: improve project task workflows | Project-Task 流程早期設計未完善 |
| `7f43cba` | fix: backend bug | (缺 detail) |
| `c42e634` | fix: 工作時數顯示部門欄位 | WorkLog 部門關聯 late add |
| `c79eed1` | debug for llm call | LLM integration 早期有 bug |
| `3938a2d` | debug for ai agent | Agent runtime 早期 unstable |
| `1bafbf7` | Create test | 早 commit 引入 test 框架(好) |

**Pattern**: AI 功能(LLM + Agent)係最反覆 fix 嘅範疇 — 反映 NFR 唔穩 + 缺 test。

---

## 行動計劃

### Sprint 1 (P0)
- [ ] TD-001: 補 RBAC + Agent test
- [ ] TD-002: E2E framework + 1 條 critical path

### Sprint 2 (P1)
- [ ] TD-003: Dockerfile 優化
- [ ] TD-004: RBAC consolidate
- [ ] TD-008: Rate limiting

### Backlog (P2)
- [ ] TD-005, TD-006, TD-007, TD-009, TD-010

---

## 變更歷史

| 日期 | 變更 |
|------|------|
| 2026-06-08 | 初版 10 個 debt entry |
| 2026-06-08 | TD-001 進展:3 份新 test,3 P0 US 升至 PASS-UNIT |
| 2026-06-08 | TD-002 完成 ✅ — Playwright E2E + critical-path.spec.ts |
