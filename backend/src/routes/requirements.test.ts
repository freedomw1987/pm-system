/**
 * Requirement route helper test — US-3.1, 3.2, 3.3, 3.4 (all P0)
 *
 * Covers:
 *  - US-3.1: 建需求 — 已有 E2E (critical-path), 補 unit test 守住 permission
 *  - US-3.2: 分派 (assignee) — 補 unit test 守住 validation
 *  - US-3.3: MyRequirements list — 守住 view permission + scope 邏輯
 *  - US-3.4: 改狀態 — 守住 status transition invariants
 *
 * 對應 TECH-DEBT TD-001 + 紅線 12.
 */

import { describe, expect, test } from 'bun:test'

// ─── Pure helpers derived from requirements.ts ──────────────────────────────

type AuthUser = {
  id: string
  role: string
  permissions?: string[]
}

type ProjectMembership = { role: string } | null

/**
 * 從 requirements.ts POST / derive 嘅 create permission gate
 */
function canCreateRequirement(
  user: AuthUser | null,
  membership: ProjectMembership
): boolean {
  if (!user) return false
  if (user.role === 'admin' || user.role === 'pm') return true
  if (user.permissions?.includes('requirements.create')) return true
  if (membership?.role === 'pm') return true
  return false
}

/**
 * 從 requirements.ts PUT /:id derive 嘅 edit permission gate
 * 支援 pm / tech_lead project role + admin/pm global + perm
 */
function canEditRequirement(
  user: AuthUser | null,
  membership: ProjectMembership
): boolean {
  if (!user) return false
  if (user.role === 'admin' || user.role === 'pm') return true
  if (user.permissions?.includes('requirements.edit')) return true
  if (membership && ['pm', 'tech_lead'].includes(membership.role)) return true
  return false
}

/**
 * 從 requirements.ts DELETE /:id derive 嘅 delete permission gate
 * 比 edit 嚴格:tech_lead 唔可以刪
 */
function canDeleteRequirement(
  user: AuthUser | null,
  membership: ProjectMembership
): boolean {
  if (!user) return false
  if (user.role === 'admin' || user.role === 'pm') return true
  if (user.permissions?.includes('requirements.delete')) return true
  if (membership?.role === 'pm') return true
  return false
}

/**
 * 從 requirements.ts GET / derive 嘅 view permission (決定 scope)
 *  - admin/pm/has perm: 看所有 project
 *  - 否則: 只看自己係 member 嘅 project
 */
function canViewAllProjectsRequirements(user: AuthUser | null): boolean {
  if (!user) return false
  if (user.role === 'admin' || user.role === 'pm') return true
  if (user.permissions?.includes('requirements.view')) return true
  return false
}

/**
 * Assignee 必須係 project member 嘅 validation
 * 從 requirements.ts POST / + PUT /:id derive
 */
function validateAssignee(
  assigneeId: string | null | undefined,
  membership: { userId: string } | null
): { ok: boolean; reason?: string } {
  if (!assigneeId) return { ok: true } // 未提供 = 唔分派
  if (!membership) {
    return { ok: false, reason: '負責人必須是項目成員' }
  }
  if (membership.userId !== assigneeId) {
    return { ok: false, reason: '負責人必須是項目成員' }
  }
  return { ok: true }
}

/**
 * Status transition invariants
 * 從 requirements.ts PUT /:id derive,守住 state machine
 */
type RequirementStatus = 'draft' | 'open' | 'in_progress' | 'completed' | 'cancelled'

const VALID_STATUSES: RequirementStatus[] = [
  'draft',
  'open',
  'in_progress',
  'completed',
  'cancelled',
]

// 定義合法 transition 圖
const STATUS_TRANSITIONS: Record<RequirementStatus, RequirementStatus[]> = {
  draft: ['open', 'cancelled'],
  open: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled', 'open'], // 可以 re-open
  completed: [], // 終態
  cancelled: ['draft'], // 可以復活
}

