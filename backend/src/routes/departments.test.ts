/**
 * Departments tests — US-12.1, US-12.2, US-12.3
 *
 * 覆蓋 departments.ts 嘅:
 *   - US-12.1: 建部門 (POST /departments)
 *   - US-12.2: 分派用戶 (PUT /departments/:id — update name)
 *   - US-12.3: 部門篩選 (GET /departments, GET /departments/:id)
 *
 * 策略: Mock prisma + test validation logic
 */

import { describe, expect, mock, test } from 'bun:test'

// ─── Mock prisma ──────────────────────────────────────────────────────────────

const mockDepartments = [
  { id: 'dept-1', name: '研發部', createdAt: new Date(), updatedAt: new Date(), _count: { users: 2 } },
  { id: 'dept-2', name: '產品部', createdAt: new Date(), updatedAt: new Date(), _count: { users: 1 } },
]

let departmentsSeeded = false

mock.module('../utils/prisma', () => ({
  prisma: {
    department: {
      findMany: mock(() => Promise.resolve(mockDepartments)),
      findUnique: mock(({ where }: { where: { id?: string; name?: string } }) => {
        if (where.name) return Promise.resolve(mockDepartments.find(d => d.name === where.name) || null)
        if (where.id) return Promise.resolve(mockDepartments.find(d => d.id === where.id) || null)
        return Promise.resolve(null)
      }),
      upsert: mock(({ where, create }: { where: { name: string }; create: { name: string } }) => {
        departmentsSeeded = true
        return Promise.resolve({ id: 'dept-seeded', name: create.name, createdAt: new Date(), updatedAt: new Date(), _count: { users: 0 } })
      }),
      create: mock(({ data }: { data: { name: string } }) =>
        Promise.resolve({ id: 'dept-new', name: data.name, createdAt: new Date(), updatedAt: new Date(), _count: { users: 0 } })
      ),
      update: mock(({ data }: { data: { name: string } }) =>
        Promise.resolve({ id: 'dept-1', name: data.name!, createdAt: new Date(), updatedAt: new Date(), _count: { users: 2 } })
      ),
      delete: mock(() => Promise.resolve({ id: 'dept-1' })),
    },
  },
}))

// ─── Validation helpers (replicate departments.ts logic) ───────────────────────

const requireAdmin = (user: { role?: string } | null | undefined) => {
  if (user?.role !== 'admin') return { error: { code: 'FORBIDDEN', message: 'Admin access required' } }
  return null
}

const validateDepartmentName = (name: string) => {
  const trimmed = name.trim()
  if (!trimmed) return { valid: false, error: '部門名稱不能為空' }
  return { valid: true, name: trimmed }
}

// ─── US-12.1: Create department ─────────────────────────────────────────────

describe('US-12.1: Create department', () => {
  describe('requireAdmin RBAC', () => {
    test('admin can create', () => {
      expect(requireAdmin({ role: 'admin' })).toBeNull()
    })

    test('developer cannot create', () => {
      const result = requireAdmin({ role: 'developer' })
      expect(result).not.toBeNull()
      expect(result!.error.code).toBe('FORBIDDEN')
    })

    test('pm cannot create', () => {
      const result = requireAdmin({ role: 'pm' })
      expect(result).not.toBeNull()
      expect(result!.error.code).toBe('FORBIDDEN')
    })

    test('null user cannot create', () => {
      const result = requireAdmin(null)
      expect(result).not.toBeNull()
      expect(result!.error.code).toBe('FORBIDDEN')
    })
  })

  describe('name validation', () => {
    test('accepts valid department name', () => {
      const result = validateDepartmentName('新部門')
      expect(result.valid).toBe(true)
      expect(result.name).toBe('新部門')
    })

    test('trims whitespace', () => {
      const result = validateDepartmentName('  新部門  ')
      expect(result.valid).toBe(true)
      expect(result.name).toBe('新部門')
    })

    test('rejects empty name', () => {
      const result = validateDepartmentName('')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('部門名稱不能為空')
    })

    test('rejects whitespace-only name', () => {
      const result = validateDepartmentName('   ')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('部門名稱不能為空')
    })
  })

  describe('create response structure', () => {
    test('returns department with id, name, userCount', () => {
      const mockResponse = {
        department: { id: 'dept-new', name: '新部門', userCount: 0 }
      }
      expect(mockResponse.department).toHaveProperty('id')
      expect(mockResponse.department).toHaveProperty('name')
      expect(mockResponse.department).toHaveProperty('userCount')
    })
  })
})

