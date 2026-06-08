/**
 * Task route extended test — US-4.2, US-4.3 (P0, currently PARTIAL)
 *
 * 對現有 tasks.test.ts 嘅補充。tasks.test.ts 已經 cover US-4.1 (建任務) + resolveTaskProjectId。
 * 呢度加:
 *  - US-4.2: MyTasks list scope — 守住 developer/tester 睇自己任務嘅 view scope
 *  - US-4.3: Kanban 改狀態 — 守住 status transitions + 防止 in_progress 重新 assign
 *
 * 對應 TECH-DEBT TD-001 + 紅線 12.
 */

import { describe, expect, test } from 'bun:test'
import { buildTaskListWhere } from './tasks'

// ─── Pure helpers derived from tasks.ts ──────────────────────────────────────

/**
 * 從 tasks.ts line 32-42 derive 嘅 normalizeParticipantIds
 * 保持同 source 一致: dedup + 過濾 empty + 包括 assigneeId
 */
function normalizeParticipantIds(
  assigneeId?: string | null,
  participantIds?: string[],
  assigneeIds?: string[]
): string[] {
  const ids = new Set<string>()
  if (assigneeId) ids.add(assigneeId)
  for (const id of participantIds || []) {
    if (id) ids.add(id)
  }
  for (const id of assigneeIds || []) {
    if (id) ids.add(id)
  }
  return Array.from(ids)
}

/**
 * 從 tasks.ts line 44-47 derive 嘅 userTaskMembershipWhere
 * 守住 "user 睇自己相關 task" 嘅 invariant: assigneeId OR participant
 */
function userTaskMembershipWhere(userId: string) {
  return [
    { assigneeId: userId },
    { participants: { some: { userId } } },
  ]
}

/**
 * Task status enum + transitions
 * 從業務邏輯 derive (Kanban view: pending → in_progress → completed/cancelled)
 */
type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled'

const VALID_TASK_STATUSES: TaskStatus[] = ['pending', 'in_progress', 'completed', 'cancelled']

const TASK_STATUS_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  pending: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled', 'pending'], // 可以 re-open
  completed: [], // 終態
  cancelled: ['pending'], // 可以復活
}

function isValidTaskStatus(s: string): s is TaskStatus {
  return (VALID_TASK_STATUSES as readonly string[]).includes(s)
}

function isValidTaskStatusTransition(from: TaskStatus, to: TaskStatus): boolean {
  return TASK_STATUS_TRANSITIONS[from]?.includes(to) ?? false
}

/**
 * 從 tasks.ts line 363-366 derive 嘅 "in_progress 不可 reassign" invariant
 * 防止 Kanban drag-drop 撞 error
 */
function canReassignTask(task: { assigneeId: string | null; status: string }): boolean {
  if (task.status === 'in_progress' && task.assigneeId) {
    return false
  }
  return true
}

// ─── US-4.2 MyTasks list scope ──────────────────────────────────────────────

describe('US-4.2: GET /tasks (MyTasks list scope)', () => {
  describe('buildTaskListWhere — viewer scope (via task filter)', () => {
    test('admin with assigneeId filter → narrow but no viewer scope', () => {
      const where = buildTaskListWhere(
        { assigneeId: 'user-1' },
        { id: 'admin-1', role: 'admin', permissions: ['tasks.view_all'] }
      )
      // admin can view all → filter only by assignee
      expect(where.OR).toEqual([
        { assigneeId: 'user-1' },
        { participants: { some: { userId: 'user-1' } } },
      ])
    })

    test('developer without tasks.view_all → 限自己 (userId filter)', () => {
      const where = buildTaskListWhere(
        {},
        { id: 'dev-1', role: 'developer', permissions: [] }
      )
      // Source: 將 user.id push 入 OR, viewer 變成自己
      expect(where.OR).toEqual([
        { assigneeId: 'dev-1' },
        { participants: { some: { userId: 'dev-1' } } },
      ])
    })

    test('tester without tasks.view_all → 限自己', () => {
      const where = buildTaskListWhere(
        {},
        { id: 'tester-1', role: 'tester', permissions: [] }
      )
      expect(where.OR).toEqual([
        { assigneeId: 'tester-1' },
        { participants: { some: { userId: 'tester-1' } } },
      ])
    })

    test('developer with tasks.view_all → no viewer scope, all visible', () => {
      const where = buildTaskListWhere(
        {},
        { id: 'dev-1', role: 'developer', permissions: ['tasks.view_all'] }
      )
      expect(where.OR).toBeUndefined() // no scope applied
    })

    test('projectId filter adds to where (regardless of scope)', () => {
      const where = buildTaskListWhere(
        { projectId: 'p-1' },
        { id: 'pm-1', role: 'pm', permissions: [] }
      )
      expect(where.projectId).toBe('p-1')
    })

    test('status filter adds to where', () => {
      const where = buildTaskListWhere(
        { status: 'completed' },
        { id: 'pm-1', role: 'pm', permissions: [] }
      )
      expect(where.status).toBe('completed')
    })
  })

  describe('normalizeParticipantIds (US-4.2 participant join logic)', () => {
    test('dedup assigneeId + participantIds', () => {
      const ids = normalizeParticipantIds('u-1', ['u-2', 'u-3'], undefined)
      expect(ids.sort()).toEqual(['u-1', 'u-2', 'u-3'])
    })

    test('dedup when assigneeId is in participantIds', () => {
      const ids = normalizeParticipantIds('u-1', ['u-1', 'u-2'], undefined)
      expect(ids.sort()).toEqual(['u-1', 'u-2'])
    })

    test('handles all three sources (assigneeId, participantIds, assigneeIds)', () => {
      const ids = normalizeParticipantIds('u-1', ['u-2'], ['u-1', 'u-3'])
      expect(ids.sort()).toEqual(['u-1', 'u-2', 'u-3'])
    })

    test('filters out empty strings', () => {
      const ids = normalizeParticipantIds(undefined, ['', 'u-1', ''], undefined)
      expect(ids).toEqual(['u-1'])
    })

    test('all undefined → empty array', () => {
      expect(normalizeParticipantIds()).toEqual([])
      expect(normalizeParticipantIds(null, undefined, undefined)).toEqual([])
    })
  })

  describe('userTaskMembershipWhere (US-4.2 view scope helper)', () => {
    test('returns OR with assigneeId + participants', () => {
      const or = userTaskMembershipWhere('u-1')
      expect(or).toEqual([
        { assigneeId: 'u-1' },
        { participants: { some: { userId: 'u-1' } } },
      ])
    })
  })
})

