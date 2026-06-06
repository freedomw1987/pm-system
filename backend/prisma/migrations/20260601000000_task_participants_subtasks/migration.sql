-- Add subtask support to tasks.
ALTER TABLE "tasks" ADD COLUMN "parent_task_id" TEXT;

-- Create task participant join table for multi-person assignment.
CREATE TABLE "task_participants" (
    "task_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "task_participants_pkey" PRIMARY KEY ("task_id", "user_id")
);

-- Backfill existing single assignees as participants.
INSERT INTO "task_participants" ("task_id", "user_id")
SELECT "id", "assignee_id"
FROM "tasks"
WHERE "assignee_id" IS NOT NULL
ON CONFLICT DO NOTHING;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_task_id_fkey" FOREIGN KEY ("parent_task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_participants" ADD CONSTRAINT "task_participants_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_participants" ADD CONSTRAINT "task_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
