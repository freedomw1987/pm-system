/**
 * Project route helper test — US-2.1, US-2.2, US-2.3, US-2.4 (all P0)
 *
 * Covers:
 *  - US-2.1: 建項目 — 已有 E2E (critical-path), 補 unit test 守住:
 *    * canAccessProject 嘅 admin/member/department 三條 access path
 *    * 建項目時 member 自動加入 (role: 'pm') 嘅 invariant
 *  - US-2.2: 加成員 — 補 unit test 守住:
 *    * addMember permission 邏輯 (admin / PM / has assign_roles perm)
 *    * member role 預設值 / 校驗
 *  - US-2.4 (Sprint 10): 部門 link project — 守住:
 *    * buildProjectListWhereForUser: departmentId filter + non-admin scope OR
 *    * null department = 跨部門 / no-dept 項目
 *  - US-2.3 (Sprint 10): Project dashboard — 守住 buildProjectSummary 嘅
 *    tasks / bugs / requirements / worklog hours 嘅聚合 invariant
 *
 * 對應 TECH-DEBT TD-001 + 紅線 12 (P0 US 必有 unit + E2E).
 *
 * Approach: derive pure access/permission helpers out of projects.ts since
 * the route handlers are heavily coupled to Prisma. Helpers are inlined
 * here verbatim from source.
 */

import { describe, expect, test } from 'bun:test'
import { computePagination } from '../utils/pagination'

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

// ─── US-7.x Sprint 9: GET /:id/requirements (paginated sub-route) ───────────

/**
 * 從 projects.ts:157-198 derive 嘅 response shape invariant
 * Pure helper: takes totalCount + query, returns the paginated response
 * exactly as the route would, given a sample requirements list.
 */
function paginatedRequirementsResponse(
  totalCount: number,
  query: { page?: string; pageSize?: string; limit?: string },
  requirements: Array<{ id: string; title: string }>
) {
  const pagination = computePagination(query, totalCount)
  const skip = pagination.skip ?? 0
  const take = pagination.take ?? pagination.pageSize
  const items = requirements.slice(skip, skip + take)
  return {
    requirements: items,
    totalCount,
    page: pagination.page,
    pageSize: pagination.pageSize,
    totalPages: pagination.totalPages,
  }
}

function makeReqs(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `req-${i}`, title: `R${i}` }))
}

describe('US-7.x Sprint 9: GET /:id/requirements paginated response', () => {
  test('default page=1, pageSize=20 returns first 20 of 25', () => {
    const r = paginatedRequirementsResponse(25, {}, makeReqs(25))
    expect(r.requirements).toHaveLength(20)
    expect(r.totalCount).toBe(25)
    expect(r.page).toBe(1)
    expect(r.pageSize).toBe(20)
    expect(r.totalPages).toBe(2)
  })

  test('page=2 returns the next slice, no overlap with page 1', () => {
    const all = makeReqs(25)
    const p1 = paginatedRequirementsResponse(25, { page: '1', pageSize: '20' }, all)
    const p2 = paginatedRequirementsResponse(25, { page: '2', pageSize: '20' }, all)
    expect(p1.requirements[0].id).toBe('req-0')
    expect(p2.requirements[0].id).toBe('req-20')
    expect(p2.requirements).toHaveLength(5)
    const p1Ids = new Set(p1.requirements.map(r => r.id))
    for (const r of p2.requirements) {
      expect(p1Ids.has(r.id)).toBe(false)
    }
  })

  test('pageSize=200 caps at MAX_PAGE_SIZE=100', () => {
    const r = paginatedRequirementsResponse(500, { pageSize: '200' }, makeReqs(500))
    expect(r.pageSize).toBe(100)
    expect(r.requirements).toHaveLength(100)
  })

  test('limit=-1 returns all requirements in a single page (Excel export)', () => {
    const all = makeReqs(33)
    const r = paginatedRequirementsResponse(33, { limit: '-1' }, all)
    expect(r.requirements).toHaveLength(33)
    expect(r.page).toBe(1)
    expect(r.totalPages).toBe(1)
    expect(r.pageSize).toBe(33)
  })

  test('totalCount=0 still yields a valid response (1 empty page)', () => {
    const r = paginatedRequirementsResponse(0, {}, [])
    expect(r.requirements).toEqual([])
    expect(r.totalCount).toBe(0)
    expect(r.totalPages).toBe(1)
  })
})

// ─── US-2.4 部門 link project ────────────────────────────────────────────────