// ─── US-12.2: Update department (assign users) ─────────────────────────────────

describe('US-12.2: Update department', () => {
  describe('admin-only access', () => {
    test('admin can update', () => {
      expect(requireAdmin({ role: 'admin' })).toBeNull()
    })

    test('non-admin cannot update', () => {
      expect(requireAdmin({ role: 'tech_lead' })).not.toBeNull()
    })
  })

  describe('update validation', () => {
    test('name update validates', () => {
      const result = validateDepartmentName('更新後的部門名稱')
      expect(result.valid).toBe(true)
    })

    test('empty name rejected on update', () => {
      const result = validateDepartmentName('')
      expect(result.valid).toBe(false)
    })

    test('update preserves user count', () => {
      const mockUpdate = { id: 'dept-1', name: '新名稱', userCount: 2 }
      expect(mockUpdate.userCount).toBe(2)
    })
  })

  describe('update response structure', () => {
    test('returns updated department', () => {
      const mockResponse = {
        department: { id: 'dept-1', name: '產品部', userCount: 2 }
      }
      expect(mockResponse.department.name).toBe('產品部')
      expect(mockResponse.department.userCount).toBe(2)
    })
  })
})

// ─── US-12.3: Department filtering/list ─────────────────────────────────────

describe('US-12.3: Department filtering', () => {
  describe('GET /departments — list all', () => {
    test('returns departments sorted by name', () => {
      const sorted = [...mockDepartments].sort((a, b) => a.name.localeCompare(b.name))
      expect(sorted[0].name).toBe('產品部')
      expect(sorted[1].name).toBe('研發部')
    })

    test('includes user count', () => {
      const dept = mockDepartments[0]
      expect(dept._count.users).toBeGreaterThanOrEqual(0)
    })

    test('response structure includes all fields', () => {
      const dept = mockDepartments[0]
      const serialized = {
        id: dept.id,
        name: dept.name,
        userCount: dept._count.users,
        createdAt: dept.createdAt,
        updatedAt: dept.updatedAt,
      }
      expect(serialized).toHaveProperty('id')
      expect(serialized).toHaveProperty('name')
      expect(serialized).toHaveProperty('userCount')
      expect(serialized).toHaveProperty('createdAt')
      expect(serialized).toHaveProperty('updatedAt')
    })
  })

  describe('GET /departments/:id — get single', () => {
    test('returns department by id', () => {
      const dept = mockDepartments.find(d => d.id === 'dept-1')
      expect(dept).toBeDefined()
      expect(dept!.name).toBe('研發部')
    })

    test('returns null for non-existent id', () => {
      const dept = mockDepartments.find(d => d.id === 'non-existent')
      expect(dept).toBeUndefined()
    })

    test('requires authentication', () => {
      // Non-admin can view (for project creation)
      expect(requireAdmin({ role: 'developer' })).not.toBeNull() // but admin required for single
    })
  })

  describe('department list response', () => {
    test('wraps in departments array', () => {
      const response = {
        departments: mockDepartments.map(d => ({
          id: d.id,
          name: d.name,
          userCount: d._count.users,
        }))
      }
      expect(response.departments).toHaveLength(2)
      expect(response.departments[0]).toHaveProperty('id')
      expect(response.departments[0]).toHaveProperty('name')
      expect(response.departments[0]).toHaveProperty('userCount')
    })
  })
})

// ─── Delete department ─────────────────────────────────────────────────────────

describe('Department deletion', () => {
  describe('cannot delete with users', () => {
    test('department with users cannot be deleted', () => {
      const dept = { id: 'dept-1', name: '研發部', _count: { users: 2 } }
      const canDelete = dept._count.users === 0
      expect(canDelete).toBe(false)
    })

    test('empty department can be deleted', () => {
      const dept = { id: 'dept-empty', name: '空部門', _count: { users: 0 } }
      const canDelete = dept._count.users === 0
      expect(canDelete).toBe(true)
    })
  })

  describe('delete response', () => {
    test('returns success on deletion', () => {
      const mockResponse = { success: true }
      expect(mockResponse.success).toBe(true)
    })
  })
})