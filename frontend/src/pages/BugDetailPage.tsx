/**
 * BugDetailPage — 單個缺陷詳情(/bugs/:id)
 *
 * 對應 bug fix 2026-06-09:
 *   - bug #3: 全部缺陷列表點唔到去詳情 — 加呢個 page,從 list 跳過嚟
 *   - bug #4: 編輯缺陷-修改標題和描述保存後信息未更新 — 確保 save 之後
 *     用 response 直接 update local state(loadData 之外再 patch state),
 *     避免 list 內部 cache / props 唔更新
 *
 * 設計:
 *   - 從 url 拎 bugId,直接 GET /api/bugs/:id
 *   - Header: 標題 + 狀態/嚴重度 badges + 編輯/刪除按鈕
 *   - 主區: 描述(RichTextEditor 只讀模式顯示,edit 模式可改)
 *   - 側欄: 項目/任務/回報者/負責人/創建時間
 *   - 編輯 modal:同 RequirementDetailPage 嘅 edit bug modal 一致
 *     (題、描述、狀態、嚴重度、負責人)
 */
import { useEffect, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Edit2, Trash2, X, AlertTriangle, Clock, CheckCircle, Bug as BugIcon } from 'lucide-react'
import { bugApi, workLogApi, projectApi } from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { hasAnyPermission } from '../utils/permissions'
import RichTextEditor from '../components/RichTextEditor'
import type { Bug, User } from '../types'

const today = () => new Date().toISOString().split('T')[0]