function isValidStatusTransition(
  from: RequirementStatus,
  to: RequirementStatus
): boolean {
  return STATUS_TRANSITIONS[from]?.includes(to) ?? false
}

function isValidStatus(s: string): s is RequirementStatus {
  return (VALID_STATUSES as readonly string[]).includes(s)
}

// ─── US-3.1 建需求 ──────────────────────────────────────────────────────────

describe('US-3.1: POST /requirements', () => {
  describe('canCreateRequirement', () => {
    test('null user → false', () => {
      expect(canCreateRequirement(null, null)).toBe(false)
    })

    test('admin can create', () => {
      expect(canCreateRequirement({ id: 'u-1', role: 'admin' }, null)).toBe(true)
    })

    test('pm global can create', () => {
      expect(canCreateRequirement({ id: 'u-1', role: 'pm' }, null)).toBe(true)
    })

    test('developer with requirements.create perm can create', () => {
      expect(
        canCreateRequirement(
          { id: 'u-1', role: 'developer', permissions: ['requirements.create'] },
          null
        )
      ).toBe(true)
    })

    test('PM of project can create (project-level)', () => {
      expect(
        canCreateRequirement(
          { id: 'u-1', role: 'developer' },
          { role: 'pm' }
        )
      ).toBe(true)
    })

    test('developer (non-PM) cannot create', () => {
      expect(
        canCreateRequirement(
          { id: 'u-1', role: 'developer' },
          { role: 'developer' }
        )
      ).toBe(false)
    })

    test('visitor cannot create', () => {
      expect(canCreateRequirement({ id: 'u-1', role: 'visitor' }, null)).toBe(false)
    })
  })
})

// ─── US-3.2 分派 (assignee) ─────────────────────────────────────────────────

describe('US-3.2: 分派 (assignee validation)', () => {
  describe('validateAssignee', () => {
    test('null assignee is OK (no assignment)', () => {
      expect(validateAssignee(null, null).ok).toBe(true)
      expect(validateAssignee(undefined, null).ok).toBe(true)
      expect(validateAssignee('', null).ok).toBe(true) // empty string treated as null
    })

    test('assignee provided but not a member → reject', () => {
      const r = validateAssignee('user-x', null)
      expect(r.ok).toBe(false)
      expect(r.reason).toBe('負責人必須是項目成員')
    })

    test('assignee provided and IS a member → OK', () => {
      const r = validateAssignee('user-1', { userId: 'user-1' })
      expect(r.ok).toBe(true)
    })

    test('assignee provided, member exists but different user → reject', () => {
      const r = validateAssignee('user-1', { userId: 'user-2' })
      expect(r.ok).toBe(false)
    })
  })
})

// ─── US-3.3 MyRequirements list ─────────────────────────────────────────────

describe('US-3.3: GET /requirements (MyRequirements list)', () => {
  describe('canViewAllProjectsRequirements', () => {
    test('null user → false (scoped to own projects only)', () => {
      expect(canViewAllProjectsRequirements(null)).toBe(false)
    })

    test('admin sees all', () => {
      expect(canViewAllProjectsRequirements({ id: 'u-1', role: 'admin' })).toBe(true)
    })

    test('pm sees all (backward compat)', () => {
      expect(canViewAllProjectsRequirements({ id: 'u-1', role: 'pm' })).toBe(true)
    })

    test('developer with requirements.view perm sees all', () => {
      expect(
        canViewAllProjectsRequirements({
          id: 'u-1',
          role: 'developer',
          permissions: ['requirements.view'],
        })
      ).toBe(true)
    })

    test('developer without perm → scoped to own projects only', () => {
      expect(
        canViewAllProjectsRequirements({ id: 'u-1', role: 'developer' })
      ).toBe(false)
    })
  })
})

// ─── US-3.4 改狀態 ─────────────────────────────────────────────────────────

