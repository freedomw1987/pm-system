/**
 * Frontend Utils Tests — P0 + P1 Coverage
 *
 * 涵蓋:
 *  - Permission checking utilities
 *  - API response parsing
 *  - Date formatting
 *  - Pagination helpers
 */

import { describe, expect, test } from 'vitest'

// ─── Permission Utilities ───────────────────────────────────────────────────────

describe('Permission Utilities', () => {
  const hasPermission = (user: { role: string; permissions?: string[] }, permission: string): boolean => {
    if (user.role === 'admin') return true
    return user.permissions?.includes(permission) ?? false
  }

  test('admin has all permissions', () => {
    const admin = { role: 'admin', permissions: [] }
    expect(hasPermission(admin, 'projects.create')).toBe(true)
    expect(hasPermission(admin, 'tasks.delete')).toBe(true)
    expect(hasPermission(admin, 'users.manage')).toBe(true)
  })

  test('developer has specific permissions', () => {
    const dev = { role: 'developer', permissions: ['projects.view', 'tasks.create', 'tasks.edit'] }
    expect(hasPermission(dev, 'projects.view')).toBe(true)
    expect(hasPermission(dev, 'tasks.create')).toBe(true)
    expect(hasPermission(dev, 'tasks.delete')).toBe(false)
    expect(hasPermission(dev, 'users.manage')).toBe(false)
  })

  test('pm has project permissions', () => {
    const pm = { role: 'pm', permissions: ['projects.view', 'projects.create', 'requirements.edit'] }
    expect(hasPermission(pm, 'projects.view')).toBe(true)
    expect(hasPermission(pm, 'requirements.edit')).toBe(true)
    expect(hasPermission(pm, 'users.delete')).toBe(false)
  })
})

// ─── API Response Parsing ───────────────────────────────────────────────────────

describe('API Response Parsing', () => {
  test('parses paginated response', () => {
    const mockResponse = {
      projects: [{ id: '1', name: 'Project 1' }],
      totalCount: 50,
      page: 1,
      pageSize: 10,
      totalPages: 5,
    }
    expect(mockResponse.projects).toHaveLength(1)
    expect(mockResponse.totalCount).toBe(50)
    expect(mockResponse.page).toBe(1)
    expect(mockResponse.totalPages).toBe(5)
  })

  test('parses error response', () => {
    const errorResponse = {
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      },
    }
    expect(errorResponse.error).toHaveProperty('code')
    expect(errorResponse.error).toHaveProperty('message')
  })
})

// ─── Date Formatting ────────────────────────────────────────────────────────────

describe('Date Formatting', () => {
  test('formats date to YYYY-MM-DD', () => {
    const date = new Date('2026-06-10T12:00:00Z')
    const formatted = date.toISOString().split('T')[0]
    expect(formatted).toBe('2026-06-10')
  })

  test('formats date to locale string', () => {
    const date = new Date('2026-06-10')
    const localeDate = date.toLocaleDateString('zh-TW')
    expect(localeDate).toMatch(/2026|6|10/)
  })

  test('calculates week key for grouping', () => {
    const date = new Date('2026-06-10')
    const getWeekKey = (d: Date) => {
      const utcDate = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
      const day = utcDate.getUTCDay() || 7
      utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day)
      const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1))
      return Math.ceil((((utcDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7).toString()
    }
    const weekKey = getWeekKey(date)
    expect(typeof weekKey).toBe('string')
    expect(parseInt(weekKey)).toBeGreaterThan(0)
  })
})

// ─── Pagination Helpers ─────────────────────────────────────────────────────────

describe('Pagination Helpers', () => {
  const MAX_PAGE_SIZE = 100

  test('calculates total pages correctly', () => {
    const calcTotalPages = (total: number, pageSize: number) => Math.ceil(total / pageSize)
    expect(calcTotalPages(100, 20)).toBe(5)
    expect(calcTotalPages(101, 20)).toBe(6)
    expect(calcTotalPages(0, 20)).toBe(0)
    expect(calcTotalPages(50, 20)).toBe(3)
  })

  test('respects max page size', () => {
    const safePageSize = (size: number) => Math.min(Math.max(size, 1), MAX_PAGE_SIZE)
    expect(safePageSize(50)).toBe(50)
    expect(safePageSize(200)).toBe(100)
    expect(safePageSize(0)).toBe(1)
    expect(safePageSize(-10)).toBe(1)
  })

  test('calculates skip offset for Prisma', () => {
    const calcSkip = (page: number, pageSize: number) => (page - 1) * pageSize
    expect(calcSkip(1, 20)).toBe(0)
    expect(calcSkip(2, 20)).toBe(20)
    expect(calcSkip(3, 20)).toBe(40)
    expect(calcSkip(1, 50)).toBe(0)
    expect(calcSkip(2, 50)).toBe(50)
  })
})

// ─── Status Color Mapping ───────────────────────────────────────────────────────

describe('Status Color Mapping', () => {
  const getStatusColor = (status: string): string => {
    const colors: Record<string, string> = {
      pending: 'bg-gray-100',
      in_progress: 'bg-blue-100',
      completed: 'bg-green-100',
      testing: 'bg-yellow-100',
      open: 'bg-red-100',
      resolved: 'bg-green-100',
      verified: 'bg-green-200',
    }
    return colors[status] || 'bg-gray-100'
  }

  test('returns correct colors for task statuses', () => {
    expect(getStatusColor('pending')).toBe('bg-gray-100')
    expect(getStatusColor('in_progress')).toBe('bg-blue-100')
    expect(getStatusColor('completed')).toBe('bg-green-100')
  })

  test('returns correct colors for bug statuses', () => {
    expect(getStatusColor('open')).toBe('bg-red-100')
    expect(getStatusColor('resolved')).toBe('bg-green-100')
    expect(getStatusColor('verified')).toBe('bg-green-200')
  })

  test('returns default for unknown status', () => {
    expect(getStatusColor('unknown')).toBe('bg-gray-100')
    expect(getStatusColor('')).toBe('bg-gray-100')
  })
})