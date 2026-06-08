/**
 * RBAC permission middleware test
 *
 * Covers US-7.3 (P0): "作為任何用戶,系統根據我嘅角色擋住我冇權限嘅 endpoint"
 *
 * 對應 TECH-DEBT TD-001 + 紅線 12 (P0 US 必有 test)。
 *
 * 注意:呢份 test 純 unit,唔 mock DB。源碼 RBAC 邏輯:
 *   - hasPermission: null → false, admin → true (bypass), else check permissions array
 *   - hasAllPermissions / hasAnyPermission: composite
 *   - requirePermission: 包成 Elysia 403 response
 */

import { describe, expect, test } from 'bun:test'
import {
  hasPermission,
  hasAllPermissions,
  hasAnyPermission,
  requirePermission,
  type AuthUser,
} from './permission'

describe('hasPermission', () => {
  test('returns false for null user', () => {
    expect(hasPermission(null, 'projects.view')).toBe(false)
    expect(hasPermission(undefined, 'projects.view')).toBe(false)
  })

  test('admin role bypasses all permission checks', () => {
    const admin: AuthUser = { id: 'u-1', role: 'admin' }
    expect(hasPermission(admin, 'projects.view')).toBe(true)
    expect(hasPermission(admin, 'agents.create')).toBe(true)
    expect(hasPermission(admin, 'tokenlogs.view')).toBe(true)
  })

  test('non-admin user with permission in array passes', () => {
    const pm: AuthUser = {
      id: 'u-2',
      role: 'pm',
      permissions: ['projects.view', 'projects.create'],
    }
    expect(hasPermission(pm, 'projects.view')).toBe(true)
    expect(hasPermission(pm, 'projects.create')).toBe(true)
  })

  test('non-admin user without permission is denied', () => {
    const viewer: AuthUser = {
      id: 'u-3',
      role: 'visitor',
      permissions: ['projects.view'],
    }
    expect(hasPermission(viewer, 'projects.create')).toBe(false)
    expect(hasPermission(viewer, 'agents.delete')).toBe(false)
  })

  test('non-admin user with no permissions array is denied for everything', () => {
    const newUser: AuthUser = { id: 'u-4', role: 'developer' }
    expect(hasPermission(newUser, 'projects.view')).toBe(false)
  })

  test('Agent user (isAgent=true) follows normal RBAC', () => {
    // Agent 都係 User,同樣走 permission array
    const agent: AuthUser = {
      id: 'a-1',
      role: 'developer',
      isAgent: true,
      agentConfig: { model: 'gpt-4o-mini' },
      permissions: ['tasks.view', 'tasks.claim'],
    }
    expect(hasPermission(agent, 'tasks.view')).toBe(true)
    expect(hasPermission(agent, 'tasks.claim')).toBe(true)
    expect(hasPermission(agent, 'users.delete')).toBe(false)
  })
})

describe('hasAllPermissions / hasAnyPermission', () => {
  test('hasAllPermissions: requires every permission', () => {
    const user: AuthUser = {
      id: 'u-5',
      role: 'pm',
      permissions: ['projects.view', 'projects.create'],
    }
    expect(hasAllPermissions(user, ['projects.view', 'projects.create'])).toBe(true)
    expect(hasAllPermissions(user, ['projects.view', 'projects.delete'])).toBe(false)
  })

  test('hasAnyPermission: passes if at least one is held', () => {
    const user: AuthUser = {
      id: 'u-6',
      role: 'tech_lead',
      permissions: ['tasks.view'],
    }
    expect(hasAnyPermission(user, ['tasks.view', 'tasks.create'])).toBe(true)
    expect(hasAnyPermission(user, ['tasks.delete', 'projects.delete'])).toBe(false)
  })

  test('hasAllPermissions: empty list returns true (vacuously)', () => {
    const user: AuthUser = { id: 'u-7', role: 'visitor' }
    expect(hasAllPermissions(user, [])).toBe(true)
  })
})

describe('requirePermission (Elysia response wrapper)', () => {
  const fakeSet = { status: 200 }

  test('returns null and does not modify set on success', () => {
    const admin: AuthUser = { id: 'u-8', role: 'admin' }
    const result = requirePermission(admin, 'projects.view', fakeSet)
    expect(result).toBeNull()
    expect(fakeSet.status).toBe(200)
  })

  test('returns 403 error response on denied permission', () => {
    const viewer: AuthUser = {
      id: 'u-9',
      role: 'visitor',
      permissions: ['projects.view'],
    }
    const result = requirePermission(viewer, 'projects.delete', fakeSet)
    expect(result).not.toBeNull()
    expect(result!.error.code).toBe('FORBIDDEN')
    expect(result!.error.message).toContain('projects.delete')
    expect(fakeSet.status).toBe(403)
  })

  test('returns 403 for null user', () => {
    const result = requirePermission(null, 'projects.view', fakeSet)
    expect(result).not.toBeNull()
    expect(result!.error.code).toBe('FORBIDDEN')
    expect(fakeSet.status).toBe(403)
  })
})

/**
 * Cross-role smoke matrix — 對齊 PRD US-7.1 + US-7.2
 * 每個 role 對 critical permission 嘅 default 行為
 */
describe('Role × Permission matrix (regression guard US-7.3)', () => {
  const cases: Array<{
    role: string
    permissions: string[]
    perm: string
    expected: boolean
  }> = [
    // Developer 應該可以睇自己嘅 worklog + tasks
    { role: 'developer', permissions: ['tasks.view', 'worklogs.view'], perm: 'tasks.view', expected: true },
    { role: 'developer', permissions: ['tasks.view', 'worklogs.view'], perm: 'users.delete', expected: false },
    // Tester 應該可以睇 bugs 但唔可以分派
    { role: 'tester', permissions: ['bugs.view', 'bugs.create'], perm: 'bugs.view', expected: true },
    { role: 'tester', permissions: ['bugs.view', 'bugs.create'], perm: 'tasks.assign', expected: false },
    // Visitor 全部都 read-only
    { role: 'visitor', permissions: ['projects.view', 'reports.view'], perm: 'projects.view', expected: true },
    { role: 'visitor', permissions: ['projects.view', 'reports.view'], perm: 'projects.create', expected: false },
  ]

  for (const c of cases) {
    test(`${c.role} on '${c.perm}' → ${c.expected}`, () => {
      const user: AuthUser = { id: 'u-test', role: c.role, permissions: c.permissions }
      expect(hasPermission(user, c.perm)).toBe(c.expected)
    })
  }
})