export default function BugDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [bug, setBug] = useState<Bug | null>(null)
  const [projectMembers, setProjectMembers] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  // Edit modal state
  const [showEdit, setShowEdit] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editStatus, setEditStatus] = useState('open')
  const [editSeverity, setEditSeverity] = useState('medium')
  const [editAssignee, setEditAssignee] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [editError, setEditError] = useState('')

  // Work log modal state
  const [showWorkLog, setShowWorkLog] = useState(false)
  const [workLogForm, setWorkLogForm] = useState({
    hours: '',
    workDate: today(),
    note: '',
  })
  const [isSubmittingLog, setIsSubmittingLog] = useState(false)
  const [workLogError, setWorkLogError] = useState('')

  useEffect(() => {
    if (id) loadBug()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const loadBug = async () => {
    setIsLoading(true)
    setError('')
    try {
      const res = await bugApi.get(id!)
      const fetched = res.data.bug
      setBug(fetched)
      if (fetched?.projectId) {
        try {
          const membersRes = await projectApi.getMembers(fetched.projectId)
          const members = (membersRes.data.members || [])
            .map((m: { user: User }) => m.user)
            .filter(Boolean)
          setProjectMembers(members)
        } catch (err) {
          console.error('Failed to load project members:', err)
        }
      }
    } catch (err: any) {
      console.error('Failed to load bug:', err)
      setError(err?.response?.data?.error?.message || '載入缺陷失敗')
    } finally {
      setIsLoading(false)
    }
  }

  const openEdit = () => {
    if (!bug) return
    setEditTitle(bug.title)
    setEditDesc(bug.description || '')
    setEditStatus(bug.status)
    setEditSeverity(bug.severity)
    setEditAssignee(bug.assignee?.id || '')
    setEditError('')
    setShowEdit(true)
  }

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!bug) return
    setIsEditing(true)
    setEditError('')
    try {
      const res = await bugApi.update(bug.id, {
        title: editTitle,
        status: editStatus,
        description: editDesc,
        severity: editSeverity,
        assigneeId: editAssignee || null,
      })
      // Bug #4 fix: 用 response 直接 patch,確保 UI 即時更新
      if (res.data?.bug) {
        setBug(res.data.bug)
      } else {
        // 兜底 reload
        await loadBug()
      }
      setShowEdit(false)
    } catch (err: any) {
      console.error('Failed to update bug:', err)
      setEditError(err?.response?.data?.error?.message || '更新缺陷失敗')
    } finally {
      setIsEditing(false)
    }
  }

  const handleDelete = async () => {
    if (!bug) return
    if (!confirm('確定要刪除這個缺陷嗎?')) return
    try {
      await bugApi.delete(bug.id)
      navigate('/bugs')
    } catch (err: any) {
      console.error('Failed to delete bug:', err)
      alert(err?.response?.data?.error?.message || '刪除缺陷失敗')
    }
  }

  const openWorkLog = () => {
    setWorkLogForm({ hours: '', workDate: today(), note: '' })
    setWorkLogError('')
    setShowWorkLog(true)
  }

  const handleWorkLogSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!bug) return
    const hours = parseFloat(String(workLogForm.hours).trim())
    if (Number.isNaN(hours) || hours <= 0 || hours > 24) {
      setWorkLogError('請輸入 0.01 到 24 之間的工作時數')
      return
    }
    setIsSubmittingLog(true)
    setWorkLogError('')
    try {
      await workLogApi.create({
        bugId: bug.id,
        hours,
        workDate: workLogForm.workDate,
        note: workLogForm.note || undefined,
      })
      setShowWorkLog(false)
    } catch (err: any) {
      console.error('Failed to create work log:', err)
      setWorkLogError(err?.response?.data?.error?.message || '登記時數失敗')
    } finally {
      setIsSubmittingLog(false)
    }
  }

  // ── Helpers ─────────────────────────────────────────────────
  const canEdit = hasAnyPermission(user, ['bugs.edit'])
  const canDelete = hasAnyPermission(user, ['bugs.delete'])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-red-100 text-red-700'
      case 'in_progress': return 'bg-orange-100 text-orange-700'
      case 'resolved': return 'bg-green-100 text-green-700'
      case 'verified': return 'bg-blue-100 text-blue-700'
      case 'closed': return 'bg-gray-100 text-gray-700'
      default: return 'bg-gray-100 text-gray-700'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'open': return '待處理'
      case 'in_progress': return '處理中'
      case 'resolved': return '已解決'
      case 'verified': return '已驗證'
      case 'closed': return '已關閉'
      default: return status
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-700'
      case 'high': return 'bg-orange-100 text-orange-700'
      case 'medium': return 'bg-yellow-100 text-yellow-700'
      case 'low': return 'bg-gray-100 text-gray-600'
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

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary-500" />
      </div>
    )
  }

  if (!bug) {
    return (
      <div className="text-center py-20">
        <BugIcon size={48} className="mx-auto text-gray-300 mb-4" />
        <p className="text-gray-500 mb-4">{error || '找不到這個缺陷'}</p>
        <Link to="/bugs" className="btn-secondary inline-block">返回缺陷列表</Link>
      </div>
    )
  }

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="mb-6">
        <Link to="/bugs" className="flex items-center gap-1 text-gray-500 hover:text-gray-700 mb-4 transition-colors">
          <ArrowLeft size={18} /><span>返回缺陷列表</span>
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2 flex-wrap">
              {bug.status === 'verified' ? (
                <CheckCircle size={24} className="text-blue-500 flex-shrink-0" />
              ) : bug.severity === 'critical' || bug.severity === 'high' ? (
                <AlertTriangle size={24} className="text-red-500 flex-shrink-0" />
              ) : (
                <BugIcon size={24} className="text-gray-400 flex-shrink-0" />
              )}
              <span className="break-words">{bug.title}</span>
            </h1>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className={`badge ${getStatusColor(bug.status)}`}>
                {getStatusLabel(bug.status)}
              </span>
              <span className={`badge ${getSeverityColor(bug.severity)}`}>
                嚴重度:{getSeverityLabel(bug.severity)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={openWorkLog}
              className="btn-secondary flex items-center gap-2 text-sm px-3 py-2"
              title="登記時數"
            >
              <Clock size={16} />
              <span className="hidden sm:inline">登記時數</span>
            </button>
            {canEdit && (
              <button
                onClick={openEdit}
                className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                title="編輯缺陷"
              >
                <Edit2 size={16} />
              </button>
            )}
            {canDelete && (
              <button
                onClick={handleDelete}
                className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="刪除缺陷"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-100 text-red-700 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content - description */}
        <div className="lg:col-span-2 space-y-6">
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-gray-500 mb-3">描述</h2>
            {bug.description ? (
              <div
                className="prose prose-sm sm:prose max-w-none break-words"
                dangerouslySetInnerHTML={{ __html: bug.description }}
              />
            ) : (
              <p className="text-gray-400 italic">暫無描述</p>
            )}
          </div>
        </div>

        {/* Sidebar - meta */}
        <div className="space-y-4">
          <div className="card p-5 space-y-3 text-sm">
            <div>
              <span className="text-gray-500">項目</span>
              {bug.project ? (
                <Link
                  to={`/projects/${bug.project.id}`}
                  className="block font-medium text-primary-600 hover:underline mt-0.5 break-words"
                >
                  {bug.project.name}
                </Link>
              ) : (
                <p className="text-gray-400 mt-0.5">未指定</p>
              )}
            </div>
            {bug.task && (
              <div>
                <span className="text-gray-500">關聯任務</span>
                <p className="font-medium text-gray-900 mt-0.5 break-words">{bug.task.title}</p>
              </div>
            )}
            <div>
              <span className="text-gray-500">回報者</span>
              <p className="font-medium text-gray-900 mt-0.5">
                {bug.reporter?.name || '未知'}
              </p>
            </div>
            <div>
              <span className="text-gray-500">負責人</span>
              <p className="font-medium text-gray-900 mt-0.5">
                {bug.assignee?.name || '未指派'}
              </p>
            </div>
            <div>
              <span className="text-gray-500">建立時間</span>
              <p className="text-gray-700 mt-0.5">
                {new Date(bug.createdAt).toLocaleString('zh-TW', {
                  year: 'numeric', month: '2-digit', day: '2-digit',
                  hour: '2-digit', minute: '2-digit'
                })}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {showEdit && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">編輯缺陷</h2>
              <button
                type="button"
                onClick={() => setShowEdit(false)}
                className="p-1 hover:bg-gray-100 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            {editError && (
              <div className="mb-4 rounded-lg bg-red-50 border border-red-100 text-red-700 px-4 py-3 text-sm">
                {editError}
              </div>
            )}

            <form onSubmit={handleEdit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">標題 *</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="input-field w-full"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
                <RichTextEditor
                  value={editDesc}
                  onChange={setEditDesc}
                  rows={6}
                  {...(bug?.id ? { uploadEntity: { type: 'bug', id: bug.id } } : {})}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">狀態</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    className="input-field w-full"
                  >
                    <option value="open">待處理</option>
                    <option value="in_progress">處理中</option>
                    <option value="resolved">已解決</option>
                    <option value="verified">已驗證</option>
                    <option value="closed">已關閉</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">嚴重程度</label>
                  <select
                    value={editSeverity}
                    onChange={(e) => setEditSeverity(e.target.value)}
                    className="input-field w-full"
                  >
                    <option value="low">輕微</option>
                    <option value="medium">中等</option>
                    <option value="high">高</option>
                    <option value="critical">嚴重</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">負責人</label>
                <select
                  value={editAssignee}
                  onChange={(e) => setEditAssignee(e.target.value)}
                  className="input-field w-full"
                >
                  <option value="">-- 不指定 --</option>
                  {projectMembers.map(member => (
                    <option key={member.id} value={member.id}>{member.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 sm:justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowEdit(false)}
                  className="btn-secondary order-2 sm:order-1"
                  disabled={isEditing}
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isEditing}
                  className="btn-primary order-1 sm:order-2"
                >
                  {isEditing ? '保存中...' : '保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Work Log Modal */}
      {showWorkLog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">登記工作時數</h2>
                <p className="text-sm text-gray-500 mt-1 break-words">缺陷:{bug.title}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowWorkLog(false)}
                className="p-1 hover:bg-gray-100 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            {workLogError && (
              <div className="mb-4 rounded-lg bg-red-50 border border-red-100 text-red-700 px-4 py-3 text-sm">
                {workLogError}
              </div>
            )}

            <form onSubmit={handleWorkLogSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">日期 *</label>
                <input
                  type="date"
                  value={workLogForm.workDate}
                  onChange={(e) => setWorkLogForm({ ...workLogForm, workDate: e.target.value })}
                  className="input-field w-full"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">工作時數 *</label>
                <input
                  type="number"
                  step="0.25"
                  min="0.25"
                  max="24"
                  value={workLogForm.hours}
                  onChange={(e) => setWorkLogForm({ ...workLogForm, hours: e.target.value })}
                  className="input-field w-full"
                  placeholder="例如：2.5"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">備註</label>
                <textarea
                  value={workLogForm.note}
                  onChange={(e) => setWorkLogForm({ ...workLogForm, note: e.target.value })}
                  className="input-field w-full"
                  rows={3}
                  placeholder="說明處理內容..."
                />
              </div>
              <div className="flex flex-col sm:flex-row gap-3 sm:justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowWorkLog(false)}
                  className="btn-secondary order-2 sm:order-1"
                  disabled={isSubmittingLog}
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingLog}
                  className="btn-primary order-1 sm:order-2"
                >
                  {isSubmittingLog ? '登記中...' : '登記時數'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
