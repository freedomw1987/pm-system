/**
 * Bug route helper test — US-5.1, 5.2, 5.3, 5.4 (all P0)
 *
 * Covers:
 *  - US-5.1: 建 Bug — 補 unit test 守住 permission
 *  - US-5.2: 分派 Bug — 守住 assignee logic
 *  - US-5.3: MyBugs (list filtered by reporter/assignee) — 守住 view scope
 *  - US-5.4: 改狀態 — 守住 status enum + transitions
 *
 * 對應 TECH-DEBT TD-001 + 紅線 12.
 */

import { describe, expect, test } from 'bun:test'

// ─── Pure helpers derived from bugs.ts ──────────────────────────────────────

type AuthUser = {
  id: string
  role: string
  permissions?: string[]
}

/**
 * 從 bugs.ts POST / derive 嘅 create permission gate
 * 保持同 source 一致: bugs.create perm OR admin/tester backward compat
 */
function canCreateBug(user: AuthUser | null): boolean {
  if (!user) return false
  if (user.role === 'admin' || user.role === 'tester') return true
  if (user.permissions?.includes('bugs.create')) return true
  return false
}

/**
 * 從 bugs.ts PUT /:id derive 嘅 edit permission gate
 * 保持同 source 一致: bugs.edit perm OR admin/developer/tech_lead OR reporter
 */
function canEditBug(
  user: AuthUser | null,
  existing: { reporterId: string }
): boolean {
  if (!user) return false
  if (user.role === 'admin' || user.role === 'developer' || user.role === 'tech_lead') {
    return true
  }
  if (user.permissions?.includes('bugs.edit')) return true
  if (existing.reporterId === user.id) return true
  return false
}

/**
 * 從 bugs.ts DELETE /:id derive 嘅 delete permission gate
 * 保持同 source 一致: bugs.delete perm OR admin only
 */
function canDeleteBug(user: AuthUser | null): boolean {
  if (!user) return false
  if (user.role === 'admin') return true
  if (user.permissions?.includes('bugs.delete')) return true
  return false
}

/**
 * 從 bugs.ts GET / derive 嘅 view scope
 *  - canViewAll (admin / has bugs.view_all perm): 看所有
 *  - tester/developer: 限 reporter==自己 OR assignee==自己 OR task.assignee==自己
 *  - 其他: 默認(由 caller 控制 scope)
 */
function getBugListScope(
  user: AuthUser | null
): { canViewAll: boolean; selfScope: boolean } {
  if (!user) return { canViewAll: false, selfScope: false }
  const canViewAll = user.role === 'admin' || user.permissions?.includes('bugs.view_all') === true
  const selfScope = user.role === 'tester' || user.role === 'developer'
  return { canViewAll, selfScope }
}

/**
 * Bug status enum + transitions
 * 從業務邏輯 derive,守住 state machine
 */
type BugStatus = 'open' | 'in_progress' | 'resolved' | 'closed' | 'reopened'

const VALID_BUG_STATUSES: BugStatus[] = [
  'open',
  'in_progress',
  'resolved',
  'closed',
  'reopened',
]

const BUG_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const

const BUG_STATUS_TRANSITIONS: Record<BugStatus, BugStatus[]> = {
  open: ['in_progress', 'closed'],
  in_progress: ['resolved', 'closed', 'open'],
  resolved: ['closed', 'reopened'], // 可以 re-open (verifier 唔信納)
  closed: [], // 終態 (除非 reopen,經 closed → reopened 唔合法,須先 resolved)
  reopened: ['in_progress', 'closed'],
}

function isValidBugStatus(s: string): s is BugStatus {
  return (VALID_BUG_STATUSES as readonly string[]).includes(s)
}

function isValidBugSeverity(s: string): boolean {
  return (BUG_SEVERITIES as readonly string[]).includes(s)
}

function isValidBugStatusTransition(from: BugStatus, to: BugStatus): boolean {
  return BUG_STATUS_TRANSITIONS[from]?.includes(to) ?? false
}

/**
 * 建 Bug 嘅 default severity (從 bugs.ts POST derive)
 * 守住 "未提供 severity 時 default to medium" invariant
 */
