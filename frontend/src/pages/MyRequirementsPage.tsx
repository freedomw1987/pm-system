import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileText, CheckCircle, Edit2, Trash2, X, Plus } from 'lucide-react'
import { requirementApi, projectApi } from '../utils/api'
import type { Requirement, Project } from '../types'
import { useAuth } from '../context/AuthContext'
import RichTextEditor from '../components/RichTextEditor'

export default function MyRequirementsPage() {
  const { user } = useAuth()
  const [requirements, setRequirements] = useState<Requirement[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [isLoading, setIsLoading] = useState(true)

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

  useEffect(() => { loadRequirements() }, [])

  const loadRequirements = async () => {
    try {
      // Backend already filters by project access for non-admins
      const res = await requirementApi.listAll()
      setRequirements(res.data.requirements)
    } catch (err) {
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { loadProjects() }, [])

  const loadProjects = async () => {
    try {
      const res = await projectApi.list()
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
      await requirementApi.create(newProjectId, { title: newTitle, description: newDesc, priority: newPriority })
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
      await requirementApi.update(editingReq.id, {
        title: editTitle,
        description: editDesc,
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
  const canEdit = user?.role === 'admin' || user?.role === 'pm' || user?.role === 'tech_lead'
  const canDelete = user?.role === 'admin' || user?.role === 'pm'

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
        {(user?.role === 'admin' || user?.role === 'pm') && (
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
                      <CheckCircle size={14} />{req.taskCount || 0} 任務
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">新建需求</h2>
              <button onClick={() => setShowAddModal(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>
            <form onSubmit={handleAdd} className="space-y-4">
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
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setShowAddModal(false)} className="btn-secondary">取消</button>
                <button type="submit" disabled={isAdding} className="btn-primary">{isAdding ? '創建中...' : '創建'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingReq && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">編輯需求</h2>
              <button onClick={() => setEditingReq(null)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>
            <form onSubmit={handleEdit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">需求標題 *</label>
                <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="input-field w-full" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
                <RichTextEditor value={editDesc} onChange={setEditDesc} rows={6} />
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
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setEditingReq(null)} className="btn-secondary">取消</button>
                <button type="submit" disabled={isEditing} className="btn-primary">{isEditing ? '保存中...' : '保存'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}