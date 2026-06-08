# ADR 0001: Bun + Elysia 作為 Backend Runtime

- **Status**: Accepted
- **Date**: 2026-06-08
- **Deciders**: PMO + IT Lead

## Context

公司要起內部 PM System,backend 要支援:
- JWT auth + RBAC middleware
- WebSocket (Agent real-time)
- Prisma ORM
- LLM API integration

傳統選擇:Node.js + Express / Fastify / NestJS。
新興選擇:Bun + Elysia / Hono。

## Decision

用 **Bun 1.2 runtime + Elysia.js framework**。

## Rationale

1. **Performance**:Bun 啟動 ~10x 快過 Node,Elysia 路由 validation 內建(免裝 zod middleware)。
2. **DX**:`bun --watch` 內建 hot reload,`bun install` 極快,`bun:test` 內建。
3. **TypeScript native**:Bun 直接跑 `.ts`,免 `tsx` / `ts-node`。
4. **WebSocket**:Elysia 內建 WS plugin,同 REST 共用 type system。
5. **Prisma 兼容**:Prisma 5.22 + `@prisma/client` 已驗證可喺 Bun 跑(需 `bunfig.toml` 加 `bun = true`)。

## Alternatives Considered

### Node.js + Express
- **Pros**: 生態最熟,library 多
- **Cons**: TS 配置煩(需要 tsx),middleware 驗證要手寫,啟動慢
- **Why not**: 2026 年新項目無必要再用舊 stack

### Node.js + Hono
- **Pros**: 同 Elysia 類似,輕量,edge-friendly
- **Cons**: 冇 Elysia 嘅 plugin ecosystem (Eden Treaty 客戶端 type-safe)
- **Why not**: Elysia 嘅 type-safety 較完整

### Deno + Fresh
- **Pros**: 同 Bun 類似
- **Cons**: 公司冇 Deno 經驗,Prisma Deno support 仲 experimental
- **Why not**: Risk 高

## Consequences

### Positive
- 開發體驗好,hot reload 快
- 路由 + validation 內建,少咗 zod boilerplate
- WebSocket 同 REST 共用 type

### Negative
- Bun 仲新,某啲 native module 可能唔 work(2026-06 實戰:Prisma binary engine 要 Dockerfile 加 openssl)
- Production runtime 仲未 Node 咁 battle-tested
- 部分 npm 庫可能 issue(rolldown binding 等)

### Mitigation
- Dockerfile bake-in `openssl` + `ca-certificates`
- Production 部署前必跑 smoke test
- 保留 fallback path:同一份 code 可喺 Node 跑(Bun 兼容 Node API)

## References

- `backend/src/index.ts` — Elysia app entry
- `backend/Dockerfile` — Bun runtime + openssl
- `package.json` 嘅 `"scripts": { "dev": "bun --watch run src/index.ts" }`
