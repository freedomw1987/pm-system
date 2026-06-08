# ADR 0002: Prisma 5.22 + PostgreSQL 16 作為數據層

- **Status**: Accepted
- **Date**: 2026-06-08

## Context

PM System 需要 persistent storage:
- 18 個 models (User, Project, Requirement, Task, Bug, WorkLog, ...)
- 關係複雜(ProjectMember, TaskParticipant, TaskRequirement 等等多對多)
- 需要 migration tool
- 需要 transaction 支援

候選:Prisma 5.22 / Drizzle / Kysely / TypeORM / raw pg。

## Decision

用 **Prisma 5.22.0 + PostgreSQL 16**。

## Rationale

1. **Type-safe client**:`prisma generate` 出 fully-typed client,IDE autocomplete 完整。
2. **Migration tool**: `prisma migrate dev` / `migrate deploy` 內建,SQL 文件 version control。
3. **關係表達**:Prisma schema 用直觀 relation syntax,多對多、self-relation 都 OK。
4. **JSON 欄位**:`Json` type 直接 map,frontend 唔使 parse string。
5. **Array 欄位**(PG 獨有):`String[]` 用嚟存 Wiki tags、Permission list。

## Alternatives Considered

### Drizzle
- **Pros**: 更輕,SQL-like syntax
- **Cons**: Migration tool 較新,JSON / Array 支援冇 Prisma 咁成熟
- **Why not**: 18 個 models 嘅項目用 Drizzle migration 太冒險

### Kysely
- **Pros**: Type-safe query builder
- **Cons**: 唔係 ORM,raw SQL 仲係要寫
- **Why not**: 團隊希望少啲 SQL boilerplate

### Prisma 7.x
- **Why not**: 2026-06 試過 `prisma@latest` 拉到 7.x,`url = env(...)` 唔再 work,要搬去 `prisma.config.ts` + driver adapter。**Stick with 5.22** for stability。

## Schema Decisions

- **User.role**: `String` 唔係 enum — 支援自定義角色(dynamic),Prisma typed enum 會撞牆
- **Permission**: 獨立 table,`String[]` 存 permission keys
- **JSON fields**: `LLMConfig.apiKey` encrypted,`User.agentConfig` JSON
- **Soft delete**: 全部 hard delete + `createdAt` audit;冇 `deletedAt`

## Consequences

### Positive
- Schema 改動自動 produce migration
- `prisma studio` 可以 GUI 睇 DB
- Bun + Prisma 已驗證 work(2026-06 production)

### Negative
- Prisma binary engine Dockerfile 要 `openssl`
- Migration 名要 `YYYYMMDDhhmmss_name`,sort 敏感(手動建要留意)

## References

- `backend/prisma/schema.prisma` — 18 models
- `backend/prisma.config.ts` — 5.22 風格
- 2026-06-06 經驗:`prisma 7 唔啱 SQLite,stick with 5.22`
