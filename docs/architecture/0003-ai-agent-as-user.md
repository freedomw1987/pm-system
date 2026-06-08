# ADR 0003: AI Agent = User (isAgent flag)

- **Status**: Accepted
- **Date**: 2026-06-08

## Context

PM System 嘅 AI Agent 唔係純聊天助手,而係**虛擬團隊成員** — 要:
- 出現喺項目成員列表
- 認領任務
- 有工作量(token 計費)
- 共享 RBAC

如果 Agent 係獨立 entity,就要寫好多 bridge logic(Agent 認領 task = 「AgentID 喺 Task.claimedByAgent 欄」,UI 要 join,permission 要特殊處理)。

## Decision

用 **`User.isAgent: Boolean` flag** 將 Agent 表達成「特殊 User」,加 `agentConfig: Json` 存 LLM 設定。

## Rationale

1. **統一 member 模型**:Agent 自動出現喺 `ProjectMember` 列表,同人同樣邏輯。
2. **Task 認領機制一樣**:Task 加 `claimedByAgentAt: DateTime?` 標記,`assigneeId` 直接用 Agent 嘅 User ID。
3. **Permission 共享**:Agent 喺 RBAC 系統同 user 完全一樣,後端唔使分。
4. **工作量統一**:TokenLog 對應 WorkLog,`userId` 指向 Agent user,UI 唔使改。
5. **少寫 code**:冇 `Agent` table,join 全部沿用 `User`。

## Schema 變更

```prisma
model User {
  // ... existing fields
  isAgent      Boolean  @default(false) @map("is_agent")
  agentConfig  Json?    @map("agent_config")
  // { model, maxConcurrentTasks, personality }
}

model Task {
  // ... existing fields
  claimedByAgentAt DateTime?  // Agent 認領時間
}

model TokenLog {
  // 類似 WorkLog,但存 token usage
  id           String
  userId       String    // ← Agent user ID
  taskId       String?
  tokensUsed   Int
  inputTokens  Int?
  outputTokens Int?
  model        String
  costUSD      Decimal?
}
```

## Alternatives Considered

### 獨立 `Agent` table + foreign key
- **Pros**: Schema 上更清晰「Agent ≠ User」
- **Cons**: 全部 join 要 `UNION` 或 `OR`,UI 每個列表都要寫兩次查詢
- **Why not**: 維護成本太高

### Agent = Service(無 User identity)
- **Pros**: 簡單
- **Cons**: Agent 冇法「被分派 task」,失去意義
- **Why not**: 唔符合 use case

## Consequences

### Positive
- Code 簡潔,UI 唔使改
- RBAC 統一
- TokenLog 自然 worklog 化

### Negative
- User table 變複雜(9 個 relation 仲有 agent)
- Email 字段對 Agent 冇意義(用 `agent@internal.local` placeholder)
- PasswordHash 對 Agent 唔適用(用 bcrypt 隨機 string)

### Mitigation
- 後端 middleware 喺 `POST /users` 自動 detect `isAgent=true` 跳過 email 校驗
- Frontend 喺 member list 用 icon 區分 human / agent

## References

- `backend/src/routes/agents.ts` — Agent 管理 endpoint
- `backend/src/routes/tokenlogs.ts` — Token 追蹤
- `backend/src/agent/runtime.ts` — Agent runtime loop
- `docs/AI-AGENT.md` — 完整 Agent 文檔
