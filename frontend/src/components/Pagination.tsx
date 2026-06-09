/**
 * Pagination — shared control for paginated list pages
 *
 * 對應 US-7.x (Pagination sprint): 用喺 ProjectsPage / RequirementsPage /
 * TasksPage / BugsPage 嘅列表底。WorkLogsPage 沿用自己嘅 inline 版本
 * (有 groupBy mode 嘅特殊需求)。
 *
 * Design:
 *  - 純 controlled component: page / pageSize 由 caller 擁有
 *  - caller 收到 page change → 自己 setState → 自己重新 fetch
 *  - totalCount === 0 時不 render(同 WorkLogsPage 一致)
 *  - 繁體中文 labels 配 WorkLogsPage 嘅 ui 風格
 *
 * Usage:
 *   <Pagination
 *     page={page}
 *     pageSize={pageSize}
 *     totalCount={totalCount}
 *     totalPages={totalPages}
 *     onPageChange={setPage}
 *     onPageSizeChange={setPageSize}
 *   />
 */

import { PAGE_SIZE_OPTIONS } from '../utils/pagination'

export interface PaginationProps {
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
  /** Optional override of available page sizes; defaults to 20/50/100 */
  pageSizeOptions?: readonly number[]
}

export default function Pagination({
  page,
  pageSize,
  totalCount,
  totalPages,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
}: PaginationProps) {
  // Don't render anything when there's nothing to paginate
  if (totalCount === 0) return null

  const startRow = (page - 1) * pageSize + 1
  const endRow = Math.min(page * pageSize, totalCount)

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4 px-1">
      <div className="text-sm text-gray-500">
        第 <span className="font-medium text-gray-900">{startRow}</span>–
        <span className="font-medium text-gray-900">{endRow}</span> 筆，共{' '}
        <span className="font-medium text-gray-900">{totalCount}</span> 筆
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <label className="text-sm text-gray-500">每頁</label>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(parseInt(e.target.value))}
          className="input-field text-sm py-1 w-auto"
        >
          {pageSizeOptions.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1 ml-2">
          <button
            type="button"
            onClick={() => onPageChange(1)}
            disabled={page <= 1}
            className="px-2 py-1 text-sm rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            title="首頁"
          >
            «
          </button>
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="px-3 py-1 text-sm rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            上一頁
          </button>
          <span className="px-3 py-1 text-sm text-gray-700">
            第 <span className="font-medium text-gray-900">{page}</span> / {totalPages} 頁
          </span>
          <button
            type="button"
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1 text-sm rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            下一頁
          </button>
          <button
            type="button"
            onClick={() => onPageChange(totalPages)}
            disabled={page >= totalPages}
            className="px-2 py-1 text-sm rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            title="尾頁"
          >
            »
          </button>
        </div>
      </div>
    </div>
  )
}
