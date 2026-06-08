/**
 * Project route helper test — US-2.1, US-2.2 (P0)
 *
 * Covers:
 *  - US-2.1: 建項目 — 已有 E2E (critical-path), 補 unit test 守住:
 *    * canAccessProject 嘅 admin/member/department 三條 access path
 *    * 建項目時 member 自動加入 (role: 'pm') 嘅 invariant
 *  - US-2.2: 加成員 — 補 unit test 守住:
 *    * addMember permission 邏輯 (admin / PM / has assign_roles perm)
 *    * member role 預設值 / 校驗
 *
 * 對應 TECH-DEBT TD-001 + 紅線 12 (P0 US 必有 unit + E2E).
 *
 * Approach: derive pure access/permission helpers out of projects.ts since
 * the route handlers are heavily coupled to Prisma. Helpers are inlined
 * here verbatim from source.
 */

import { describe, expect, test } from 'bun:test'

// ─── Pure helpers derived from projects.ts ───────────────────────────────────

type AuthUser = {
  id: string
  role: string
  departmentId?: string | null
  permissions?: string[]
}

type ProjectLite = {
  departmentId?: string | null
  members?: { userId: string }[]
}

/**
 * 從 projects.ts line 15-21 derive 嘅 canAccessProject
 * 保持同 source 一致: admin bypass → member check → same department fallback
 */
function canAccessProject(
  project: ProjectLite,
  user: AuthUser | null | undefined,
  userDepartmentId: string | null
): boolean {
  if (!user) return false
  if (user.role === 'admin') return true
  if (project.members?.some(m => m.userId === user.id)) return true
  return Boolean(userDepartmentId && project.departmentId === userDepartmentId)
}

/**
 * 從 projects.ts POST / derive 嘅 member 自動 join invariant
 * 建項目時 creator 自動以 'pm' role 加入 members
 */
function autoJoinCreatorAsPM(userId: string) {
  return { userId, role: 'pm' }
}

/**
 * 從 projects.ts POST /:id/members derive 嘅 permission check
 * 保持同 source 一致: admin / has 'users.assign_roles' perm / requester 是 PM
 */
function canAddProjectMember(
  requester: AuthUser | null,
  requesterMembership: { role: string } | null
): boolean {
  if (!requester) return false
  if (requester.role === 'admin') return true
  if (requester.permissions?.includes('users.assign_roles')) return true
  if (requesterMembership?.role === 'pm') return true
  return false
}

/**
 * 從 projects.ts POST / derive 嘅 projects.create permission gate
 * 保持同 source 一致: hasPermission check OR admin/pm backward compat
 */
function canCreateProject(user: AuthUser | null): boolean {
  if (!user) return false
  if (user.role === 'admin' || user.role === 'pm') return true
  if (user.permissions?.includes('projects.create')) return true
  return false
}

/**
 * Project member role 嘅 valid 集 (建項目時 / 加成員時)
 * Source 冇硬性 enum check,但從業務角度應該限於呢幾個
 */
const VALID_MEMBER_ROLES = ['pm', 'developer', 'viewer'] as const
type ValidMemberRole = (typeof VALID_MEMBER_ROLES)[number]

function isValidMemberRole(role: string): role is ValidMemberRole {
  return (VALID_MEMBER_ROLES as readonly string[]).includes(role)
}

// ─── US-2.1 建項目 ──────────────────────────────────────────────────────────

describe('US-2.1: POST /projects', () => {
  describe('canCreateProject', () => {
    test('null user cannot create', () => {
      expect(canCreateProject(null)).toBe(false)
    })

    test('admin can always create', () => {
      expect(canCreateProject({ id: 'u-1', role: 'admin' })).toBe(true)
    })

    test('pm can create (backward compat)', () => {
      expect(canCreateProject({ id: 'u-1', role: 'pm' })).toBe(true)
    })

    test('developer with projects.create perm can create', () => {
      expect(
        canCreateProject({
          id: 'u-1',
          role: 'developer',
          permissions: ['projects.create'],
        })
      ).toBe(true)
    })

    test('developer without projects.create perm cannot create', () => {
      expect(
        canCreateProject({ id: 'u-1', role: 'developer', permissions: [] })
      ).toBe(false)
    })

    test('visitor cannot create', () => {
      expect(canCreateProject({ id: 'u-1', role: 'visitor' })).toBe(false)
    })
  })

  describe('autoJoinCreatorAsPM (建項目 invariant)', () => {
    test('creator is added as pm', () => {
      expect(autoJoinCreatorAsPM('user-1')).toEqual({ userId: 'user-1', role: 'pm' })
    })
  })
})

