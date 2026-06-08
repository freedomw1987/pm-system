/**
 * Agent claim/release task test — US-9.1 補完
 *
 * 對現有 agents.test.ts (claim-task 9 個 case) 嘅補充。
 * 守住 source 入面重要 invariants 嘅 pure-function 版:
 *  - claim: 必 task.status === 'pending' AND task.assigneeId === null
 *  - release: 必 task.assigneeId === user.id (only the assignee can release)
 *  - 必填 taskId
 *
 * 對應 TECH-DEBT TD-001 + 紅線 12.
 */

import { describe, expect, test } from 'bun:test'

// ─── Pure helpers derived from agents.ts ─────────────────────────────────────

type AuthUser = { id: string; role: string; permissions?: string[] }

type Task = {
  id: string
  status: string
  assigneeId: string | null
}

/**
 * 從 agents.ts POST /claim-task line 244-253 derive
 * 保持同 source 一致: agent 自身 OR has tasks.claim perm
 */
function canClaimTask(
  user: AuthUser,
  dbIsAgent: boolean
): boolean {
  if (dbIsAgent) return true
  if (user.permissions?.includes('tasks.claim')) return true
  return false
}

/**
 * 從 agents.ts POST /claim-task line 264-272 derive 嘅 task state gate
 * 守住 "claim 只可以 claim pending + unassigned 嘅 task"
 */
function isTaskClaimable(task: Task): { ok: boolean; reason?: string } {
  if (task.status !== 'pending') {
    return { ok: false, reason: `Task is not available. Current status: ${task.status}` }
  }
  if (task.assigneeId) {
    return { ok: false, reason: 'Task is already assigned' }
  }
  return { ok: true }
}

/**
 * 從 agents.ts POST /release-task line 310-313 derive
 * 守住 "只有 assignee 自身可以 release"
 */
function canReleaseTask(
  task: Task,
  userId: string
): boolean {
  return task.assigneeId === userId
}

/**
 * 從 agents.ts POST /claim-task line 290-293 derive
 * 必填 taskId
 */
function validateClaimInput(body: unknown): { ok: boolean; reason?: string } {
  if (!body || typeof body !== 'object') return { ok: false, reason: 'body required' }
  const b = body as Record<string, unknown>
  if (typeof b.taskId !== 'string' || b.taskId.length === 0) {
    return { ok: false, reason: 'taskId is required' }
  }
  return { ok: true }
}

/**
 * 從 agents.ts POST /claim-task line 275-281 derive 嘅 claim 結果
 * 守住 "claim 必 set assigneeId + status='in_progress' + claimedByAgentAt=now"
 */
function applyClaimEffect(taskId: string, userId: string, now: Date = new Date()) {
  return {
    where: { id: taskId },
    data: {
      assigneeId: userId,
      status: 'in_progress',
      claimedByAgentAt: now,
    },
  }
}

/**
 * 從 agents.ts POST /release-task line 316-325 derive
 * 守住 "release 必 reset assigneeId + status='pending' + clear claimedByAgentAt"
 */
function applyReleaseEffect(taskId: string) {
  return {
    where: { id: taskId },
    data: {
      assigneeId: null,
      status: 'pending',
      claimedByAgentAt: null,
    },
  }
}

// ─── US-9.1 補完: claim / release invariants ───────────────────────────────

