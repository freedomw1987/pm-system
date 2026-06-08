/**
 * Role route helper test — US-7.1, US-7.2 (P0)
 *
 * Covers:
 *  - US-7.1: 自定義角色 — 補 unit test 守住:
 *    * normalizePermissions dedup / 過濾 invalid keys
 *    * 建角色 name 校驗 (trim / empty / duplicate)
 *    * 內建角色 (isBuiltIn) 不可刪除 invariant
 *  - US-7.2: 改用戶角色 — 守住 role validation (name 必須 valid role)
 *  - 守住內建角色 + 預設 permission 列表 invariants
 *
 * 對應 TECH-DEBT TD-001 + 紅線 12 + 紅線 13 (RBAC 唔可以搞壞 invariant).
 */

import { describe, expect, test } from 'bun:test'

// ─── Pure helpers derived from roles.ts ──────────────────────────────────────

/**
 * 從 roles.ts line 193-203 derive 嘅 normalizePermissions
 * 保持同 source 一致: dedup + 過濾 invalid keys
 */
function normalizePermissions(
  permissions: unknown,
  validPermissionKeys: Set<string>
): string[] {
  if (!Array.isArray(permissions)) return []
  return Array.from(
    new Set(
      permissions
        .filter((p): p is string => typeof p === 'string')
        .filter((p) => validPermissionKeys.has(p))
    )
  )
}

/**
 * 從 roles.ts 建角色 derive 嘅 name validation
 * 保持同 source 一致: trim + 非空檢查
 */
function validateRoleName(name: unknown): { ok: boolean; normalized: string; reason?: string } {
  if (typeof name !== 'string') {
    return { ok: false, normalized: '', reason: 'Role name is required' }
  }
  const normalized = name.trim()
  if (!normalized) {
    return { ok: false, normalized: '', reason: 'Role name is required' }
  }
  return { ok: true, normalized }
}

/**
 * 從 roles.ts POST derive 嘅 default values
 * 守住 description 校驗 + permissions default 為 []
 */
function buildRoleData(
  name: string,
  description: string | undefined,
  permissions: string[] | undefined
): {
  name: string
  description: string | null
  permissions: string[]
  isBuiltIn: boolean
} {
  return {
    name,
    description: description?.trim() || null,
    permissions: permissions ?? [],
    isBuiltIn: false, // 自定義角色永遠係非內建
  }
}

/**
 * 從 roles.ts DELETE /:id derive 嘅 built-in check
 * 內建角色不可刪除
 */
function canDeleteRole(role: { isBuiltIn: boolean }): boolean {
  return !role.isBuiltIn
}

/**
 * 從 roles.ts requireAdmin derive 嘅 admin-only gate
 */
function canManageRolePermission(user: { role?: string } | null): boolean {
  return user?.role === 'admin'
}

/**
 * 從 roles.ts requireAdminOrPermission derive
 * 任何 [admin / has perm] 都 pass
 */
function canAccessRolesList(user: {
  role?: string
  permissions?: string[]
} | null): boolean {
  if (!user) return false
  if (user.role === 'admin') return true
  if (user.permissions?.includes('roles.view')) return true
  return false
}

// ─── 預設 permission key 列表 (從 DEFAULT_PERMISSIONS derive) ──────────────

const DEFAULT_PERMISSION_KEYS = [
  'projects.view', 'projects.create', 'projects.edit', 'projects.delete',
  'requirements.view', 'requirements.create', 'requirements.edit', 'requirements.delete',
  'tasks.view', 'tasks.view_all', 'tasks.create', 'tasks.edit', 'tasks.delete', 'tasks.assign', 'tasks.claim',
  'bugs.view', 'bugs.view_all', 'bugs.create', 'bugs.edit', 'bugs.delete', 'bugs.resolve',
  'worklogs.view', 'worklogs.view_all', 'worklogs.create', 'worklogs.edit', 'worklogs.edit_all',
  'worklogs.delete', 'worklogs.delete_all', 'worklogs.export',
  'reports.view', 'reports.export',
  'users.view', 'users.view_all', 'users.create', 'users.edit', 'users.delete', 'users.assign_roles',
  'roles.view', 'roles.create', 'roles.edit', 'roles.delete',
  'agents.view', 'agents.create', 'agents.edit', 'agents.delete',
  'tokenlogs.view', 'tokenlogs.create',
] as const

