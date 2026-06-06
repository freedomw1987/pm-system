import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Folder, Edit2, Trash2 } from 'lucide-react'
import { projectApi, departmentApi } from '../utils/api'
import type { Project } from '../types'
import { useAuth } from '../context/AuthContext'
import RichTextEditor from '../components/RichTextEditor'
import { hasAnyPermission } from '../utils/permissions'

interface Department {
  id: string
  name: string
}

export default function ProjectsPage() {
  const { user } = useAuth()
  const [projects, setProjects] = useState<Project[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Department filter
  const [filterDepartmentId, setFilterDepartmentId] = useState('')

  // Edit modal
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editStatus, setEditStatus] = useState('')
  const [editDepartmentId, setEditDepartmentId] = useState('')
  const [isEditing, setIsEditing] = useState(false)

  const navigate = useNavigate()
  const projectsRequestIdRef = useRef(0)

  useEffect(() => {
    loadDepartments()
  }, [])

  useEffect(() => {
    loadProjects(filterDepartmentId)
  }, [filterDepartmentId])

  const loadProjects = async (selectedDepartmentId = filterDepartmentId) => {
    const requestId = projectsRequestIdRef.current + 1
    projectsRequestIdRef.current = requestId
    setIsLoading(true)
    try {
      const params = selectedDepartmentId ? { departmentId: selectedDepartmentId } : {}
      const response = await projectApi.list(params)
      if (projectsRequestIdRef.current !== requestId) return
      setProjects(response.data.projects)
    } catch (err) {
      if (projectsRequestIdRef.current !== requestId) return
      console.error('Failed to load projects:', err)
    } finally {
      if (projectsRequestIdRef.current !== requestId) return
      setIsLoading(false)
    }
  }

  const loadDepartments = async () => {
    try {
      const res = await departmentApi.list()
      setDepartments(res.data.departments || [])
    } catch (err) {
      console.error('Failed to load departments:', err)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      const response = await projectApi.create({ name, description, departmentId: departmentId || undefined })
      navigate(`/projects/${response.data.project.id}`)
    } catch (err) {
      console.error('Failed to create project:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const canEditOrDelete = (project: Project) => {
    if (!user) return false
    if (user.role === 'admin') return true
    // PM of this project
    if (project.members?.some(m => m.user.id === user.id && m.role === 'pm')) return true
    // Owner/creator of this project
    if (project.owner?.id === user.id) return true
    return false
  }

  const openEditModal = (project: Project) => {
    setEditingProject(project)
    setEditName(project.name)
    setEditDescription(project.description || '')
    setEditStatus(project.status)
    setEditDepartmentId((project as any).department?.id || '')
    setShowEditModal(true)
  }

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingProject) return
    setIsEditing(true)
    try {
      await projectApi.update(editingProject.id, {
        name: editName,
        description: editDescription,
        status: editStatus,
        departmentId: editDepartmentId || undefined
      })
      setShowEditModal(false)
      loadProjects()
    } catch (err) {
      console.error('Failed to update project:', err)
      alert('無法更新項目')
    } finally {
      setIsEditing(false)
    }
  }

  const handleDelete = async (projectId: string) => {
    if (!confirm('確定要刪除這個項目嗎？所有需求、任務、缺陷都會一併刪除。')) return
    try {
      await projectApi.delete(projectId)
      loadProjects()
    } catch (err) {
      console.error('Failed to delete project:', err)
      alert('無法刪除項目')
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-700'
      case 'completed':
        return 'bg-blue-100 text-blue-700'
      case 'archived':
        return 'bg-gray-100 text-gray-700'
      case 'on_hold':
        return 'bg-yellow-100 text-yellow-700'
      default:
        return 'bg-gray-100 text-gray-700'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'active': return '進行中'
      case 'completed': return '已完成'
      case 'archived': return '已歸檔'
      case 'on_hold': return '暫停'
      default: return status
    }
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-8">
        <Link to="/" className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
          <ArrowLeft size={24} />
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-gray-900">項目列表</h1>
        </div>
        {user?.role === 'admin' && (
          <select
            value={filterDepartmentId}
            onChange={(e) => setFilterDepartmentId(e.target.value)}
            className="input-field w-48"
          >
            <option value="">全部部門</option>
            {departments.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        )}
        {hasAnyPermission(user, ['projects.create']) && (
          <button
            onClick={() => { setDepartmentId(''); setShowForm(true) }}
            className="btn-primary flex items-center gap-2"
          >
            <Plus size={20} />
            新建項目
          </button>
        )}
      </div>

      {/* Project List Cards - show department if admin */}
      {!isLoading && projects.length > 0 && user?.role === 'admin' && (
        <div className="mb-4 p-3 bg-gray-50 rounded-lg text-sm text-gray-600">
          共 {projects.length} 個項目
          {filterDepartmentId && ` · 已篩選部門：${departments.find(d => d.id === filterDepartmentId)?.name || '未知'}`}
        </div>
      )}

      {/* Project List */}
      {!isLoading && projects.length === 0 && (
        <div className="text-center py-12">
          <Folder size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500">還沒有項目，點擊上方按鈕新建</p>
        </div>
      )}

      {!isLoading && projects.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <div
              key={project.id}
              className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-shadow group"
            >
              <div className="flex items-start justify-between mb-3">
                <Link
                  to={`/projects/${project.id}`}
                  className="flex-1 min-w-0"
                >
                  <h3 className="text-lg font-semibold text-gray-900 group-hover:text-primary-600 transition-colors truncate">
                    {project.name}
                  </h3>
                </Link>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusBadge(project.status)}`}>
                    {getStatusLabel(project.status)}
                  </span>
                  {canEditOrDelete(project) && (
                    <>
                      <button
                        onClick={() => openEditModal(project)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="編輯項目"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => handleDelete(project.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="刪除項目"
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </div>
              </div>
              {project.description && (
                <p className="text-sm text-gray-500 mb-3 line-clamp-2">{project.description}</p>
              )}
              {(project as any).department && (
                <div className="mb-2">
                  <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">
                    {(project as any).department.name}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-4 text-xs text-gray-400">
                <span>{project.memberCount || 0} 個成員</span>
                <span>{project.requirementCount || 0} 個需求</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal Form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">新建項目</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  項目名稱 *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input-field"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  描述
                </label>
                <RichTextEditor
                  value={description}
                  onChange={setDescription}
                  placeholder="項目的詳細描述..."
                  rows={4}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  部門
                </label>
                <select
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                  className="input-field"
                >
                  <option value="">無</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="btn-secondary"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn-primary"
                >
                  {isSubmitting ? '創建中...' : '創建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal Form */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">編輯項目</h2>
            <form onSubmit={handleEdit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  項目名稱 *
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="input-field"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  描述
                </label>
                <RichTextEditor
                  value={editDescription}
                  onChange={setEditDescription}
                  placeholder="項目的詳細描述..."
                  rows={4}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  狀態
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="input-field"
                >
                  <option value="active">進行中</option>
                  <option value="on_hold">暫停</option>
                  <option value="completed">已完成</option>
                  <option value="archived">已歸檔</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  部門
                </label>
                <select
                  value={editDepartmentId}
                  onChange={(e) => setEditDepartmentId(e.target.value)}
                  className="input-field"
                >
                  <option value="">無</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="btn-secondary"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isEditing}
                  className="btn-primary"
                >
                  {isEditing ? '保存中...' : '保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
