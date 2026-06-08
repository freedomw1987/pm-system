-- ============================================================================
-- Migration: 20260609000000_sync_schema_to_v2
-- Purpose:   Sync database schema to current prisma/schema.prisma state.
--            20260521053128_init + 20260601000000_task_participants_subtasks
--            were generated against an older schema; subsequent changes
--            (added models: Department, Role, Permission, LLMConfig, WikiPage,
--            ChatSession, ChatMessage, TokenLog; added columns on User,
--            Project, Requirement, Task, Bug, WorkLog, Attachment) were
--            applied locally via `prisma db push` and never folded back
--            into a migration. Customer first-run with `migrate deploy`
--            needs this bridge.
-- ============================================================================

-- ─── 1. ALTER existing tables: add missing columns ─────────────────────────

-- users: add role / is_agent / agent_config / department_id
ALTER TABLE "users" ADD COLUMN "role"          TEXT         NOT NULL DEFAULT 'developer';
ALTER TABLE "users" ADD COLUMN "is_agent"      BOOLEAN      NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "agent_config"  JSONB;
ALTER TABLE "users" ADD COLUMN "department_id" TEXT;

-- projects: add start_date / end_date / department_id
ALTER TABLE "projects" ADD COLUMN "start_date"    TIMESTAMP(3);
ALTER TABLE "projects" ADD COLUMN "end_date"      TIMESTAMP(3);
ALTER TABLE "projects" ADD COLUMN "department_id" TEXT;

-- requirements: add priority / assignee_id
ALTER TABLE "requirements" ADD COLUMN "priority"     TEXT NOT NULL DEFAULT 'medium';
ALTER TABLE "requirements" ADD COLUMN "assignee_id"  TEXT;

-- tasks: add project_id / parent_task_id / claimed_by_agent_at
-- (project_id is NOT NULL in schema → backfill required before NOT NULL)
-- NOTE: parent_task_id was already added by 20260601000000_task_participants_subtasks
ALTER TABLE "tasks" ADD COLUMN "project_id"            TEXT;
ALTER TABLE "tasks" ADD COLUMN "claimed_by_agent_at"   TIMESTAMP(3);

-- bugs: add project_id / requirement_id / assignee_id
ALTER TABLE "bugs" ADD COLUMN "project_id"      TEXT;
ALTER TABLE "bugs" ADD COLUMN "requirement_id"  TEXT;
ALTER TABLE "bugs" ADD COLUMN "assignee_id"     TEXT;

-- work_logs: rename `note` → `description` (schema renamed the field)
ALTER TABLE "work_logs" RENAME COLUMN "note" TO "description";

-- attachments: add project_id
ALTER TABLE "attachments" ADD COLUMN "project_id" TEXT;

-- ─── 2. CREATE 8 missing tables ────────────────────────────────────────────

CREATE TABLE "departments" (
    "id"         TEXT         NOT NULL,
    "name"       TEXT         NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "departments_name_key" ON "departments"("name");

CREATE TABLE "Role" (
    "id"          TEXT         NOT NULL,
    "name"        TEXT         NOT NULL,
    "description" TEXT,
    "permissions" TEXT[],
    "is_built_in" BOOLEAN      NOT NULL DEFAULT false,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

CREATE TABLE "Permission" (
    "id"       TEXT NOT NULL,
    "key"      TEXT NOT NULL,
    "name"     TEXT NOT NULL,
    "category" TEXT NOT NULL,
    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");

CREATE TABLE "llm_configs" (
    "id"              TEXT         NOT NULL,
    "api_url"         TEXT         NOT NULL,
    "api_key"         TEXT         NOT NULL,
    "model"           TEXT         NOT NULL,
    "vision_api_url"  TEXT,
    "vision_api_key"  TEXT,
    "vision_model"    TEXT,
    "updated_at"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "llm_configs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "wiki_pages" (
    "id"            TEXT         NOT NULL,
    "project_id"    TEXT         NOT NULL,
    "title"         TEXT         NOT NULL,
    "content"       TEXT         NOT NULL,
    "tags"          TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
    "order"         INTEGER      NOT NULL DEFAULT 0,
    "created_by_id" TEXT         NOT NULL,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMP(3) NOT NULL,
    CONSTRAINT "wiki_pages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "chat_sessions" (
    "id"         TEXT         NOT NULL,
    "user_id"    TEXT         NOT NULL,
    "project_id" TEXT,
    "title"      TEXT         NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "chat_messages" (
    "id"         TEXT         NOT NULL,
    "session_id" TEXT         NOT NULL,
    "role"       TEXT         NOT NULL,
    "content"    TEXT         NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "token_logs" (
    "id"            TEXT             NOT NULL,
    "user_id"       TEXT             NOT NULL,
    "task_id"       TEXT,
    "tokens_used"   INTEGER          NOT NULL,
    "input_tokens"  INTEGER,
    "output_tokens" INTEGER,
    "model"         TEXT             NOT NULL,
    "cost_usd"      DECIMAL(8, 6),
    "work_date"     TIMESTAMP(3)     NOT NULL,
    "description"   TEXT,
    "created_at"    TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "token_logs_pkey" PRIMARY KEY ("id")
);

-- ─── 3. CREATE indexes for new tables' FK columns ─────────────────────────

CREATE INDEX "wiki_pages_project_id_idx"     ON "wiki_pages"("project_id");
CREATE INDEX "chat_sessions_user_id_idx"     ON "chat_sessions"("user_id");
CREATE INDEX "chat_sessions_project_id_idx"  ON "chat_sessions"("project_id");
CREATE INDEX "chat_messages_session_id_idx"  ON "chat_messages"("session_id");
CREATE INDEX "token_logs_user_id_idx"        ON "token_logs"("user_id");
CREATE INDEX "token_logs_task_id_idx"        ON "token_logs"("task_id");

-- ─── 4. Foreign keys: dept / role wiring, and now-declared relations ───────

ALTER TABLE "users" ADD CONSTRAINT "users_department_id_fkey"
  FOREIGN KEY ("department_id") REFERENCES "departments"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "projects" ADD CONSTRAINT "projects_department_id_fkey"
  FOREIGN KEY ("department_id") REFERENCES "departments"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "requirements" ADD CONSTRAINT "requirements_assignee_id_fkey"
  FOREIGN KEY ("assignee_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_task_id_fkey"  -- already added by 20260601000000
--   FOREIGN KEY ("parent_task_id") REFERENCES "tasks"("id")
--   ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "bugs" ADD CONSTRAINT "bugs_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "bugs" ADD CONSTRAINT "bugs_requirement_id_fkey"
  FOREIGN KEY ("requirement_id") REFERENCES "requirements"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "bugs" ADD CONSTRAINT "bugs_assignee_id_fkey"
  FOREIGN KEY ("assignee_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "attachments" ADD CONSTRAINT "attachments_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "wiki_pages" ADD CONSTRAINT "wiki_pages_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "wiki_pages" ADD CONSTRAINT "wiki_pages_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "chat_sessions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "token_logs" ADD CONSTRAINT "token_logs_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "token_logs" ADD CONSTRAINT "token_logs_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "tasks"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
