/**
 * Pagination helper — shared across list endpoints (projects, requirements, tasks, bugs).
 *
 * Mirrors the inline logic in worklogs.ts (9adc1fa, US-6.2), with two differences:
 *  - default page size 20 (vs. worklogs' 50) — these are management list pages, not log streams
 *  - max page size 100 (vs. worklogs' 200) — UI sweet spot
 *
 * Behavior:
 *  - `limit=-1` → no pagination, return everything
 *  - `limit>0`  → exact N rows, ignore page/pageSize (used by future Excel export)
 *  - otherwise  → use page/pageSize (1-based page)
 *
 * Pages / pageSize are always clamped to safe bounds; bad input never throws.
 */

export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 100

export interface PaginationInput {
  page?: string | number
  pageSize?: string | number
  limit?: string | number
}

export interface PaginationResult {
  skip: number
  take: number | undefined
  page: number
  pageSize: number
  totalPages: number
  wantsAll: boolean
}

const toInt = (v: string | number | undefined, fallback: number): number => {
  if (v === undefined || v === null || v === '') return fallback
  const n = parseInt(String(v))
  // Reject 0/negative — fall back to default. Caller (limit) does its own parsing
  // for special values like -1.
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export const computePagination = (input: PaginationInput, totalCount: number): PaginationResult => {
  // For limit, use NaN as fallback so the caller can detect "no limit param supplied"
  // (consistent with worklogs.ts rawLimit pattern)
  const rawLimit = input.limit !== undefined && input.limit !== null && input.limit !== ''
    ? parseInt(String(input.limit))
    : Number.NaN
  const wantsAll = !Number.isNaN(rawLimit) && rawLimit === -1
  const hasExplicitLimit = !Number.isNaN(rawLimit) && rawLimit > 0

  // For page/pageSize, fall back to default when value is 0/negative (mirrors worklogs.ts)
  const pageSize = Math.min(
    Math.max(toInt(input.pageSize, DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE, 1),
    MAX_PAGE_SIZE
  )
  const page = Math.max(toInt(input.page, 1) || 1, 1)
  const skip = wantsAll || hasExplicitLimit ? 0 : (page - 1) * pageSize
  const take = wantsAll ? undefined : hasExplicitLimit ? rawLimit : pageSize

  return {
    skip,
    take,
    page: wantsAll || hasExplicitLimit ? 1 : page,
    pageSize: wantsAll ? totalCount : hasExplicitLimit ? rawLimit : pageSize,
    totalPages: wantsAll || hasExplicitLimit ? 1 : Math.max(Math.ceil(totalCount / pageSize), 1),
    wantsAll
  }
}