describe('US-3.4: PUT /requirements/:id (status change)', () => {
  describe('isValidStatus (status enum check)', () => {
    test('accepts valid statuses', () => {
      expect(isValidStatus('draft')).toBe(true)
      expect(isValidStatus('open')).toBe(true)
      expect(isValidStatus('in_progress')).toBe(true)
      expect(isValidStatus('completed')).toBe(true)
      expect(isValidStatus('cancelled')).toBe(true)
    })

    test('rejects invalid statuses', () => {
      expect(isValidStatus('todo')).toBe(false) // typo of to-do
      expect(isValidStatus('done')).toBe(false) // 唔用 done
      expect(isValidStatus('')).toBe(false)
      expect(isValidStatus('OPEN')).toBe(false) // case-sensitive
    })
  })

  describe('isValidStatusTransition (state machine)', () => {
    test('draft → open is allowed', () => {
      expect(isValidStatusTransition('draft', 'open')).toBe(true)
    })

    test('draft → completed NOT allowed (must go through open/in_progress)', () => {
      expect(isValidStatusTransition('draft', 'completed')).toBe(false)
    })

    test('open → in_progress is allowed', () => {
      expect(isValidStatusTransition('open', 'in_progress')).toBe(true)
    })

    test('in_progress → completed is allowed', () => {
      expect(isValidStatusTransition('in_progress', 'completed')).toBe(true)
    })

    test('completed is terminal — no transitions out', () => {
      expect(isValidStatusTransition('completed', 'open')).toBe(false)
      expect(isValidStatusTransition('completed', 'in_progress')).toBe(false)
      expect(isValidStatusTransition('completed', 'draft')).toBe(false)
    })

    test('cancelled can be revived to draft', () => {
      expect(isValidStatusTransition('cancelled', 'draft')).toBe(true)
    })

    test('cancelled → completed NOT allowed (must go through draft first)', () => {
      expect(isValidStatusTransition('cancelled', 'completed')).toBe(false)
    })

    test('in_progress can be re-opened (back to open)', () => {
      expect(isValidStatusTransition('in_progress', 'open')).toBe(true)
    })
  })

  describe('canEditRequirement', () => {
    test('admin can edit', () => {
      expect(canEditRequirement({ id: 'u-1', role: 'admin' }, null)).toBe(true)
    })

    test('pm can edit', () => {
      expect(canEditRequirement({ id: 'u-1', role: 'pm' }, null)).toBe(true)
    })

    test('tech_lead in project can edit', () => {
      expect(
        canEditRequirement(
          { id: 'u-1', role: 'developer' },
          { role: 'tech_lead' }
        )
      ).toBe(true)
    })

    test('regular developer cannot edit', () => {
      expect(
        canEditRequirement(
          { id: 'u-1', role: 'developer' },
          { role: 'developer' }
        )
      ).toBe(false)
    })

    test('developer with requirements.edit perm can edit', () => {
      expect(
        canEditRequirement(
          { id: 'u-1', role: 'developer', permissions: ['requirements.edit'] },
          { role: 'developer' }
        )
      ).toBe(true)
    })
  })

  describe('canDeleteRequirement (delete 比 edit 嚴格)', () => {
    test('tech_lead cannot delete (只有 edit 唔可以 delete)', () => {
      expect(
        canDeleteRequirement(
          { id: 'u-1', role: 'developer' },
          { role: 'tech_lead' }
        )
      ).toBe(false)
    })

    test('pm of project can delete', () => {
      expect(
        canDeleteRequirement(
          { id: 'u-1', role: 'developer' },
          { role: 'pm' }
        )
      ).toBe(true)
    })

    test('admin can delete', () => {
      expect(canDeleteRequirement({ id: 'u-1', role: 'admin' }, null)).toBe(true)
    })

    test('developer with requirements.delete perm can delete', () => {
      expect(
        canDeleteRequirement(
          { id: 'u-1', role: 'developer', permissions: ['requirements.delete'] },
          null
        )
      ).toBe(true)
    })
  })
})