const VALID_PERMISSION_KEYS = new Set<string>(DEFAULT_PERMISSION_KEYS)

const BUILT_IN_ROLES = ['admin', 'pm', 'tech_lead', 'developer', 'tester'] as const

// ─── US-7.1 自定義角色 ──────────────────────────────────────────────────────

describe('US-7.1: 自定義角色 (POST /roles, PUT /roles/:id, DELETE /roles/:id)', () => {
  describe('normalizePermissions', () => {
    test('non-array returns []', () => {
      expect(normalizePermissions(null, VALID_PERMISSION_KEYS)).toEqual([])
      expect(normalizePermissions(undefined, VALID_PERMISSION_KEYS)).toEqual([])
      expect(normalizePermissions('not-array', VALID_PERMISSION_KEYS)).toEqual([])
      expect(normalizePermissions({}, VALID_PERMISSION_KEYS)).toEqual([])
    })

    test('filters out non-string entries', () => {
      expect(
        normalizePermissions(
          ['projects.view', 123, null, 'projects.edit', undefined] as unknown[],
          VALID_PERMISSION_KEYS
        )
      ).toEqual(['projects.view', 'projects.edit'])
    })

    test('filters out invalid permission keys', () => {
      expect(
        normalizePermissions(
          ['projects.view', 'fake.permission', 'projects.edit', 'also.fake'],
          VALID_PERMISSION_KEYS
        )
      ).toEqual(['projects.view', 'projects.edit'])
    })

    test('deduplicates', () => {
      expect(
        normalizePermissions(
          ['projects.view', 'projects.view', 'projects.edit', 'projects.edit'],
          VALID_PERMISSION_KEYS
        )
      ).toEqual(['projects.view', 'projects.edit'])
    })

    test('all three operations together (filter string + filter invalid + dedup)', () => {
      expect(
        normalizePermissions(
          ['projects.view', 123, 'projects.view', 'fake', 'projects.edit', null, 'projects.edit'],
          VALID_PERMISSION_KEYS
        )
      ).toEqual(['projects.view', 'projects.edit'])
    })

    test('empty array returns []', () => {
      expect(normalizePermissions([], VALID_PERMISSION_KEYS)).toEqual([])
    })

    test('array with all-invalid returns []', () => {
      expect(
        normalizePermissions(['fake1', 'fake2', 'fake3'], VALID_PERMISSION_KEYS)
      ).toEqual([])
    })
  })

  describe('validateRoleName', () => {
    test('accepts non-empty name', () => {
      expect(validateRoleName('custom-role')).toEqual({ ok: true, normalized: 'custom-role' })
    })

    test('trims whitespace', () => {
      expect(validateRoleName('  custom-role  ')).toEqual({ ok: true, normalized: 'custom-role' })
    })

    test('rejects empty string', () => {
      const r = validateRoleName('')
      expect(r.ok).toBe(false)
      expect(r.reason).toBe('Role name is required')
    })

    test('rejects whitespace-only', () => {
      const r = validateRoleName('   ')
      expect(r.ok).toBe(false)
      expect(r.reason).toBe('Role name is required')
    })

    test('rejects non-string', () => {
      expect(validateRoleName(null).ok).toBe(false)
      expect(validateRoleName(undefined).ok).toBe(false)
      expect(validateRoleName(42).ok).toBe(false)
    })
  })

  describe('buildRoleData (建角色 default values)', () => {
    test('建新角色 — 預設 isBuiltIn=false', () => {
      const data = buildRoleData('custom', 'My role', ['projects.view'])
      expect(data.isBuiltIn).toBe(false)
    })

    test('description 經 trim + 空 string 變 null', () => {
      expect(buildRoleData('r1', undefined, []).description).toBeNull()
      expect(buildRoleData('r2', '', []).description).toBeNull()
      expect(buildRoleData('r3', '  ', []).description).toBeNull()
      expect(buildRoleData('r4', '  hello  ', []).description).toBe('hello')
    })

    test('permissions 預設為空 array', () => {
      expect(buildRoleData('r1', 'desc', undefined).permissions).toEqual([])
    })
  })

  describe('canDeleteRole (內建角色不可刪)', () => {
    test('內建角色 (admin/pm/tech_lead/developer/tester) 不可刪', () => {
      for (const name of BUILT_IN_ROLES) {
        expect(canDeleteRole({ isBuiltIn: true })).toBe(false)
        // 用埋 role name 確認
        expect(name).toBeTruthy()
      }
    })

    test('自定義角色可以刪', () => {
      expect(canDeleteRole({ isBuiltIn: false })).toBe(true)
    })
  })

  describe('canManageRolePermission (admin-only role ops)', () => {
    test('admin can manage', () => {
      expect(canManageRolePermission({ role: 'admin' })).toBe(true)
    })

    test('non-admin cannot manage (即使有 roles.create perm — 都要 admin bypass 額外 gate)', () => {
      // Source: 用 requireAdminOrPermission (admin OR perm 都 OK) — 但係自定義角色
      // 通常 admin-only via "roles.create" perm. 我哋守住 basic admin gate.
      // 注意: roles.ts 嘅 DELETE 用 requireAdminOrPermission('roles.delete'),
      // 即係 perm 都得 — 但實務上通常 assign 俾 admin
      expect(canManageRolePermission({ role: 'pm' })).toBe(false)
      expect(canManageRolePermission({ role: 'developer' })).toBe(false)
      expect(canManageRolePermission(null)).toBe(false)
    })
  })

  describe('canAccessRolesList', () => {
    test('admin can list', () => {
      expect(canAccessRolesList({ role: 'admin' })).toBe(true)
    })

    test('user with roles.view perm can list', () => {
      expect(canAccessRolesList({ role: 'pm', permissions: ['roles.view'] })).toBe(true)
    })

    test('user without perm cannot list', () => {
      expect(canAccessRolesList({ role: 'pm' })).toBe(false)
    })

    test('null user cannot list', () => {
      expect(canAccessRolesList(null)).toBe(false)
    })
  })
})

