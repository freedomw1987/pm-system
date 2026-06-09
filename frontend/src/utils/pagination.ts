/**
 * Pagination constants — shared between <Pagination> and list pages
 *
 * Default page size of 20 matches the backend's DEFAULT_PAGE_SIZE
 * (backend/src/utils/pagination.ts). Max 100 = backend MAX_PAGE_SIZE.
 */

export const DEFAULT_PAGE_SIZE = 20
export const PAGE_SIZE_OPTIONS = [20, 50, 100] as const
