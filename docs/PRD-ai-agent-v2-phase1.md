# PM System — AI Agent Management Extension
## Phase 1 PRD

---

## 1. Concept & Vision

PM System evolves from a human-only project management tool into a **hybrid team management platform** — where both human workers and AI agents operate as first-class team members.

**Core metaphor:** AI agents are workers, not tools. They have roles, receive tasks, produce artifacts, and log their work — just like humans.

**Feel:** Enterprise-grade clarity with the warmth of a team dashboard. Every worker (human or AI) has presence, every task has accountability, every artifact has provenance.

---

## 2. Worker Model

### 2.1 Data Model

```
Worker (abstract — base concept)
  ├── Human ←── extends User (existing model)
  └── AIAgent ←── new model
```

**AIAgent** fields:
| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `name` | String | Display name (e.g. "代碼審查助手") |
| `description` | String? | Natural language role description |
| `model` | String | e.g. "gpt-4o", "claude-sonnet-4" |
| `apiUrl` | String | OpenAI-compatible endpoint |
| `apiKey` | String | Encrypted API key |
| `skills` | String[] | List of skill names this agent can perform |
| `mcpServers` | Json? | `{ name, url }[]` array of connected MCP servers |
| `systemPrompt` | String? | Custom system prompt template |
| `status` | Enum | `online` `offline` `busy` |
| `lastActiveAt` | DateTime? | Last activity timestamp |
| `isActive` | Boolean | Soft-disable flag |
| `config` | Json? | Free-form config (temperature, max_tokens, etc.) |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | |

**ProjectMember** extension: already has `userId + projectId + role`. We'll add `workerType` discriminator so it can reference either a User or an AIAgent. New field: `workerId` (string — references User.id OR AIAgent.id), `workerType` (`'user'` | `'agent'`).

**Task** extension: `assigneeId` already exists. Add `assigneeType` (`'user'` | `'agent'`). If `agent`, `assigneeId` references `AIAgent.id`.

**WorkLog** extension: add `workerId` + `workerType`.

**Artifact** (new): Links to AIAgent or User, stores output.
| Field | Type |
|-------|------|
| `id` | UUID |
| `projectId` | String |
| `taskId` | String? |
| `agentId` | String? (→AIAgent.id) |
| `userId` | String? (→User.id) |
| `type` | Enum: `code` `doc` `image` `data` |
| `name` | String |
| `content` | Text |
| `metadata` | Json? |
| `createdAt` | DateTime |

---

## 3. Kanban Board

Each Project has one Kanban board.

**Board** is a virtual container — no separate DB model needed. Derived from tasks.

**Default Lanes** (PM can customize):
- 📋 Backlog
- 📝 In Progress
- 🔍 In Review
- ✅ Done

**Task Card** shows:
- Title + priority badge
- Assignee avatar + name (human or AI agent icon + name)
- Due date (if set)
- Tags
- Work log count indicator

**Drag & Drop** (Phase 1: simple, no drag — just click-to-move dropdown)
Phase 1 uses a select dropdown to move task between lanes. Drag & drop is Phase 2.

---

## 4. AI Agent Admin Management Page

**Who:** Admin only

**Page:** `/agents` — AI Agent 目錄頁

**Features:**
1. **Agent List** — table view: name, model, status, skills count, last active, actions
2. **Create/Edit Agent** — modal form with all AIAgent fields
3. **Test Agent** — send a test prompt, see raw response (for Admin verification)
4. **Connect/Disconnect MCP** — add remove MCP server URLs
5. **Soft Delete** — toggle `isActive` flag (never hard delete — preserve history)

---

## 5. Project-Level AI Agent Assignment

**Page:** `/projects/:id/team` (or extend existing project detail)

**Features:**
1. List project members (humans + AI agents)
2. Add AI agent as member (select from agent list, assign project role)
3. Remove agent from project
4. AI agents show their current task + status in the team list

---

## 6. AI Agent Execution Status

**Real-time polling** (2-3 second interval)

Each AI Agent in the sidebar/dashboard shows:
- 🟢 **Online** — agent is idle, ready to receive tasks
- 🟡 **Busy** — agent has an active task
- 🔴 **Offline** — agent is not connected or error state
- Last active timestamp

When AI Agent receives a task:
1. Task status changes to `in_progress`
2. Agent status changes to `busy`
3. Agent logs work via `WorkLog`
4. Agent produces `Artifact` (optional)
5. Task completes → Agent status back to `online`

---

## 7. Task Detail Modal

Click task card → opens modal showing:
- Title, description, lane
- Assignee (Worker — human or AI)
- Priority, due date
- Work logs (list)
- Artifacts (list — files/code/docs produced)
- Comments (future Phase 2)

---

## 8. Scope — Phase 1

### In Scope
- [x] Prisma schema: AIAgent, Artifact models + extensions to existing models
- [x] Backend: AIAgent CRUD API (`/agents`)
- [x] Backend: Task update lane API (`/projects/:id/tasks/:taskId/lane`)
- [x] Frontend: Project Kanban Board (lane view + task cards)
- [x] Frontend: Task detail modal
- [x] Frontend: AI Agent Admin page (list + create/edit)
- [x] Frontend: Agent status polling (dashboard)
- [x] Frontend: Project team page (add/remove AI agents as members)

### Out of Scope (Phase 2)
- Git Repo management + commit history
- AI Agent code commit capability
- Drag & drop on Kanban
- MCP server health check
- AI Agent self-spawn / autonomous mode
- Progress report auto-generation

---

## 9. Tech Notes

**Auth:** Same JWT auth. Admin-only routes use existing `hasPermission` middleware.

**MCP:** We store `{ name, url }[]` in `AIAgent.mcpServers`. No direct MCP protocol handling in Phase 1 — just configuration storage. MCP tools are called by the AI Agent backend when it executes tasks.

**Encryption:** `AIAgent.apiKey` stored encrypted (same pattern as `LLMConfig.apiKey`).

**Skills:** Free-form string array. No skills registry in Phase 1. Admins type skill names manually.

**Polling:** Frontend polls `/api/agents/status` every 3 seconds when dashboard is open. Lightweight endpoint returns `{ id, status, lastActiveAt }[]`.