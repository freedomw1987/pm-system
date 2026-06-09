/**
 * Users route tests — Sprint 9 (sub-list pagination)
 *
 * 守住 US-7.x users 修正:GET /api/users 改用 pagination helper
 * 跟 worklogs.ts / projects.ts / bugs.ts 同一個 pattern,response shape
 * 一致,前端 UsersPage 可以無痛接駁。
 *
 * Approach: derive pure helpers (paginated response shape, RBAC gates)
 * from users.ts and test the data shape — same pattern as projects.test.ts
 * and reports.test.ts.
 */

import { describe, expect, test } from 'bun:test'
import { computePagination } from '../utils/pagination'

// ─── Pure helpers derived from users.ts ─────────────────────────────────────

type AuthUser = {
  id: string
  role: string
  permissions?: string[]
}

/**
 * GET /api/users 嘅 RBAC gate (users.ts:22-30)
 * admin OR has 'users.view_all' → canViewAll → 全部用戶
 * 否則要 'users.view' → 淨係見自己
 */
function canListUsers(user: AuthUser | null | undefined): boolean {
  if (!user) return false
  if (user.role === 'admin') return true
  if (user.permissions?.includes('users.view_all')) return true
  if (user.permissions?.includes('users.view')) return true
  return false
}

function canViewAllUsers(user: AuthUser | null | undefined): boolean {
  if (!user) return false
  if (user.role === 'admin') return true
  return Boolean(user.permissions?.includes('users.view_all'))
}

/**
 * GET /api/users 嘅 where clause
 * canViewAll 嘅話先可以加 departmentId filter
 */
function buildUsersWhere(
  user: AuthUser | null | undefined,
  query: { departmentId?: string }
): Record<string, unknown> {
  const where: Record<string, unknown> = {}
  if (!canViewAllUsers(user)) {
    where.id = user?.id
  }
  if (query.departmentId && canViewAllUsers(user)) {
    where.departmentId = query.departmentId
  }
  return where
}

/**
 * Response shape (Sprint 9): users 連 totalCount / page / pageSize / totalPages
 * Pure helper:totalCount + query + users list → 完整 response
 */
function paginatedUsersResponse(
  totalCount: number,
  query: { page?: string; pageSize?: string; limit?: string; departmentId?: string },
  users: Array<{ id: string; email: string; name: string }>
) {
  const pagination = computePagination(query, totalCount)
  const skip = pagination.skip ?? 0
  const take = pagination.take ?? pagination.pageSize
  const items = users.slice(skip, skip + take)
  return {
    users: items,
    totalCount,
    page: pagination.page,
    pageSize: pagination.pageSize,
    totalPages: pagination.totalPages,
  }
}

function makeUsers(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `u-${i}`, email: `u${i}@x`, name: `U${i}` }))
}

// ─── US-7.x Sprint 9: GET /api/users RBAC ───────────────────────────────────

describe('US-7.x Sprint 9: GET /api/users RBAC', () => {
  test('null user → cannot list', () => {
    expect(canListUsers(null)).toBe(false)
    expect(canListUsers(undefined)).toBe(false)
  })

  test('admin can list (canViewAll)', () => {
    expect(canListUsers({ id: 'u-1', role: 'admin' })).toBe(true)
    expect(canViewAllUsers({ id: 'u-1', role: 'admin' })).toBe(true)
  })

  test('pm with users.view_all can list all', () => {
    expect(canListUsers({ id: 'u-1', role: 'pm', permissions: ['users.view_all'] })).toBe(true)
    expect(canViewAllUsers({ id: 'u-1', role: 'pm', permissions: ['users.view_all'] })).toBe(true)
  })

  test('developer with only users.view can list (sees self only)', () => {
    expect(canListUsers({ id: 'u-1', role: 'developer', permissions: ['users.view'] })).toBe(true)
    expect(canViewAllUsers({ id: 'u-1', role: 'developer', permissions: ['users.view'] })).toBe(false)
  })

  test('developer without any view perm cannot list', () => {
    expect(canListUsers({ id: 'u-1', role: 'developer', permissions: [] })).toBe(false)
  })
})

// ─── US-7.x Sprint 9: GET /api/users where clause ───────────────────────────

describe('US-7.x Sprint 9: buildUsersWhere', () => {
  test('admin gets an empty where (no filter) and can filter by department', () => {
    expect(buildUsersWhere({ id: 'u-1', role: 'admin' }, {})).toEqual({})
    expect(buildUsersWhere({ id: 'u-1', role: 'admin' }, { departmentId: 'd-1' })).toEqual({
      departmentId: 'd-1',
    })
  })

  test('non-admin (users.view only) is forced to where.id = own', () => {
    const w = buildUsersWhere({ id: 'u-2', role: 'developer', permissions: ['users.view'] }, { departmentId: 'd-1' })
    expect(w).toEqual({ id: 'u-2' }) // 唔加 departmentId
  })

  test('users.view_all + departmentId → filter by department', () => {
    const w = buildUsersWhere(
      { id: 'u-1', role: 'pm', permissions: ['users.view_all'] },
      { departmentId: 'd-eng' }
    )
    expect(w).toEqual({ departmentId: 'd-eng' })
  })
})

// ─── US-7.x Sprint 9: GET /api/users paginated response shape ───────────────

describe('US-7.x Sprint 9: paginated users response', () => {
  test('default page=1, pageSize=20 returns first 20 of 50', () => {
    const r = paginatedUsersResponse(50, {}, makeUsers(50))
    expect(r.users).toHaveLength(20)
    expect(r.totalCount).toBe(50)
    expect(r.page).toBe(1)
    expect(r.pageSize).toBe(20)
    expect(r.totalPages).toBe(3)
  })

  test('page=2 pageSize=5 returns rows 5-9 with no overlap', () => {
    const all = makeUsers(20)
    const p1 = paginatedUsersResponse(20, { page: '1', pageSize: '5' }, all)
    const p2 = paginatedUsersResponse(20, { page: '2', pageSize: '5' }, all)
    expect(p1.users.map(u => u.id)).toEqual(['u-0', 'u-1', 'u-2', 'u-3', 'u-4'])
    expect(p2.users.map(u => u.id)).toEqual(['u-5', 'u-6', 'u-7', 'u-8', 'u-9'])
  })

  test('pageSize=200 caps at MAX 100', () => {
    const r = paginatedUsersResponse(500, { pageSize: '200' }, makeUsers(500))
    expect(r.pageSize).toBe(100)
    expect(r.users).toHaveLength(100)
  })

  test('limit=-1 returns all in one page', () => {
    const r = paginatedUsersResponse(33, { limit: '-1' }, makeUsers(33))
    expect(r.users).toHaveLength(33)
    expect(r.totalPages).toBe(1)
    expect(r.pageSize).toBe(33)
  })

  test('totalCount=0 returns valid empty page', () => {
    const r = paginatedUsersResponse(0, {}, [])
    expect(r.users).toEqual([])
    expect(r.totalCount).toBe(0)
    expect(r.totalPages).toBe(1)
  })
})
