import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { AlertCircle, Bug, CheckCircle, Clock, PlayCircle } from 'lucide-react'
import { bugApi, workLogApi } from '../utils/api'
import type { Bug as BugType } from '../types'
import clsx from 'clsx'
import Pagination from '../components/Pagination'
import { DEFAULT_PAGE_SIZE } from '../utils/pagination'

type BugFilter = 'all' | 'open' | 'in_progress' | 'resolved' | 'verified'
type BugStatus = BugType['status']

const statusFlow: Partial<Record<BugStatus, BugStatus>> = {
  open: 'in_progress',
  in_progress: 'resolved',
  resolved: 'verified',
}

export default function MyBugsPage() {
  const [bugs, setBugs] = useState<BugType[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filter, setFilter] = useState<BugFilter>('all')
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [workLogBug, setWorkLogBug] = useState<BugType | null>(null)
  const [workLogForm, setWorkLogForm] = useState({
    hours: '',
    workDate: new Date().toISOString().split('T')[0],
    note: '',
  })
  const [isSubmittingLog, setIsSubmittingLog] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Pagination (US-7.x) — server-side status filter
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [totalCount, setTotalCount] = useState(0)
  const [totalPages, setTotalPages] = useState(1)

  // Reset to page 1 whenever the status filter changes
  useEffect(() => {
    setPage(1)
  }, [filter])

  useEffect(() => {
    loadBugs()
  }, [filter, page, pageSize])

  const loadBugs = async () => {
    setIsLoading(true)
    setError('')
    try {
      const params: { status?: string; page: number; pageSize: number } = {
        page,
        pageSize,
      }
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

  // US-7.x: server-side filter — returned list is already filtered
  const filteredBugs = bugs

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-700'
      case 'high': return 'bg-orange-100 text-orange-700'
      case 'medium': return 'bg-yellow-100 text-yellow-700'
      case 'low': return 'bg-gray-100 text-gray-600'
      default: return 'bg-gray-100 text-gray-600'
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-red-100 text-red-700'
      case 'in_progress': return 'bg-orange-100 text-orange-700'
      case 'resolved': return 'bg-green-100 text-green-700'
      case 'verified': return 'bg-blue-100 text-blue-700'
      default: return 'bg-gray-100 text-gray-600'
    }
  }

  const getSeverityLabel = (severity: string) => {
    switch (severity) {
      case 'critical': return '嚴重'
      case 'high': return '高'
      case 'medium': return '中'
      case 'low': return '低'
      default: return severity
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'open': return '待處理'
      case 'in_progress': return '處理中'
      case 'resolved': return '已解決'
      case 'verified': return '已驗證'
      default: return status
    }
  }

  const handleUpdateStatus = async (bug: BugType) => {
    const nextStatus = statusFlow[bug.status]
    if (!nextStatus) return

    setUpdatingId(bug.id)
    setError('')
    setSuccess('')
    try {
      await bugApi.updateStatus(bug.id, nextStatus)
      setBugs(prev => prev.map(item => item.id === bug.id ? { ...item, status: nextStatus } : item))
      setSuccess(`「${bug.title}」已更新為${getStatusLabel(nextStatus)}`)
    } catch (err) {
      console.error('Failed to update bug status:', err)
      setError('更新缺陷狀態失敗')
    } finally {
      setUpdatingId(null)
    }
  }

  const openWorkLogModal = (bug: BugType) => {
    setWorkLogBug(bug)
    setWorkLogForm({
      hours: '',
      workDate: new Date().toISOString().split('T')[0],
      note: '',
    })
    setError('')
    setSuccess('')
  }

  const handleSubmitWorkLog = async (e: FormEvent) => {
    e.preventDefault()
    if (!workLogBug) return

    const hours = parseFloat(String(workLogForm.hours).trim())
    if (Number.isNaN(hours) || hours <= 0 || hours > 24) {
      setError('請輸入 0.01 到 24 之間的工作時數')
      return
    }

    setIsSubmittingLog(true)
    setError('')
    try {
      await workLogApi.create({
        bugId: workLogBug.id,
        hours: Number(hours),
        workDate: workLogForm.workDate,
        note: workLogForm.note || undefined,
      })
      setWorkLogBug(null)
      setSuccess(`已為「${workLogBug.title}」登記 ${hours} 小時`)
    } catch (err) {
      console.error('Failed to create work log:', err)
      setError('登記工作時數失敗')
    } finally {
      setIsSubmittingLog(false)
    }
  }

  return (
    <div>
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6 lg:mb-8">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">我的缺陷</h1>
          <p className="text-gray-500 mt-1">顯示可處理的缺陷，共 {totalCount} 個</p>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {(['all', 'open', 'in_progress', 'resolved', 'verified'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={clsx(
                'px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap',
                filter === f ? 'bg-primary-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              )}
            >
              {f === 'all' ? '全部' : getStatusLabel(f)}
            </button>
          ))}
        </div>
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
          <p className="text-gray-500">目前沒有符合條件的缺陷</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredBugs.map((bug) => {
            const nextStatus = statusFlow[bug.status]

            return (
              <div key={bug.id} className="card p-4 sm:p-6">
                <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-3 mb-2">
                      {bug.status === 'verified' ? (
                        <CheckCircle size={20} className="text-blue-500 mt-0.5 flex-shrink-0" />
                      ) : bug.severity === 'critical' || bug.severity === 'high' ? (
                        <AlertCircle size={20} className="text-red-500 mt-0.5 flex-shrink-0" />
                      ) : (
                        <Bug size={20} className="text-gray-400 mt-0.5 flex-shrink-0" />
                      )}
                      <div className="min-w-0">
                        <h3 className="font-semibold text-gray-900 break-words">{bug.title}</h3>
                        {bug.reporter && <p className="text-xs text-gray-400 mt-1">回報者：{bug.reporter.name}</p>}
                      </div>
                    </div>
                    <p className="text-gray-500 text-sm mb-3 break-words">{bug.description || '暫無描述'}</p>
                    <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-sm">
                      <span className={`badge ${getSeverityColor(bug.severity)}`}>
                        嚴重度：{getSeverityLabel(bug.severity)}
                      </span>
                      <span className={`badge ${getStatusColor(bug.status)}`}>
                        {getStatusLabel(bug.status)}
                      </span>
                      {bug.task && (
                        <span className="text-gray-500 break-all">關聯任務：{bug.task.title}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row xl:flex-col gap-2 w-full sm:w-auto">
                    {nextStatus && (
                      <button
                        onClick={() => handleUpdateStatus(bug)}
                        disabled={updatingId === bug.id}
                        className="btn-primary flex items-center justify-center gap-2 text-sm px-4 py-2 w-full sm:w-auto"
                      >
                        <PlayCircle size={16} />
                        {updatingId === bug.id ? '更新中...' : `標記為${getStatusLabel(nextStatus)}`}
                      </button>
                    )}
                    <button
                      onClick={() => openWorkLogModal(bug)}
                      className="btn-secondary flex items-center justify-center gap-2 text-sm px-4 py-2 w-full sm:w-auto"
                    >
                      <Clock size={16} />
                      登記時數
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
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

      {workLogBug && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-5 sm:p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-1">登記工作時數</h2>
            <p className="text-sm text-gray-500 mb-4 break-words">缺陷：{workLogBug.title}</p>
            <form onSubmit={handleSubmitWorkLog} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">日期 *</label>
                <input
                  type="date"
                  value={workLogForm.workDate}
                  onChange={(e) => setWorkLogForm({ ...workLogForm, workDate: e.target.value })}
                  className="input-field"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">工作時數 *</label>
                <input
                  type="number"
                  max="24"
                  value={workLogForm.hours}
                  onChange={(e) => setWorkLogForm({ ...workLogForm, hours: e.target.value })}
                  className="input-field"
                  placeholder="例如：1.5"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
                <textarea
                  value={workLogForm.note}
                  onChange={(e) => setWorkLogForm({ ...workLogForm, note: e.target.value })}
                  className="input-field"
                  rows={3}
                  placeholder="說明缺陷處理內容..."
                />
              </div>
              <div className="flex flex-col sm:flex-row gap-3 sm:justify-end pt-2">
                <button type="button" onClick={() => setWorkLogBug(null)} className="btn-secondary order-2 sm:order-1">
                  取消
                </button>
                <button type="submit" disabled={isSubmittingLog} className="btn-primary order-1 sm:order-2">
                  {isSubmittingLog ? '保存中...' : '保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}