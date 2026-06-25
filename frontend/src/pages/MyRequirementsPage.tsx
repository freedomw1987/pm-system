import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileText, CheckCircle, Edit2, Trash2, Plus } from 'lucide-react'
import { requirementApi, projectApi } from '../utils/api'
import { hasAnyPermission } from '../utils/permissions'
import type { Requirement, Project } from '../types'
import { useAuth } from '../context/AuthContext'
import RichTextEditor from '../components/RichTextEditor'
import FullscreenModal from '../components/FullscreenModal'
import Pagination from '../components/Pagination'
import { DEFAULT_PAGE_SIZE } from '../utils/pagination'
import { migrateDataUrlsToAttachments } from '../utils/descriptionAttachments'

export default function MyRequirementsPage() {
  const { user } = useAuth()
  const [requirements, setRequirements] = useState<Requirement[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Pagination (US-7.x)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [totalCount, setTotalCount] = useState(0)
  const [totalPages, setTotalPages] = useState(1)

  // ── Add requirement ──────────────────────────────────────────
  const [showAddModal, setShowAddModal] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newPriority, setNewPriority] = useState('medium')
  const [newProjectId, setNewProjectId] = useState('')
  const [isAdding, setIsAdding] = useState(false)

  // ── Edit requirement ─────────────────────────────────────────
  const [editingReq, setEditingReq] = useState<Requirement | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editStatus, setEditStatus] = useState('')
  const [editPriority, setEditPriority] = useState('')
  const [isEditing, setIsEditing] = useState(false)

  useEffect(() => { loadRequirements() }, [page, pageSize])

  const loadRequirements = async () => {
    setIsLoading(true)
    try {
      // Backend already filters by project access for non-admins
      const res = await requirementApi.listAll({ page, pageSize })
      setRequirements(res.data.requirements)
      setTotalCount(res.data.totalCount ?? res.data.requirements.length)
      setTotalPages(res.data.totalPages ?? 1)
    } catch (err) {
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { loadProjects() }, [])

  const loadProjects = async () => {
    try {
      const res = await projectApi.list({ limit: -1 })
      setProjects(res.data.projects || [])
    } catch (err) {
      console.error(err)
    }
  }

  // ── Create ───────────────────────────────────────────────────
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle.trim() || !newProjectId) return
    setIsAdding(true)
    try {
      // Step 1: create 拎新 ID
      const createRes = await requirementApi.create(newProjectId, { title: newTitle, description: newDesc, priority: newPriority })
      const newReqId = createRes.data?.requirement?.id as string | undefined

      // Step 2: 創建後如有 data URL 圖,upload 去 attachments + replace
      if (newReqId && newDesc && newDesc.includes('data:image/')) {
        try {
          const migrated = await migrateDataUrlsToAttachments(newDesc, 'requirement', newReqId)
          if (migrated !== newDesc) {
            await requirementApi.update(newReqId, { description: migrated })
          }
        } catch (migErr) {
          console.warn('[MyRequirementsPage] data URL migrate 失敗,保留原 description:', migErr)
        }
      }

      setShowAddModal(false)
      setNewTitle(''); setNewDesc(''); setNewPriority('medium'); setNewProjectId('')
      loadRequirements()
    } catch (err) {
      console.error(err)
      alert('無法創建需求')
    } finally {
      setIsAdding(false)
    }
  }

  // ── Edit ─────────────────────────────────────────────────────
  const openEdit = (req: Requirement) => {
    setEditingReq(req)
    setEditTitle(req.title)
    setEditDesc(req.description || '')
    setEditStatus(req.status)
    setEditPriority(req.priority || 'medium')
  }

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingReq) return
    setIsEditing(true)
    try {
      // 編輯模式時 RichTextEditor 有 uploadEntity,新 paste 嘅圖會直接 upload;
      // 但 description 可能仲殘留舊 data URL(以前冇 uploadEntity 嘅時候 paste 落去嘅),
      // save 之前 migrate 一次確保下次開返睇唔會再 render 唔到。
      let finalDesc = editDesc
      if (editDesc && editDesc.includes('data:image/')) {
        try {
          finalDesc = await migrateDataUrlsToAttachments(editDesc, 'requirement', editingReq.id)
        } catch (migErr) {
          console.warn('[MyRequirementsPage] data URL migrate 失敗,保留原 description:', migErr)
        }
      }
      await requirementApi.update(editingReq.id, {
        title: editTitle,
        description: finalDesc,
        status: editStatus,
        priority: editPriority
      })
      setEditingReq(null)
      loadRequirements()
    } catch (err) {
      console.error(err)
      alert('無法更新需求')
    } finally {
      setIsEditing(false)
    }
  }

  // ── Delete ───────────────────────────────────────────────────
  const handleDelete = async (reqId: string) => {
    if (!confirm('確定要刪除這個需求嗎？')) return
    try {
      await requirementApi.delete(reqId)
      loadRequirements()
    } catch (err) {
      console.error(err)
      alert('無法刪除需求')
    }
  }

  // ── Helpers ───────────────────────────────────────────────────
  const canEdit = hasAnyPermission(user, ['requirements.edit'])
  const canDelete = hasAnyPermission(user, ['requirements.delete'])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-700'
      case 'in_progress': return 'bg-blue-100 text-blue-700'
      case 'completed': return 'bg-green-100 text-green-700'
      default: return 'bg-gray-100 text-gray-600'
    }
  }

  const getPriorityColor = (p: string) => {
    switch (p) {
      case 'high': return 'bg-red-100 text-red-700'
      case 'medium': return 'bg-yellow-100 text-yellow-700'
      case 'low': return 'bg-gray-100 text-gray-600'
      default: return 'bg-gray-100 text-gray-600'
    }
  }

  const getPriorityLabel = (p: string) => ({ high: '優先', medium: '中等', low: '較低' }[p] || p)

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending': return '待處理'
      case 'in_progress': return '進行中'
      case 'completed': return '已完成'
      default: return status
    }
  }

  const stripHtml = (html: string) =>
    html?.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim() || ''

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary-500" />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">我的需求</h1>
          <p className="text-gray-500 mt-1">我所在項目的全部需求</p>
        </div>
        {hasAnyPermission(user, ['requirements.create']) && (
          <button
            onClick={() => {
              setNewTitle(''); setNewDesc(''); setNewPriority('medium'); setNewProjectId('')
              setShowAddModal(true)
            }}
            className="btn-primary flex items-center gap-2"
          >
            <Plus size={20} /><span>新建需求</span>
          </button>
        )}
      </div>

      {requirements.length === 0 ? (
        <div className="card p-12 text-center">
          <FileText size={48} className="mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">暫無需求</h3>
          <p className="text-gray-500">您所在的項目還沒有需求</p>
        </div>
      ) : (
        <div className="space-y-4">
          {requirements.map((req) => (
            <div key={req.id} className="card p-6 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <Link to={`/requirements/${req.id}`} className="flex items-center gap-2">
                      <FileText size={16} className="text-primary-500" />
                      <h3 className="font-semibold text-gray-900 hover:text-primary-600">{req.title}</h3>
                    </Link>
                    {req.project && (
                      <span className="badge bg-blue-50 text-blue-600">{req.project.name}</span>
                    )}
                    <span className={`badge ${getStatusColor(req.status)}`}>{getStatusLabel(req.status)}</span>
                    <span className={`badge ${getPriorityColor(req.priority)}`}>{getPriorityLabel(req.priority)}</span>
                    {canEdit && (
                      <button
                        onClick={() => openEdit(req)}
                        className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="編輯需求"
                      >
                        <Edit2 size={14} />
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={() => handleDelete(req.id)}
                        className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="刪除需求"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <p className="text-gray-500 text-sm mb-3">
                    {req.description ? stripHtml(req.description) : '暫無描述'}
                  </p>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-gray-400 flex items-center gap-1">
                      <CheckCircle size={14} />{req._count?.tasks ?? req.taskCount ?? 0} 任務
                    </span>
                  </div>
                </div>
              </div>
            </div>
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

      {/* Add Modal */}
      <FullscreenModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="新建需求"
        footer={
          <>
            <button type="button" onClick={() => setShowAddModal(false)} className="btn-secondary">取消</button>
            <button type="submit" form="myreq-add-form" disabled={isAdding} className="btn-primary">
              {isAdding ? '創建中...' : '創建'}
            </button>
          </>
        }
      >
        <form id="myreq-add-form" onSubmit={handleAdd} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">所屬項目 *</label>
            <select value={newProjectId} onChange={(e) => setNewProjectId(e.target.value)} className="input-field w-full" required>
              <option value="">-- 選擇項目 --</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">需求標題 *</label>
            <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className="input-field w-full" placeholder="例如：用戶登入功能" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
            <RichTextEditor value={newDesc} onChange={setNewDesc} placeholder="需求的詳細描述..." rows={6} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">優先級</label>
            <select value={newPriority} onChange={(e) => setNewPriority(e.target.value)} className="input-field w-full">
              <option value="high">優先</option>
              <option value="medium">中等</option>
              <option value="low">較低</option>
            </select>
          </div>
        </form>
      </FullscreenModal>

      {/* Edit Modal */}
      <FullscreenModal
        open={!!editingReq}
        onClose={() => setEditingReq(null)}
        title="編輯需求"
        footer={
          <>
            <button type="button" onClick={() => setEditingReq(null)} className="btn-secondary">取消</button>
            <button type="submit" form="myreq-edit-form" disabled={isEditing} className="btn-primary">
              {isEditing ? '保存中...' : '保存'}
            </button>
          </>
        }
      >
        <form id="myreq-edit-form" onSubmit={handleEdit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">需求標題 *</label>
            <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="input-field w-full" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
            {/* 編輯模式已有 requirement ID,直接 upload 去 attachments 唔再用 data URL */}
            <RichTextEditor
              value={editDesc}
              onChange={setEditDesc}
              rows={6}
              uploadEntity={editingReq ? { type: 'requirement', id: editingReq.id } : undefined}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">狀態</label>
              <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)} className="input-field w-full">
                <option value="pending">待處理</option>
                <option value="in_progress">進行中</option>
                <option value="completed">已完成</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">優先級</label>
              <select value={editPriority} onChange={(e) => setEditPriority(e.target.value)} className="input-field w-full">
                <option value="high">優先</option>
                <option value="medium">中等</option>
                <option value="low">較低</option>
              </select>
            </div>
          </div>
        </form>
      </FullscreenModal>
    </div>
  )
}