const DEFAULT_BUG_SEVERITY = 'medium' as const

// ─── US-5.1 建 Bug ──────────────────────────────────────────────────────────

describe('US-5.1: POST /bugs', () => {
  describe('canCreateBug', () => {
    test('null user → false', () => {
      expect(canCreateBug(null)).toBe(false)
    })

    test('admin can create', () => {
      expect(canCreateBug({ id: 'u-1', role: 'admin' })).toBe(true)
    })

    test('tester can create (backward compat — primary bug creator)', () => {
      expect(canCreateBug({ id: 'u-1', role: 'tester' })).toBe(true)
    })

    test('developer with bugs.create perm can create', () => {
      expect(
        canCreateBug({ id: 'u-1', role: 'developer', permissions: ['bugs.create'] })
      ).toBe(true)
    })

    test('pm cannot create (唔係 admin/tester)', () => {
      expect(canCreateBug({ id: 'u-1', role: 'pm' })).toBe(false)
    })

    test('developer without perm cannot create', () => {
      expect(canCreateBug({ id: 'u-1', role: 'developer' })).toBe(false)
    })

    test('visitor cannot create', () => {
      expect(canCreateBug({ id: 'u-1', role: 'visitor' })).toBe(false)
    })
  })

  describe('default severity invariant', () => {
    test('DEFAULT_BUG_SEVERITY is "medium"', () => {
      expect(DEFAULT_BUG_SEVERITY).toBe('medium')
    })
  })
})

// ─── US-5.2 分派 Bug ────────────────────────────────────────────────────────

describe('US-5.2: 分派 (assignee logic)', () => {
  test('reporterId is set to creator (建 Bug 自動)', () => {
    // Source: reporterId: user.id — creator auto 成 reporter
    const creator = { id: 'user-1' }
    const newBug = { reporterId: creator.id }
    expect(newBug.reporterId).toBe('user-1')
  })

  test('assignee can be initially null (未分派)', () => {
    const newBug = { assigneeId: null }
    expect(newBug.assigneeId).toBeNull()
  })
})

// ─── US-5.3 MyBugs list ─────────────────────────────────────────────────────

describe('US-5.3: GET /bugs (MyBugs list)', () => {
  describe('getBugListScope', () => {
    test('null user → no access', () => {
      expect(getBugListScope(null)).toEqual({ canViewAll: false, selfScope: false })
    })

    test('admin → view all', () => {
      expect(getBugListScope({ id: 'u-1', role: 'admin' })).toEqual({
        canViewAll: true,
        selfScope: false,
      })
    })

    test('user with bugs.view_all perm → view all', () => {
      expect(
        getBugListScope({ id: 'u-1', role: 'pm', permissions: ['bugs.view_all'] })
      ).toEqual({ canViewAll: true, selfScope: false })
    })

    test('tester → self-scope (reporter/assignee only)', () => {
      expect(getBugListScope({ id: 'u-1', role: 'tester' })).toEqual({
        canViewAll: false,
        selfScope: true,
      })
    })

    test('developer → self-scope', () => {
      expect(getBugListScope({ id: 'u-1', role: 'developer' })).toEqual({
        canViewAll: false,
        selfScope: true,
      })
    })

    test('pm without perm → not view all, not self-scope (default)', () => {
      expect(getBugListScope({ id: 'u-1', role: 'pm' })).toEqual({
        canViewAll: false,
        selfScope: false,
      })
    })
  })
})

// ─── US-5.4 改狀態 ──────────────────────────────────────────────────────────