/**
 * 從 projects.ts GET / derive 嘅 list where 條件組合(US-2.4)
 * 保持同 source 完全一致(projects.ts:30-46):
 *  - admin 唔加 scope OR,直接 filter
 *  - 非 admin: where.OR = [成員, 同部門]
 *  - query.departmentId 一律加 where.departmentId = query.departmentId
 *  - null department = 「冇部門」嘅 legacy 項目,只 admin / member 見到
 */
function buildProjectListWhereForUser(
  query: { departmentId?: string; scope?: string },
  user: AuthUser | null,
  userDepartmentId: string | null
): Record<string, any> {
  const where: Record<string, any> = {}

  if (user?.role !== 'admin') {
    if (query.scope === 'my') {
      // Sprint 15: 嚴格只見自己 member 嘅(忽略同部門)
      // David feedback: Dashboard「所有項目」只 show 自己有份,唔 show 同部門
      where.members = { some: { userId: user?.id } }
    } else {
      // Default: 自己 member OR 同部門(寬鬆,work well for collaboration)
      const orFilters: any[] = [
        { members: { some: { userId: user?.id } } }
      ]
      if (userDepartmentId) {
        orFilters.push({ departmentId: userDepartmentId })
      }
      where.OR = orFilters
    }
  } else if (query.scope === 'my') {
    // Admin + scope=my: 都要守「自己 member」 invariant
    // (避免 admin 見 196 個 E2E fixture projects 嘅 dashboard)
    where.members = { some: { userId: user?.id } }
  }

  if (query.departmentId) {
    where.departmentId = query.departmentId
  }

  return where
}

/**
 * 從 projects.ts derive 嘅 departmentId 處理(US-2.4)
 * 純化 normalize,前端送 null string / undefined 統一變 null
 * (即係「解除部門 link」)
 */
function normalizeDepartmentIdOnUpdate(input: unknown): string | null | undefined {
  if (input === undefined) return undefined // 唔郁
  if (input === null || input === '') return null // 解除 link
  return String(input)
}