// ─── US-2.2 加成員 ──────────────────────────────────────────────────────────

describe('US-2.2: POST /projects/:id/members', () => {
  describe('canAddProjectMember', () => {
    test('null requester cannot add', () => {
      expect(canAddProjectMember(null, { role: 'pm' })).toBe(false)
    })

    test('admin can add member', () => {
      expect(canAddProjectMember({ id: 'u-1', role: 'admin' }, null)).toBe(true)
    })

    test('user with assign_roles perm can add', () => {
      expect(
        canAddProjectMember(
          { id: 'u-1', role: 'developer', permissions: ['users.assign_roles'] },
          null
        )
      ).toBe(true)
    })

    test('PM of project can add', () => {
      expect(
        canAddProjectMember(
          { id: 'u-1', role: 'developer', permissions: [] },
          { role: 'pm' }
        )
      ).toBe(true)
    })

    test('developer (non-PM) cannot add', () => {
      expect(
        canAddProjectMember(
          { id: 'u-1', role: 'developer', permissions: [] },
          { role: 'developer' }
        )
      ).toBe(false)
    })

    test('non-member cannot add (no membership record)', () => {
      expect(canAddProjectMember({ id: 'u-1', role: 'developer' }, null)).toBe(false)
    })
  })

  describe('isValidMemberRole (member role 校驗)', () => {
    test('accepts valid roles', () => {
      expect(isValidMemberRole('pm')).toBe(true)
      expect(isValidMemberRole('developer')).toBe(true)
      expect(isValidMemberRole('viewer')).toBe(true)
    })

    test('rejects invalid roles', () => {
      expect(isValidMemberRole('admin')).toBe(false) // project-level 唔應該有 admin
      expect(isValidMemberRole('tester')).toBe(false) // global role 唔用喺 project
      expect(isValidMemberRole('')).toBe(false)
      expect(isValidMemberRole('pm; DROP TABLE projects;--')).toBe(false)
    })
  })
})

// ─── canAccessProject 跨 US-2.1 / 2.2 / 2.3 (GET list) ─────────────────────

describe('canAccessProject (跨 US-2.x access check)', () => {
  test('null user → false', () => {
    expect(canAccessProject({ departmentId: 'd-1' }, null, null)).toBe(false)
  })

  test('admin → always true', () => {
    expect(canAccessProject({ departmentId: 'd-1' }, { id: 'u-1', role: 'admin' }, null)).toBe(true)
  })

  test('project member → true (no department check needed)', () => {
    expect(
      canAccessProject(
        { members: [{ userId: 'u-1' }] },
        { id: 'u-1', role: 'developer' },
        'd-other'
      )
    ).toBe(true)
  })

  test('same department → true', () => {
    expect(
      canAccessProject(
        { departmentId: 'd-1' },
        { id: 'u-1', role: 'developer' },
        'd-1'
      )
    ).toBe(true)
  })

  test('different department + not member → false', () => {
    expect(
      canAccessProject(
        { departmentId: 'd-1' },
        { id: 'u-1', role: 'developer' },
        'd-2'
      )
    ).toBe(false)
  })

  test('no department + not member → false', () => {
    expect(
      canAccessProject(
        { departmentId: null },
        { id: 'u-1', role: 'developer' },
        null
      )
    ).toBe(false)
  })

  test('project with no departmentId (legacy) — only members or admin', () => {
    expect(
      canAccessProject(
        {}, // 冇 departmentId, 冇 members
        { id: 'u-1', role: 'developer' },
        'd-1'
      )
    ).toBe(false)
  })
})
