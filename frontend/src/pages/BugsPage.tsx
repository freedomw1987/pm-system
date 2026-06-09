/**
 * BugsPage — 全部缺陷列表(/bugs)
 *
 * 對應 bug fix 2026-06-09:
 *   - bug #2: 缺少「新增缺陷」按鈕 — page header 加「新建缺陷」button
 *   - bug #3: 無法查看缺陷詳情 — bug row click 去 /bugs/:id (BugDetailPage)
 *   - bug #5: 缺少按項目篩選 — project filter dropdown
 *
 * 跟 MyBugsPage 嘅 pattern 對齊(status / severity / format helpers 類似),
 * 差異:
 *   - title 改「全部缺陷」,filter scope 預設 'all'
 *   - header 加「新建缺陷」button
 *   - 右上角加項目 filter dropdown
 *   - 每一 row click 跳去 /bugs/:id(新 page)
 */
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, Bug, CheckCircle, ChevronDown, Plus } from 'lucide-react'
import { bugApi, projectApi } from '../utils/api'
import type { Bug as BugType, Project } from '../types'
import CreateBugModal from '../components/CreateBugModal'
import clsx from 'clsx'
import Pagination from '../components/Pagination'
import { DEFAULT_PAGE_SIZE } from '../utils/pagination'

type BugFilter = 'all' | 'open' | 'in_progress' | 'resolved' | 'verified'

const STATUS_LABELS: Record<string, string> = {
  all: '全部',
  open: '待處理',
  in_progress: '處理中',
  resolved: '已解決',
  verified: '已驗證',
}

const SEVERITY_LABELS: Record<string, string> = {
  critical: '嚴重',
  high: '高',
  medium: '中',
  low: '低',
}

