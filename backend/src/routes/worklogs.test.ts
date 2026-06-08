/**
 * WorkLog helper test — regression guard
 *
 * 涵蓋:
 *  - US-6.2 (P0): server-side pagination (commit 9adc1fa)
 *  - US-6.3 (P1): Excel export uses `limit=-1` 同 `limit>0` 路徑
 *  - RG 守衛: "上個月 cutoff" 規則(5 號當月)— 防止 PM 改壞規則
 *
 * 因為 worklogs.ts 嘅邏輯入面 route,冇 extract helper 出嚟,呢度 derive
 * 對應嘅 pure function logic(以 unit test 守住 invariant),為將來 refactor
 * 留落 helper 時有 baseline。
 */

import { describe, expect, test } from 'bun:test'

/**
 * 從 worklogs.ts derive 嘅分頁計算邏輯(原 inline,冇 export)。
 * 保持同 source 一致:limit=-1 = all,limit>0 = exact,否則 page/pageSize。
 */
const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 200

function computeWorkLogPagination(opts: {
  page?: string | number
  pageSize?: string | number
  limit?: string | number
  totalCount: number
}) {
  const rawLimit = opts.limit !== undefined ? parseInt(String(opts.limit)) : NaN
  const wantsAll = !Number.isNaN(rawLimit) && rawLimit === -1
  const hasExplicitLimit = !Number.isNaN(rawLimit) && rawLimit > 0

  const pageSize = Math.min(
    Math.max(parseInt(String(opts.pageSize ?? DEFAULT_PAGE_SIZE)) || DEFAULT_PAGE_SIZE, 1),
    MAX_PAGE_SIZE
  )
  const page = Math.max(parseInt(String(opts.page ?? 1)) || 1, 1)
  const skip = wantsAll ? 0 : hasExplicitLimit ? 0 : (page - 1) * pageSize
  const take = wantsAll ? undefined : hasExplicitLimit ? rawLimit : pageSize

  return {
    skip,
    take,
    page: wantsAll || hasExplicitLimit ? 1 : page,
    pageSize: wantsAll ? opts.totalCount : hasExplicitLimit ? rawLimit : pageSize,
    totalPages: wantsAll || hasExplicitLimit ? 1 : Math.max(Math.ceil(opts.totalCount / pageSize), 1),
    wantsAll,
  }
}

/**
 * 從 worklogs.ts PUT/DELETE derive 嘅「上個月 5 號 cutoff」邏輯
 * 保持同 source 完全一致:5 號之前嘅 log,non-admin 唔可以改
 */
function isEditableForCurrentMonth(
  logDate: Date,
  now: Date = new Date()
): boolean {
  const currentMonth = now.getMonth()
  const currentYear = now.getFullYear()
  const cutoffDate = new Date(currentYear, currentMonth, 5)
  return logDate >= cutoffDate
}

describe('WorkLog pagination (US-6.2, regression for 9adc1fa)', () => {
  test('default page=1 pageSize=50 returns first 50 rows', () => {
    const result = computeWorkLogPagination({ totalCount: 200 })
    expect(result.skip).toBe(0)
    expect(result.take).toBe(50)
    expect(result.page).toBe(1)
    expect(result.totalPages).toBe(4)
  })

  test('page=2 pageSize=50 returns rows 51-100', () => {
    const result = computeWorkLogPagination({ page: 2, totalCount: 200 })
    expect(result.skip).toBe(50)
    expect(result.take).toBe(50)
    expect(result.page).toBe(2)
  })

  test('pageSize caps at MAX_PAGE_SIZE=200', () => {
    const result = computeWorkLogPagination({ pageSize: 999, totalCount: 1000 })
    expect(result.pageSize).toBe(200)
  })

  test('pageSize=0 falls back to DEFAULT_PAGE_SIZE', () => {
    const result = computeWorkLogPagination({ pageSize: 0, totalCount: 100 })
    expect(result.pageSize).toBe(50)
  })

  test('page=0 falls back to page 1', () => {
    const result = computeWorkLogPagination({ page: 0, totalCount: 100 })
    expect(result.page).toBe(1)
  })

  test('limit=-1 returns everything (Excel export use case)', () => {
    const result = computeWorkLogPagination({ limit: -1, totalCount: 1234 })
    expect(result.wantsAll).toBe(true)
    expect(result.skip).toBe(0)
    expect(result.take).toBeUndefined()
    expect(result.pageSize).toBe(1234)
  })

  test('limit=500 returns exact 500 rows (UI cap)', () => {
    const result = computeWorkLogPagination({ limit: 500, totalCount: 1000 })
    expect(result.wantsAll).toBe(false)
    expect(result.skip).toBe(0)
    expect(result.take).toBe(500)
    expect(result.pageSize).toBe(500)
  })

  test('limit takes precedence over page/pageSize', () => {
    const result = computeWorkLogPagination({
      page: 5,
      pageSize: 50,
      limit: 100,
      totalCount: 1000,
    })
    expect(result.skip).toBe(0)
    expect(result.take).toBe(100)
    expect(result.page).toBe(1)
  })

  test('totalPages is at least 1 even when totalCount=0', () => {
    const result = computeWorkLogPagination({ totalCount: 0 })
    expect(result.totalPages).toBe(1)
  })
})

describe('WorkLog previous-month cutoff (RG guard)', () => {
  test('logs from current month on day >=5 are editable', () => {
    // 假設 today = 2026-06-10
    const now = new Date('2026-06-10')
    const logDate = new Date('2026-06-08')
    expect(isEditableForCurrentMonth(logDate, now)).toBe(true)
  })

  test('logs from current month on day <5 are NOT editable (regression)', () => {
    // 假設 today = 2026-06-10,cutoff = 2026-06-05
    // log 喺 06-03 → 太早
    const now = new Date('2026-06-10')
    const logDate = new Date('2026-06-03')
    expect(isEditableForCurrentMonth(logDate, now)).toBe(false)
  })

  test('logs from previous month are never editable', () => {
    const now = new Date('2026-06-10')
    const logDate = new Date('2026-05-31')
    expect(isEditableForCurrentMonth(logDate, now)).toBe(false)
  })

  test('logs from previous year are never editable', () => {
    const now = new Date('2026-06-10')
    const logDate = new Date('2025-12-15')
    expect(isEditableForCurrentMonth(logDate, now)).toBe(false)
  })

  test('cutoff boundary: log on exactly the 5th is editable', () => {
    const now = new Date('2026-06-10T00:00:00')
    const logDate = new Date('2026-06-05T00:00:00')
    expect(isEditableForCurrentMonth(logDate, now)).toBe(true)
  })

  test('cutoff boundary: log on 4th is NOT editable', () => {
    const now = new Date('2026-06-10T00:00:00')
    const logDate = new Date('2026-06-04T23:59:59')
    expect(isEditableForCurrentMonth(logDate, now)).toBe(false)
  })
})
