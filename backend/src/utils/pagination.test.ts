/**
 * Pagination helper test — US-7.x (Pagination sprint)
 *
 * 覆蓋 4 個 list endpoint 共用嘅分頁計算邏輯:
 *  - GET /api/projects
 *  - GET /api/requirements
 *  - GET /api/tasks
 *  - GET /api/bugs
 *
 * Source: backend/src/utils/pagination.ts
 * 跟 worklogs.test.ts 同樣 derive pattern — inlined compute 等價於 source 嘅 pure function。
 *
 * 對應紅線 11 (P0 US 必有 unit test)。
 */

import { describe, expect, test } from 'bun:test'
import { computePagination, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './pagination'

describe('computePagination — default behavior (US-7.x pagination sprint)', () => {
  test('no params uses DEFAULT_PAGE_SIZE (20) and page 1', () => {
    const r = computePagination({}, 200)
    expect(r.skip).toBe(0)
    expect(r.take).toBe(DEFAULT_PAGE_SIZE)
    expect(r.page).toBe(1)
    expect(r.pageSize).toBe(20)
    expect(r.totalPages).toBe(10)
    expect(r.wantsAll).toBe(false)
  })

  test('page=2 pageSize=20 skips 20 and takes 20', () => {
    const r = computePagination({ page: 2, pageSize: 20 }, 200)
    expect(r.skip).toBe(20)
    expect(r.take).toBe(20)
    expect(r.page).toBe(2)
  })

  test('pageSize caps at MAX_PAGE_SIZE (100)', () => {
    const r = computePagination({ pageSize: 9999 }, 5000)
    expect(r.pageSize).toBe(MAX_PAGE_SIZE)
    expect(r.pageSize).toBe(100)
    expect(r.take).toBe(100)
  })

  test('pageSize=0 falls back to DEFAULT_PAGE_SIZE', () => {
    const r = computePagination({ pageSize: 0 }, 100)
    expect(r.pageSize).toBe(20)
  })

  test('page=0 falls back to page 1', () => {
    const r = computePagination({ page: 0 }, 100)
    expect(r.page).toBe(1)
    expect(r.skip).toBe(0)
  })

  test('negative pageSize falls back to DEFAULT_PAGE_SIZE', () => {
    const r = computePagination({ pageSize: -5 }, 100)
    expect(r.pageSize).toBe(20)
  })

  test('string params (from query string) are coerced to ints', () => {
    const r = computePagination(
      { page: '3', pageSize: '15' } as { page: string; pageSize: string },
      100
    )
    expect(r.page).toBe(3)
    expect(r.pageSize).toBe(15)
    expect(r.skip).toBe(30)
    expect(r.take).toBe(15)
  })

  test('garbage params fall back to defaults', () => {
    const r = computePagination(
      { page: 'abc', pageSize: 'xyz' } as unknown as { page: string; pageSize: string },
      100
    )
    expect(r.page).toBe(1)
    expect(r.pageSize).toBe(20)
  })
})

describe('computePagination — limit overrides page/pageSize', () => {
  test('limit=-1 returns everything (no skip, no take cap)', () => {
    const r = computePagination({ limit: -1 }, 1234)
    expect(r.wantsAll).toBe(true)
    expect(r.skip).toBe(0)
    expect(r.take).toBeUndefined()
    expect(r.pageSize).toBe(1234)
    expect(r.totalPages).toBe(1)
  })

  test('limit=50 returns exact 50 rows (Excel export style)', () => {
    const r = computePagination({ limit: 50 }, 1000)
    expect(r.wantsAll).toBe(false)
    expect(r.skip).toBe(0)
    expect(r.take).toBe(50)
    expect(r.pageSize).toBe(50)
    expect(r.page).toBe(1)
  })

  test('limit>0 takes precedence over page/pageSize', () => {
    const r = computePagination(
      { page: 5, pageSize: 20, limit: 100 },
      1000
    )
    expect(r.skip).toBe(0)
    expect(r.take).toBe(100)
    expect(r.page).toBe(1)
    expect(r.pageSize).toBe(100)
  })

  test('limit=0 falls back to default (no explicit-limit path)', () => {
    const r = computePagination({ limit: 0 }, 100)
    expect(r.wantsAll).toBe(false)
    expect(r.take).toBe(DEFAULT_PAGE_SIZE)
  })
})

describe('computePagination — edge cases', () => {
  test('totalCount=0 still yields totalPages >= 1', () => {
    const r = computePagination({}, 0)
    expect(r.totalPages).toBe(1)
  })

  test('totalCount=11 with pageSize=20 fits on 1 page', () => {
    const r = computePagination({ pageSize: 20 }, 11)
    expect(r.totalPages).toBe(1)
    expect(r.skip).toBe(0)
    expect(r.take).toBe(20)
  })

  test('totalCount=21 with pageSize=20 needs 2 pages', () => {
    const r = computePagination({ pageSize: 20 }, 21)
    expect(r.totalPages).toBe(2)
  })

  test('page beyond totalPages still returns safe skip/take (no throw)', () => {
    // Caller might request page=999 of a 5-row dataset
    const r = computePagination({ page: 999, pageSize: 20 }, 5)
    expect(r.skip).toBe(19960) // (999-1)*20 — Prisma will return empty
    expect(r.take).toBe(20)
  })

  test('empty params object is safe', () => {
    expect(() => computePagination({}, 0)).not.toThrow()
  })
})
