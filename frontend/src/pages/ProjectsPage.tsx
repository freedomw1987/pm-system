import { useState, useEffect, useMemo, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Folder, Edit2, Trash2, Search } from 'lucide-react'
import { projectApi, departmentApi } from '../utils/api'
import type { Project } from '../types'
import { useAuth } from '../context/AuthContext'
import RichTextEditor from '../components/RichTextEditor'
import { hasAnyPermission } from '../utils/permissions'
import Pagination from '../components/Pagination'
import { DEFAULT_PAGE_SIZE } from '../utils/pagination'

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
  // Search (Sprint 14 — list-search-box pattern, client-side useMemo)
  const [searchProject, setSearchProject] = useState('')

  // Pagination (US-7.x)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [totalCount, setTotalCount] = useState(0)
  const [totalPages, setTotalPages] = useState(1)

  // Client-side search filter (Sprint 14)
  // Match project name + department name (so typing "工程" finds projects in 工程部)
  const filteredProjects = useMemo(() => {
    const q = searchProject.trim().toLowerCase()
    if (!q) return projects
    return projects.filter((p) => {
      if (p.name.toLowerCase().includes(q)) return true
      const dept = (p as any).department?.name
      if (dept && dept.toLowerCase().includes(q)) return true
      return false
    })
  }, [projects, searchProject])

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

  // Reset to page 1 whenever the filter changes
  useEffect(() => {
    setPage(1)
  }, [filterDepartmentId])

  useEffect(() => {
    loadProjects(filterDepartmentId, page, pageSize)
  }, [filterDepartmentId, page, pageSize])

  const loadProjects = async (
    selectedDepartmentId = filterDepartmentId,
    currentPage = page,
    currentPageSize = pageSize
  ) => {
    const requestId = projectsRequestIdRef.current + 1
    projectsRequestIdRef.current = requestId
    setIsLoading(true)
    try {
      const params: { departmentId?: string; page: number; pageSize: number } = {
        page: currentPage,
        pageSize: currentPageSize,
      }
      if (selectedDepartmentId) params.departmentId = selectedDepartmentId
      const response = await projectApi.list(params)
      if (projectsRequestIdRef.current !== requestId) return
      setProjects(response.data.projects)
      setTotalCount(response.data.totalCount ?? response.data.projects.length)
      setTotalPages(response.data.totalPages ?? 1)
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
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6 lg:mb-8">
        <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
          <Link to="/" className="p-2 hover:bg-gray-200 rounded-lg transition-colors flex-shrink-0">
            <ArrowLeft size={24} />
          </Link>
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 truncate">項目列表</h1>
        </div>
        {user?.role === 'admin' && (
          <select
            value={filterDepartmentId}
            onChange={(e) => setFilterDepartmentId(e.target.value)}
            className="input-field w-full sm:w-48"
            aria-label="篩選部門"
          >
            <option value="">全部部門</option>
            {departments.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        )}
        <div className="relative w-full sm:w-72">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={searchProject}
            onChange={(e) => setSearchProject(e.target.value)}
            placeholder="搜尋項目..."
            aria-label="搜尋項目"
            className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        {hasAnyPermission(user, ['projects.create']) && (
          <button
            onClick={() => { setDepartmentId(''); setShowForm(true) }}
            className="btn-primary flex items-center gap-2 w-full sm:w-auto justify-center"
          >
            <Plus size={20} />
            新建項目
          </button>
        )}
      </div>

      {/* Project List Cards - show department if admin */}
      {!isLoading && projects.length > 0 && user?.role === 'admin' && (
        <div className="mb-4 p-3 bg-gray-50 rounded-lg text-sm text-gray-600">
          共 {totalCount} 個項目
          {filterDepartmentId && ` · 已篩選部門：${departments.find(d => d.id === filterDepartmentId)?.name || '未知'}`}
          {searchProject && ` · 搜尋「${searchProject}」: ${filteredProjects.length} 個結果`}
        </div>
      )}

      {/* Project List — 2 層 empty state (raw empty vs filter empty, Sprint 14) */}
      {!isLoading && projects.length === 0 ? (
        // ① Raw empty — 真係冇 data
        <div className="text-center py-12">
          <Folder size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500">還沒有項目，點擊上方按鈕新建</p>
        </div>
      ) : !isLoading && filteredProjects.length === 0 ? (
        // ② Filter empty — 搜尋無結果
        <div className="text-center py-12">
          <Search size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500">無符合「{searchProject}」嘅項目</p>
          <button
            onClick={() => setSearchProject('')}
            className="mt-3 text-sm text-primary-600 hover:text-primary-700"
          >
            清空搜尋
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProjects.map((project) => (
            // 整張 card 都係 link,唔淨只 project name — RG-2026-06-09 bug #8
            // (原 link 只包住 <h3>,要點 card 其他位無反應)
            <Link
              key={project.id}
              to={`/projects/${project.id}`}
              className="block bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg hover:border-primary-300 transition-shadow group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-gray-900 group-hover:text-primary-600 transition-colors truncate">
                    {project.name}
                  </h3>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusBadge(project.status)}`}>
                    {getStatusLabel(project.status)}
                  </span>
                  {canEditOrDelete(project) && (
                    <>
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); openEditModal(project) }}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors relative z-10"
                        title="編輯項目"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(project.id) }}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors relative z-10"
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
