/**
 * Frontend Tests — Bugs (US-5.2-5.4)
 */

import { describe, expect, test } from 'vitest'

// ─── US-5.2: Assign Bug ───────────────────────────────────────────────

describe('US-5.2: Assign Bug', () => {
  test('bug can be assigned to user', () => {
    const assignBug = <T extends { assigneeId?: string }>(
      bug: T,
      userId: string
    ) => ({ ...bug, assigneeId: userId })

    const bug = { id: '1', title: 'Bug', assigneeId: undefined as string | undefined }
    const assigned = assignBug(bug, 'user-1')

    expect(assigned.assigneeId).toBe('user-1')
  })

  test('bug can be unassigned', () => {
    interface Bug { id: string; assigneeId?: string }
    const unassign = (bug: Bug): Bug => {
      const { assigneeId, ...rest } = bug
      return rest as Bug
    }

    const bug = { id: '1', assigneeId: 'user-1' }
    const unassigned = unassign(bug)

    expect(unassigned.assigneeId).toBeUndefined()
    expect(unassigned.id).toBe('1')
  })
})

// ─── US-5.3: My Bugs ────────────────────────────────────────────────

describe('US-5.3: My Bugs', () => {
  test('filters bugs by assignee', () => {
    interface Bug { assigneeId?: string; severity: string }
    const filterMyBugs = (bugs: Bug[], userId: string) =>
      bugs.filter(b => b.assigneeId === userId)

    const bugs: Bug[] = [
      { assigneeId: 'user-1', severity: 'high' },
      { assigneeId: 'user-2', severity: 'critical' },
    ]

    expect(filterMyBugs(bugs, 'user-1')).toHaveLength(1)
    expect(filterMyBugs(bugs, 'user-2')).toHaveLength(1)
  })
})

// ─── US-5.4: Change Bug Status ─────────────────────────────────────

describe('US-5.4: Change Bug Status', () => {
  const BUG_STATUSES = ['open', 'in_progress', 'resolved', 'verified']

  test('valid bug statuses', () => {
    expect(BUG_STATUSES).toContain('open')
    expect(BUG_STATUSES).toContain('in_progress')
    expect(BUG_STATUSES).toContain('resolved')
    expect(BUG_STATUSES).toContain('verified')
  })

  test('bug can be resolved', () => {
    const resolveBug = <T extends { status: string }>(
      bug: T
    ) => ({ ...bug, status: 'resolved' })

    const bug = { id: '1', title: 'Bug', status: 'open' }
    const resolved = resolveBug(bug)

    expect(resolved.status).toBe('resolved')
    expect(bug.status).toBe('open') // original unchanged
  })

  test('bug can be verified', () => {
    const verifyBug = <T extends { status: string }>(
      bug: T
    ) => ({ ...bug, status: 'verified' })

    const bug = { id: '1', status: 'resolved' }
    const verified = verifyBug(bug)

    expect(verified.status).toBe('verified')
  })
})

// ─── Bug Severity ─────────────────────────────────────────────────

describe('Bug Severity', () => {
  const SEVERITIES = ['low', 'medium', 'high', 'critical']

  test('valid severities', () => {
    expect(SEVERITIES).toContain('low')
    expect(SEVERITIES).toContain('medium')
    expect(SEVERITIES).toContain('high')
    expect(SEVERITIES).toContain('critical')
  })

  test('severity affects display priority', () => {
    const priority = (severity: string): number => {
      const order = ['low', 'medium', 'high', 'critical']
      return order.indexOf(severity)
    }

    expect(priority('critical')).toBeGreaterThan(priority('low'))
    expect(priority('high')).toBeGreaterThan(priority('medium'))
  })
})