export default function BugsPage() {
  const [bugs, setBugs] = useState<BugType[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filter, setFilter] = useState<BugFilter>('all')
  const [projectFilter, setProjectFilter] = useState<string>('') // '' = all projects
  const [showCreate, setShowCreate] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Pagination (US-7.x) — server-side status + project filter, page/pageSize
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [totalCount, setTotalCount] = useState(0)
  const [totalPages, setTotalPages] = useState(1)

  useEffect(() => {
    loadBugs()
    loadProjects()
  }, [])

  // Reset to page 1 whenever a filter changes
  useEffect(() => {
    setPage(1)
  }, [filter, projectFilter])

  // Re-fetch on any of: status tab, project dropdown, page, pageSize
  useEffect(() => {
    loadBugs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, projectFilter, page, pageSize])

  const loadBugs = async () => {
    setIsLoading(true)
    setError('')
    try {
      const params: {
        projectId?: string
        status?: string
        page: number
        pageSize: number
      } = { page, pageSize }
      if (projectFilter) params.projectId = projectFilter
      if (filter !== 'all') params.status = filter
      const response = await bugApi.list(params)
      setBugs(response.data.bugs || [])
      setTotalCount(response.data.totalCount ?? response.data.bugs?.length ?? 0)
      setTotalPages(response.data.totalPages ?? 1)
    } catch (err) {
      console.error('Failed to load bugs:', err)
      setError('載入缺陷失敗，請稍後再試')
    } finally {
      setIsLoading(false)
    }
  }

  // US-7.x: filter is now server-side. The returned list is already filtered.
  // Keep filteredBugs alias for downstream JSX readability.
  const filteredBugs = bugs

  const loadProjects = async () => {
    try {
      const response = await projectApi.list()
      setProjects(response.data.projects || [])
    } catch (err) {
      console.error('Failed to load projects:', err)
    }
  }

  const handleBugCreated = (msg: string) => {
    setSuccess(msg)
    setShowCreate(false)
    loadBugs()
  }

  return (
    <div>
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">全部缺陷</h1>
          <p className="text-gray-500 mt-1">顯示全部項目嘅缺陷，共 {totalCount} 個</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Project filter (bug #5) */}
          <div className="relative">
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="appearance-none pl-3 pr-9 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">全部項目</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
          {/* 新建缺陷 button (bug #2) */}
          <button
            onClick={() => setShowCreate(true)}
            className="btn-primary flex items-center gap-2 text-sm px-4 py-2 whitespace-nowrap"
          >
            <Plus size={16} />
            新建缺陷
          </button>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 mb-6">
        {(['all', 'open', 'in_progress', 'resolved', 'verified'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={clsx(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap',
              filter === f ? 'bg-primary-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
            )}
          >
            {STATUS_LABELS[f]}
          </button>
        ))}
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 border border-red-100 text-red-700 px-4 py-3 text-sm">{error}</div>}
      {success && <div className="mb-4 rounded-lg bg-green-50 border border-green-100 text-green-700 px-4 py-3 text-sm">{success}</div>}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500"></div>
        </div>
      ) : filteredBugs.length === 0 ? (
        <div className="card p-8 sm:p-12 text-center">
          <Bug size={48} className="mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">暫無缺陷</h3>
          <p className="text-gray-500 mb-4">呢個 filter 冇符合條件嘅缺陷</p>
          <button onClick={() => setShowCreate(true)} className="btn-primary inline-flex items-center gap-2 text-sm">
            <Plus size={16} /> 新建缺陷
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredBugs.map((bug) => (
            <Link
              key={bug.id}
              to={`/bugs/${bug.id}`}
              className="block card p-4 sm:p-5 hover:shadow-md hover:border-primary-300 transition-all"
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex-shrink-0">
                  {bug.status === 'verified' ? (
                    <CheckCircle size={20} className="text-blue-500" />
                  ) : bug.severity === 'critical' || bug.severity === 'high' ? (
                    <AlertCircle size={20} className="text-red-500" />
                  ) : (
                    <Bug size={20} className="text-gray-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 break-words">{bug.title}</h3>
                  <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-gray-500">
                    <span className={`badge ${getSeverityColor(bug.severity)}`}>
                      {SEVERITY_LABELS[bug.severity] || bug.severity}
                    </span>
                    <span className={`badge ${getStatusColor(bug.status)}`}>
                      {STATUS_LABELS[bug.status] || bug.status}
                    </span>
                    {bug.project && (
                      <span className="text-gray-500">📁 {bug.project.name}</span>
                    )}
                    {bug.assignee && (
                      <span className="text-gray-500">👤 {bug.assignee.name}</span>
                    )}
                    {bug.reporter && (
                      <span className="text-gray-400">回報:{bug.reporter.name}</span>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Pagination (US-7.x) */}
      {!isLoading && totalCount > 0 && (
        <Pagination
          page={page}
          pageSize={pageSize}
          totalCount={totalCount}
          totalPages={totalPages}
          onPageChange={setPage}
          onPageSizeChange={(s) => {
            setPageSize(s)
            setPage(1)
          }}
        />
      )}

      {showCreate && (
        <CreateBugModal
          onClose={() => setShowCreate(false)}
          onCreated={handleBugCreated}
          defaultProjectId={projectFilter || undefined}
        />
      )}
    </div>
  )
}

function getSeverityColor(severity: string) {
  switch (severity) {
    case 'critical': return 'bg-red-100 text-red-700'
    case 'high': return 'bg-orange-100 text-orange-700'
    case 'medium': return 'bg-yellow-100 text-yellow-700'
    case 'low': return 'bg-gray-100 text-gray-600'
    default: return 'bg-gray-100 text-gray-600'
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case 'open': return 'bg-red-100 text-red-700'
    case 'in_progress': return 'bg-orange-100 text-orange-700'
    case 'resolved': return 'bg-green-100 text-green-700'
    case 'verified': return 'bg-blue-100 text-blue-700'
    default: return 'bg-gray-100 text-gray-600'
  }
}