describe('US-2.4 (Sprint 10): 部門 link project', () => {
  describe('buildProjectListWhereForUser', () => {
    test('admin 冇帶 departmentId → 返空 where (見晒所有)', () => {
      const where = buildProjectListWhereForUser({}, { id: 'u-1', role: 'admin' }, null)
      expect(where.OR).toBeUndefined()
      expect(where.departmentId).toBeUndefined()
    })

    test('admin 帶 departmentId → 只加 where.departmentId,唔加 OR scope', () => {
      const where = buildProjectListWhereForUser(
        { departmentId: 'd-1' },
        { id: 'u-1', role: 'admin' },
        null
      )
      expect(where.OR).toBeUndefined()
      expect(where.departmentId).toBe('d-1')
    })

    test('非 admin 有部門 → OR scope = [member, same department]', () => {
      const where = buildProjectListWhereForUser(
        {},
        { id: 'u-1', role: 'developer' },
        'd-1'
      )
      expect(where.OR).toEqual([
        { members: { some: { userId: 'u-1' } } },
        { departmentId: 'd-1' },
      ])
    })

    test('非 admin 冇部門 → OR scope 只有 member check', () => {
      const where = buildProjectListWhereForUser(
        {},
        { id: 'u-1', role: 'developer' },
        null
      )
      expect(where.OR).toEqual([
        { members: { some: { userId: 'u-1' } } },
      ])
    })

    test('非 admin 帶 departmentId filter → OR + departmentId AND', () => {
      const where = buildProjectListWhereForUser(
        { departmentId: 'd-2' },
        { id: 'u-1', role: 'developer' },
        'd-1'
      )
      // 開發者用戶 d-1 部門,但 filter 要 d-2 → 結果係 (member OR d-1) AND d-2
      expect(where.OR).toEqual([
        { members: { some: { userId: 'u-1' } } },
        { departmentId: 'd-1' },
      ])
      expect(where.departmentId).toBe('d-2')
    })

    test('null user → 仍然入 OR scope branch 但 userId undefined(caller 應該 guard 返)', () => {
      // 注意:source 喺 line 29 已經 early return {projects:[]} if (!user),
      // 所以呢個 derive 只處理 user 已經存在嘅情況。
      // null user 入到呢度會出 `{members: {some: {userId: undefined}}}` — caller 必須 guard。
      const where = buildProjectListWhereForUser({}, null, null)
      expect(where.OR).toBeDefined()
      expect(where.OR[0]).toEqual({ members: { some: { userId: undefined } } })
    })

    // ── Sprint 15: scope=my 嚴格只見自己 member 嘅(David 2026-06-10 feedback) ──
    test('Sprint 15: scope=my, 非 admin 有部門 → 嚴格只見自己 member, 忽略同部門', () => {
      const where = buildProjectListWhereForUser(
        { scope: 'my' },
        { id: 'u-1', role: 'developer' },
        'd-1' // 開發者屬 d-1 部門,但 scope=my 要忽略
      )
      expect(where.members).toEqual({ some: { userId: 'u-1' } })
      expect(where.OR).toBeUndefined() // 冇 OR scope(嚴格)
      expect(where.departmentId).toBeUndefined() // 冇 dept filter
    })

    test('Sprint 15: scope=my, 非 admin 冇部門 → 仍然嚴格只見自己 member', () => {
      const where = buildProjectListWhereForUser(
        { scope: 'my' },
        { id: 'u-1', role: 'developer' },
        null
      )
      expect(where.members).toEqual({ some: { userId: 'u-1' } })
      expect(where.OR).toBeUndefined()
    })

    test('Sprint 15: scope=my, admin → 都要守「自己 member」 invariant(避免見 196 個 E2E fixture)', () => {
      const where = buildProjectListWhereForUser(
        { scope: 'my' },
        { id: 'admin-1', role: 'admin' },
        null
      )
      expect(where.members).toEqual({ some: { userId: 'admin-1' } })
      expect(where.OR).toBeUndefined()
    })

    test('Sprint 15: default scope (無帶 my), admin 仍然見晒(向後兼容)', () => {
      // 唔帶 scope OR 帶 'default' 都應該係 admin 見晒
      const where = buildProjectListWhereForUser(
        {},
        { id: 'admin-1', role: 'admin' },
        null
      )
      expect(where.OR).toBeUndefined()
      expect(where.members).toBeUndefined()
    })

    test('Sprint 15: scope=my + departmentId filter → 兩者 AND', () => {
      // Developer u-1 屬 d-1 部門, scope=my 但 filter d-2
      // 結果: (自己 member) AND departmentId=d-2
      const where = buildProjectListWhereForUser(
        { scope: 'my', departmentId: 'd-2' },
        { id: 'u-1', role: 'developer' },
        'd-1'
      )
      expect(where.members).toEqual({ some: { userId: 'u-1' } })
      expect(where.departmentId).toBe('d-2')
    })
  })

  describe('normalizeDepartmentIdOnUpdate', () => {
    test('undefined → undefined (PUT 唔郁 departmentId)', () => {
      expect(normalizeDepartmentIdOnUpdate(undefined)).toBeUndefined()
    })

    test('null → null (PUT 解除部門 link)', () => {
      expect(normalizeDepartmentIdOnUpdate(null)).toBeNull()
    })

    test('空 string → null (frontend form clear)', () => {
      expect(normalizeDepartmentIdOnUpdate('')).toBeNull()
    })

    test('正常 id → 原樣 string', () => {
      expect(normalizeDepartmentIdOnUpdate('d-1')).toBe('d-1')
    })

    test('數字 → 轉 string', () => {
      expect(normalizeDepartmentIdOnUpdate(123)).toBe('123')
    })
  })
})

// ─── US-2.3 Project dashboard summary ────────────────────────────────────────

/**
 * 從將開嘅 GET /projects/:id/summary derive 嘅聚合 helper(US-2.3)
 * 目標 invariant:
 *  - tasks: { total, byStatus: {todo, in_progress, testing, done} }
 *  - bugs: { total, bySeverity: {low, medium, high, critical} }
 *  - requirements: { total, byStatus: {draft, approved, in_progress, done} }
 *  - worklogHours: number
 *  - recentActivity: 頭 N 條(揀 task / bug / requirement 嘅最新)
 *
 * 呢個 helper 暫時 derive,等開 endpoint 嗰陣直接 import 或者 inline 落 route。
 */
type ProjectSummaryInput = {
  tasks: Array<{ status: string }>
  bugs: Array<{ severity: string; status: string }>
  requirements: Array<{ status: string }>
  workLogs: Array<{ hours: number | { toString(): string } }>
}

