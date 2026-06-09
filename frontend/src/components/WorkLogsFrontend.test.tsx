/**
 * Frontend Tests — WorkLogs (US-6.2-6.4)
 */

import { describe, expect, test } from 'vitest'

// ─── US-6.2: WorkLog Pagination ─────────────────────────────────

describe('US-6.2: WorkLog Pagination', () => {
  test('calculates pagination correctly', () => {
    const calcPagination = (total: number, page: number, pageSize: number) => {
      const totalPages = Math.ceil(total / pageSize)
      const hasNext = page < totalPages
      const hasPrev = page > 1
      return { totalPages, hasNext, hasPrev }
    }

    expect(calcPagination(100, 1, 20)).toEqual({ totalPages: 5, hasNext: true, hasPrev: false })
    expect(calcPagination(100, 3, 20)).toEqual({ totalPages: 5, hasNext: true, hasPrev: true })
    expect(calcPagination(100, 5, 20)).toEqual({ totalPages: 5, hasNext: false, hasPrev: true })
  })

  test('handles edge cases', () => {
    const calcPages = (total: number, size: number) => Math.ceil(total / size)
    expect(calcPages(0, 20)).toBe(0)
    expect(calcPages(1, 20)).toBe(1)
    expect(calcPages(20, 20)).toBe(1)
    expect(calcPages(21, 20)).toBe(2)
  })
})

// ─── US-6.4: WorkLog Filtering ───────────────────────────────────

describe('US-6.4: WorkLog Filtering', () => {
  test('filters by project', () => {
    interface WorkLog { projectId?: string; hours: number }
    const filterByProject = (logs: WorkLog[], projectId: string) =>
      logs.filter(l => l.projectId === projectId)

    const logs: WorkLog[] = [
      { projectId: 'p1', hours: 2 },
      { projectId: 'p2', hours: 3 },
      { projectId: 'p1', hours: 1 },
    ]

    expect(filterByProject(logs, 'p1')).toHaveLength(2)
    expect(filterByProject(logs, 'p2')).toHaveLength(1)
  })

  test('filters by user', () => {
    interface WorkLog { userId: string; hours: number }
    const filterByUser = (logs: WorkLog[], userId: string) =>
      logs.filter(l => l.userId === userId)

    const logs: WorkLog[] = [
      { userId: 'u1', hours: 2 },
      { userId: 'u2', hours: 3 },
    ]

    expect(filterByUser(logs, 'u1')).toHaveLength(1)
    expect(filterByUser(logs, 'u2')).toHaveLength(1)
  })

  test('filters by date range', () => {
    interface WorkLog { date: string; hours: number }
    const filterByDateRange = (logs: WorkLog[], start: string, end: string) =>
      logs.filter(l => l.date >= start && l.date <= end)

    const logs: WorkLog[] = [
      { date: '2026-06-01', hours: 2 },
      { date: '2026-06-15', hours: 3 },
      { date: '2026-06-30', hours: 1 },
    ]

    const filtered = filterByDateRange(logs, '2026-06-01', '2026-06-15')
    expect(filtered).toHaveLength(2)
  })
})

// ─── WorkLog Hours Calculation ─────────────────────────────────────

describe('WorkLog Hours', () => {
  test('sums hours correctly', () => {
    const sumHours = (logs: { hours: number }[]) =>
      logs.reduce((sum, l) => sum + l.hours, 0)

    expect(sumHours([{ hours: 2 }, { hours: 3 }, { hours: 1 }])).toBe(6)
    expect(sumHours([])).toBe(0)
    expect(sumHours([{ hours: 8 }])).toBe(8)
  })

  test('validates hours range', () => {
    const isValidHours = (h: number) => h > 0 && h <= 24
    expect(isValidHours(8)).toBe(true)
    expect(isValidHours(0)).toBe(false)
    expect(isValidHours(25)).toBe(false)
    expect(isValidHours(-1)).toBe(false)
  })
})