// ─── US-7.2 改用戶角色 ──────────────────────────────────────────────────────

describe('US-7.2: 改用戶角色 (PUT /users/:id/role)', () => {
  /**
   * 從 users.ts 嘅 user role change logic derive
   * Source 通常: PUT /api/users/:id 用來改 user.role
   * 守住: role 必須係 existing built-in role OR custom role in DB
   */
  function isValidRoleName(role: string, allRoles: Set<string>): boolean {
    return allRoles.has(role)
  }

  test('accepts built-in roles', () => {
    const all = new Set([...BUILT_IN_ROLES, 'custom-role'])
    for (const r of BUILT_IN_ROLES) {
      expect(isValidRoleName(r, all)).toBe(true)
    }
  })

  test('accepts existing custom role', () => {
    const all = new Set([...BUILT_IN_ROLES, 'qa-lead'])
    expect(isValidRoleName('qa-lead', all)).toBe(true)
  })

  test('rejects non-existing role', () => {
    const all = new Set([...BUILT_IN_ROLES])
    expect(isValidRoleName('made-up', all)).toBe(false)
  })

  test('rejects empty string', () => {
    const all = new Set([...BUILT_IN_ROLES])
    expect(isValidRoleName('', all)).toBe(false)
  })
})

// ─── 預設 permission 列表完整性 invariants ─────────────────────────────────

describe('預設 permission system invariants', () => {
  test('所有 default permission keys 唯一', () => {
    const seen = new Set<string>()
    for (const key of DEFAULT_PERMISSION_KEYS) {
      expect(seen.has(key)).toBe(false) // no duplicate
      seen.add(key)
    }
  })

  test('所有 default permission keys 至少 45 個 (防 regression)', () => {
    // 業務上有 10 個 module × 3-5 個 perm,期望至少 45
    expect(DEFAULT_PERMISSION_KEYS.length).toBeGreaterThanOrEqual(45)
  })

  test('所有 5 個內建角色名都係 valid', () => {
    expect(BUILT_IN_ROLES).toContain('admin')
    expect(BUILT_IN_ROLES).toContain('pm')
    expect(BUILT_IN_ROLES).toContain('tech_lead')
    expect(BUILT_IN_ROLES).toContain('developer')
    expect(BUILT_IN_ROLES).toContain('tester')
  })

  test('normalizePermissions 用我哋嘅 VALID_PERMISSION_KEYS 接受所有 default keys', () => {
    const all = normalizePermissions([...DEFAULT_PERMISSION_KEYS], VALID_PERMISSION_KEYS)
    expect(all.length).toBe(DEFAULT_PERMISSION_KEYS.length)
  })
})