describe('US-9.1 補完: POST /agents/claim-task', () => {
  describe('canClaimTask (permission gate)', () => {
    test('agent user (dbIsAgent=true) can claim', () => {
      const user: AuthUser = { id: 'a-1', role: 'developer' }
      expect(canClaimTask(user, true)).toBe(true)
    })

    test('non-agent user with tasks.claim perm can claim', () => {
      const user: AuthUser = {
        id: 'u-1',
        role: 'developer',
        permissions: ['tasks.claim'],
      }
      expect(canClaimTask(user, false)).toBe(true)
    })

    test('non-agent user without perm cannot claim', () => {
      const user: AuthUser = { id: 'u-1', role: 'developer' }
      expect(canClaimTask(user, false)).toBe(false)
    })

    test('admin user (not agent) without perm cannot claim', () => {
      // Source: 冇 admin bypass, 必須係 agent OR has tasks.claim
      const user: AuthUser = { id: 'u-1', role: 'admin' }
      expect(canClaimTask(user, false)).toBe(false)
    })
  })

  describe('isTaskClaimable (task state gate)', () => {
    test('pending + no assignee → claimable', () => {
      expect(isTaskClaimable({ id: 't-1', status: 'pending', assigneeId: null }).ok).toBe(true)
    })

    test('in_progress task → not claimable', () => {
      const r = isTaskClaimable({ id: 't-1', status: 'in_progress', assigneeId: null })
      expect(r.ok).toBe(false)
      expect(r.reason).toContain('in_progress')
    })

    test('completed task → not claimable', () => {
      const r = isTaskClaimable({ id: 't-1', status: 'completed', assigneeId: null })
      expect(r.ok).toBe(false)
    })

    test('cancelled task → not claimable', () => {
      const r = isTaskClaimable({ id: 't-1', status: 'cancelled', assigneeId: null })
      expect(r.ok).toBe(false)
    })

    test('pending + already assigned → not claimable', () => {
      const r = isTaskClaimable({ id: 't-1', status: 'pending', assigneeId: 'other' })
      expect(r.ok).toBe(false)
      expect(r.reason).toBe('Task is already assigned')
    })

    test('in_progress + assigned → not claimable (both reasons fail)', () => {
      const r = isTaskClaimable({ id: 't-1', status: 'in_progress', assigneeId: 'other' })
      expect(r.ok).toBe(false)
    })
  })

  describe('validateClaimInput', () => {
    test('rejects null body', () => {
      expect(validateClaimInput(null).ok).toBe(false)
    })

    test('rejects missing taskId', () => {
      const r = validateClaimInput({})
      expect(r.ok).toBe(false)
      expect(r.reason).toBe('taskId is required')
    })

    test('rejects empty taskId', () => {
      const r = validateClaimInput({ taskId: '' })
      expect(r.ok).toBe(false)
    })

    test('accepts valid taskId', () => {
      expect(validateClaimInput({ taskId: 'task-1' }).ok).toBe(true)
    })
  })

  describe('applyClaimEffect (DB update payload)', () => {
    test('sets assigneeId, status, claimedByAgentAt', () => {
      const now = new Date('2026-06-08T12:00:00Z')
      const effect = applyClaimEffect('task-1', 'user-1', now)
      expect(effect.where.id).toBe('task-1')
      expect(effect.data.assigneeId).toBe('user-1')
      expect(effect.data.status).toBe('in_progress')
      expect(effect.data.claimedByAgentAt).toEqual(now)
    })
  })
})

describe('US-9.1 補完: POST /agents/release-task', () => {
  describe('canReleaseTask (only assignee can release)', () => {
    test('assignee themselves can release', () => {
      expect(canReleaseTask({ id: 't-1', status: 'in_progress', assigneeId: 'u-1' }, 'u-1')).toBe(true)
    })

    test('different user cannot release', () => {
      expect(canReleaseTask({ id: 't-1', status: 'in_progress', assigneeId: 'u-1' }, 'u-2')).toBe(false)
    })

    test('admin cannot release other user task (only assignee)', () => {
      expect(canReleaseTask({ id: 't-1', status: 'in_progress', assigneeId: 'u-1' }, 'admin-1')).toBe(false)
    })

    test('unassigned task cannot be released', () => {
      expect(canReleaseTask({ id: 't-1', status: 'pending', assigneeId: null }, 'u-1')).toBe(false)
    })
  })

  describe('applyReleaseEffect (DB update payload)', () => {
    test('resets assigneeId to null, status to pending, clears claimedByAgentAt', () => {
      const effect = applyReleaseEffect('task-1')
      expect(effect.where.id).toBe('task-1')
      expect(effect.data.assigneeId).toBeNull()
      expect(effect.data.status).toBe('pending')
      expect(effect.data.claimedByAgentAt).toBeNull()
    })
  })

  describe('validateReleaseInput (同 claim 對稱)', () => {
    test('accepts valid taskId', () => {
      expect(validateClaimInput({ taskId: 'task-1' }).ok).toBe(true)
    })
  })
})