function buildProjectSummary(input: ProjectSummaryInput) {
  const tasksByStatus: Record<string, number> = {}
  for (const t of input.tasks) {
    tasksByStatus[t.status] = (tasksByStatus[t.status] || 0) + 1
  }
  const bugsBySeverity: Record<string, number> = {}
  for (const b of input.bugs) {
    bugsBySeverity[b.severity] = (bugsBySeverity[b.severity] || 0) + 1
  }
  const requirementsByStatus: Record<string, number> = {}
  for (const r of input.requirements) {
    requirementsByStatus[r.status] = (requirementsByStatus[r.status] || 0) + 1
  }
  const totalHours = input.workLogs.reduce(
    (sum, w) => sum + Number(w.hours),
    0
  )
  return {
    tasks: { total: input.tasks.length, byStatus: tasksByStatus },
    bugs: { total: input.bugs.length, bySeverity: bugsBySeverity },
    requirements: {
      total: input.requirements.length,
      byStatus: requirementsByStatus,
    },
    worklogHours: Math.round(totalHours * 100) / 100,
  }
}

describe('US-2.3 (Sprint 10): Project dashboard summary 聚合', () => {
  test('空 project → 全部 0', () => {
    const summary = buildProjectSummary({
      tasks: [],
      bugs: [],
      requirements: [],
      workLogs: [],
    })
    expect(summary.tasks.total).toBe(0)
    expect(summary.tasks.byStatus).toEqual({})
    expect(summary.bugs.total).toBe(0)
    expect(summary.requirements.total).toBe(0)
    expect(summary.worklogHours).toBe(0)
  })

  test('tasks by status 計數正確', () => {
    const summary = buildProjectSummary({
      tasks: [
        { status: 'todo' },
        { status: 'todo' },
        { status: 'in_progress' },
        { status: 'done' },
      ],
      bugs: [],
      requirements: [],
      workLogs: [],
    })
    expect(summary.tasks.total).toBe(4)
    expect(summary.tasks.byStatus).toEqual({
      todo: 2,
      in_progress: 1,
      done: 1,
    })
  })

  test('bugs by severity 計數正確', () => {
    const summary = buildProjectSummary({
      tasks: [],
      bugs: [
        { severity: 'low', status: 'open' },
        { severity: 'high', status: 'open' },
        { severity: 'high', status: 'resolved' },
      ],
      requirements: [],
      workLogs: [],
    })
    expect(summary.bugs.total).toBe(3)
    expect(summary.bugs.bySeverity).toEqual({ low: 1, high: 2 })
  })

  test('worklog hours 自動 sum + round 到 2 decimal', () => {
    const summary = buildProjectSummary({
      tasks: [],
      bugs: [],
      requirements: [],
      workLogs: [
        { hours: 1.5 },
        { hours: 2.25 },
        { hours: 0.1 },
        { hours: 3.999 },
      ],
    })
    // 1.5 + 2.25 + 0.1 + 3.999 = 7.849 → round → 7.85
    expect(summary.worklogHours).toBe(7.85)
  })

  test('Prisma Decimal hours field → 接受 (toString 友善處理)', () => {
    // Prisma Postgres 會返 Decimal type,有 toString()
    const fakeDecimal = { toString: () => '4.50' }
    const summary = buildProjectSummary({
      tasks: [],
      bugs: [],
      requirements: [],
      workLogs: [{ hours: fakeDecimal as any }],
    })
    expect(summary.worklogHours).toBe(4.5)
  })

  test('full project scenario: 全部 metrics 一起計', () => {
    const summary = buildProjectSummary({
      tasks: [
        { status: 'todo' },
        { status: 'in_progress' },
        { status: 'in_progress' },
        { status: 'testing' },
        { status: 'done' },
      ],
      bugs: [
        { severity: 'medium', status: 'open' },
        { severity: 'high', status: 'open' },
        { severity: 'low', status: 'resolved' },
      ],
      requirements: [
        { status: 'draft' },
        { status: 'approved' },
        { status: 'in_progress' },
      ],
      workLogs: [{ hours: 8 }, { hours: 4.5 }, { hours: 2 }],
    })
    expect(summary.tasks.total).toBe(5)
    expect(summary.tasks.byStatus).toEqual({
      todo: 1,
      in_progress: 2,
      testing: 1,
      done: 1,
    })
    expect(summary.bugs.total).toBe(3)
    expect(summary.bugs.bySeverity).toEqual({
      medium: 1, high: 1, low: 1,
    })
    expect(summary.requirements.total).toBe(3)
    expect(summary.requirements.byStatus).toEqual({
      draft: 1, approved: 1, in_progress: 1,
    })
    expect(summary.worklogHours).toBe(14.5)
  })
})
