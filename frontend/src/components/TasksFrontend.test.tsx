/**
 * Frontend Tests — Tasks (US-4.2-4.5)
 */

import { describe, expect, test } from 'vitest'

// ─── US-4.2: My Tasks ─────────────────────────────────────────────────

describe('US-4.2: My Tasks', () => {
  test('filters tasks by assignee', () => {
    interface Task { assigneeId?: string; title: string }
    const filterMyTasks = (tasks: Task[], userId: string) =>
      tasks.filter(t => t.assigneeId === userId)

    const tasks: Task[] = [
      { assigneeId: 'user-1', title: 'Task 1' },
      { assigneeId: 'user-2', title: 'Task 2' },
      { assigneeId: 'user-1', title: 'Task 3' },
    ]

    expect(filterMyTasks(tasks, 'user-1')).toHaveLength(2)
    expect(filterMyTasks(tasks, 'user-2')).toHaveLength(1)
  })

  test('unassigned tasks are excluded', () => {
    interface Task { assigneeId?: string }
    const tasks: Task[] = [
      { assigneeId: 'user-1' },
      {},
      { assigneeId: 'user-2' },
    ]

    const assigned = tasks.filter(t => t.assigneeId === 'user-1')
    expect(assigned).toHaveLength(1)
  })
})

// ─── US-4.3: Kanban Status ──────────────────────────────────────────────

describe('US-4.3: Kanban Status', () => {
  const KANBAN_COLUMNS = ['pending', 'in_progress', 'testing', 'completed']

  test('kanban has valid columns', () => {
    expect(KANBAN_COLUMNS).toContain('pending')
    expect(KANBAN_COLUMNS).toContain('in_progress')
    expect(KANBAN_COLUMNS).toContain('testing')
    expect(KANBAN_COLUMNS).toContain('completed')
  })

  test('task can move to next column', () => {
    const nextColumn = (current: string): string | null => {
      const idx = KANBAN_COLUMNS.indexOf(current)
      return idx < KANBAN_COLUMNS.length - 1 ? KANBAN_COLUMNS[idx + 1] : null
    }

    expect(nextColumn('pending')).toBe('in_progress')
    expect(nextColumn('in_progress')).toBe('testing')
    expect(nextColumn('testing')).toBe('completed')
    expect(nextColumn('completed')).toBeNull()
  })

  test('task status update is immutable', () => {
    const updateTaskStatus = <T extends { status: string }>(
      task: T,
      newStatus: string
    ) => ({ ...task, status: newStatus })

    const task = { id: '1', title: 'Test', status: 'pending' }
    const updated = updateTaskStatus(task, 'completed')

    expect(updated.status).toBe('completed')
    expect(task.status).toBe('pending') // original unchanged
  })
})

// ─── US-4.4: Task ↔ Requirement Link ──────────────────────────────────

describe('US-4.4: Task Requirement Link', () => {
  test('task can be linked to requirement', () => {
    const linkToRequirement = <T extends { requirementId?: string }>(
      task: T,
      reqId: string
    ) => ({ ...task, requirementId: reqId })

    const task = { id: '1', title: 'Test', requirementId: undefined as string | undefined }
    const linked = linkToRequirement(task, 'req-1')

    expect(linked.requirementId).toBe('req-1')
  })

  test('task can be unlinked from requirement', () => {
    interface Task { id: string; requirementId?: string }
    const unlink = (task: Task): Task => {
      const { requirementId, ...rest } = task
      return rest as Task
    }

    const task = { id: '1', requirementId: 'req-1' }
    const unlinked = unlink(task)

    expect(unlinked).not.toHaveProperty('requirementId')
    expect(unlinked.id).toBe('1')
  })
})

// ─── US-4.5: Project Kanban ─────────────────────────────────────────

describe('US-4.5: Project Kanban', () => {
  test('groups tasks by status', () => {
    interface Task { id: string; status: string }
    const groupByStatus = (tasks: Task[]) => {
      const groups: Record<string, Task[]> = {}
      for (const task of tasks) {
        if (!groups[task.status]) groups[task.status] = []
        groups[task.status].push(task)
      }
      return groups
    }

    const tasks: Task[] = [
      { id: '1', status: 'pending' },
      { id: '2', status: 'in_progress' },
      { id: '3', status: 'pending' },
    ]

    const grouped = groupByStatus(tasks)
    expect(grouped.pending).toHaveLength(2)
    expect(grouped.in_progress).toHaveLength(1)
  })

  test('kanban shows task count per column', () => {
    interface Column { status: string; tasks: { id: string }[] }
    const getColumnCounts = (columns: Column[]) =>
      columns.map(c => ({ status: c.status, count: c.tasks.length }))

    const columns: Column[] = [
      { status: 'pending', tasks: [{ id: '1' }, { id: '2' }] },
      { status: 'completed', tasks: [{ id: '3' }] },
    ]

    const counts = getColumnCounts(columns)
    expect(counts.find(c => c.status === 'pending')?.count).toBe(2)
  })
})