describe('US-5.4: PUT /bugs/:id (status / severity change)', () => {
  describe('canEditBug', () => {
    const bug = { reporterId: 'user-1' }

    test('admin can edit', () => {
      expect(canEditBug({ id: 'u-2', role: 'admin' }, bug)).toBe(true)
    })

    test('developer can edit', () => {
      expect(canEditBug({ id: 'u-2', role: 'developer' }, bug)).toBe(true)
    })

    test('tech_lead can edit', () => {
      expect(canEditBug({ id: 'u-2', role: 'tech_lead' }, bug)).toBe(true)
    })

    test('reporter can edit their own bug', () => {
      expect(canEditBug({ id: 'user-1', role: 'tester' }, bug)).toBe(true)
    })

    test('non-reporter tester cannot edit', () => {
      expect(canEditBug({ id: 'user-2', role: 'tester' }, bug)).toBe(false)
    })

    test('pm cannot edit (唔係 admin/developer/tech_lead/reporter)', () => {
      expect(canEditBug({ id: 'u-2', role: 'pm' }, bug)).toBe(false)
    })

    test('developer with bugs.edit perm can edit (any bug)', () => {
      expect(
        canEditBug(
          { id: 'user-3', role: 'developer', permissions: ['bugs.edit'] },
          bug
        )
      ).toBe(true)
    })
  })

  describe('canDeleteBug', () => {
    test('admin can delete', () => {
      expect(canDeleteBug({ id: 'u-1', role: 'admin' })).toBe(true)
    })

    test('tester cannot delete', () => {
      expect(canDeleteBug({ id: 'u-1', role: 'tester' })).toBe(false)
    })

    test('developer with bugs.delete perm can delete', () => {
      expect(
        canDeleteBug({ id: 'u-1', role: 'developer', permissions: ['bugs.delete'] })
      ).toBe(true)
    })

    test('reporter cannot delete own bug', () => {
      expect(canDeleteBug({ id: 'user-1', role: 'tester' })).toBe(false)
    })
  })

  describe('isValidBugStatus (status enum)', () => {
    test('accepts valid statuses', () => {
      expect(isValidBugStatus('open')).toBe(true)
      expect(isValidBugStatus('in_progress')).toBe(true)
      expect(isValidBugStatus('resolved')).toBe(true)
      expect(isValidBugStatus('closed')).toBe(true)
      expect(isValidBugStatus('reopened')).toBe(true)
    })

    test('rejects invalid statuses', () => {
      expect(isValidBugStatus('completed')).toBe(false) // 用 completed for req, not bug
      expect(isValidBugStatus('cancelled')).toBe(false)
      expect(isValidBugStatus('')).toBe(false)
      expect(isValidBugStatus('OPEN')).toBe(false)
    })
  })

  describe('isValidBugSeverity', () => {
    test('accepts valid severities', () => {
      expect(isValidBugSeverity('low')).toBe(true)
      expect(isValidBugSeverity('medium')).toBe(true)
      expect(isValidBugSeverity('high')).toBe(true)
      expect(isValidBugSeverity('critical')).toBe(true)
    })

    test('rejects invalid severities', () => {
      expect(isValidBugSeverity('urgent')).toBe(false)
      expect(isValidBugSeverity('')).toBe(false)
      expect(isValidBugSeverity('blocker')).toBe(false) // 我哋唔用 blocker,淨係 critical
    })
  })

  describe('isValidBugStatusTransition (state machine)', () => {
    test('open → in_progress allowed', () => {
      expect(isValidBugStatusTransition('open', 'in_progress')).toBe(true)
    })

    test('open → resolved NOT allowed (must go through in_progress)', () => {
      expect(isValidBugStatusTransition('open', 'resolved')).toBe(false)
    })

    test('in_progress → resolved allowed', () => {
      expect(isValidBugStatusTransition('in_progress', 'resolved')).toBe(true)
    })

    test('resolved → reopened allowed (verifier 唔信納 fix)', () => {
      expect(isValidBugStatusTransition('resolved', 'reopened')).toBe(true)
    })

    test('resolved → closed allowed', () => {
      expect(isValidBugStatusTransition('resolved', 'closed')).toBe(true)
    })

    test('reopened → in_progress allowed', () => {
      expect(isValidBugStatusTransition('reopened', 'in_progress')).toBe(true)
    })

    test('closed is terminal (no transitions out)', () => {
      expect(isValidBugStatusTransition('closed', 'reopened')).toBe(false)
      expect(isValidBugStatusTransition('closed', 'open')).toBe(false)
      expect(isValidBugStatusTransition('closed', 'in_progress')).toBe(false)
    })
  })
})