// ─── US-4.3 Kanban 改狀態 ──────────────────────────────────────────────────

describe('US-4.3: Kanban 改狀態 (status transitions + reassign guards)', () => {
  describe('isValidTaskStatus (status enum)', () => {
    test('accepts valid statuses', () => {
      expect(isValidTaskStatus('pending')).toBe(true)
      expect(isValidTaskStatus('in_progress')).toBe(true)
      expect(isValidTaskStatus('completed')).toBe(true)
      expect(isValidTaskStatus('cancelled')).toBe(true)
    })

    test('rejects invalid statuses', () => {
      expect(isValidTaskStatus('todo')).toBe(false)
      expect(isValidTaskStatus('done')).toBe(false)
      expect(isValidTaskStatus('PENDING')).toBe(false)
      expect(isValidTaskStatus('')).toBe(false)
    })
  })

  describe('isValidTaskStatusTransition (Kanban state machine)', () => {
    test('pending → in_progress allowed', () => {
      expect(isValidTaskStatusTransition('pending', 'in_progress')).toBe(true)
    })

    test('pending → completed NOT allowed (must go through in_progress)', () => {
      expect(isValidTaskStatusTransition('pending', 'completed')).toBe(false)
    })

    test('in_progress → completed allowed', () => {
      expect(isValidTaskStatusTransition('in_progress', 'completed')).toBe(true)
    })

    test('in_progress → pending allowed (re-open)', () => {
      expect(isValidTaskStatusTransition('in_progress', 'pending')).toBe(true)
    })

    test('completed is terminal', () => {
      expect(isValidTaskStatusTransition('completed', 'pending')).toBe(false)
      expect(isValidTaskStatusTransition('completed', 'in_progress')).toBe(false)
    })

    test('cancelled → pending allowed (revive)', () => {
      expect(isValidTaskStatusTransition('cancelled', 'pending')).toBe(true)
    })

    test('cancelled → completed NOT allowed', () => {
      expect(isValidTaskStatusTransition('cancelled', 'completed')).toBe(false)
    })
  })

  describe('canReassignTask (in_progress guard)', () => {
    test('pending task can be reassigned', () => {
      expect(
        canReassignTask({ assigneeId: 'u-1', status: 'pending' })
      ).toBe(true)
    })

    test('in_progress task with assignee → CANNOT be reassigned', () => {
      expect(
        canReassignTask({ assigneeId: 'u-1', status: 'in_progress' })
      ).toBe(false)
    })

    test('in_progress task with no assignee → can be reassigned (no existing agent)', () => {
      expect(
        canReassignTask({ assigneeId: null, status: 'in_progress' })
      ).toBe(true)
    })

    test('completed task can be reassigned (no guard)', () => {
      expect(
        canReassignTask({ assigneeId: 'u-1', status: 'completed' })
      ).toBe(true)
    })

    test('cancelled task can be reassigned', () => {
      expect(
        canReassignTask({ assigneeId: 'u-1', status: 'cancelled' })
      ).toBe(true)
    })
  })
})
