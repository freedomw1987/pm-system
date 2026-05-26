import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Plus, Users, FileText, CheckCircle, UserMinus, Edit2, Trash2, X, BookOpen, Paperclip, LayoutGrid, Bot, Activity, RefreshCw } from 'lucide-react'
import { projectApi, requirementApi, userApi, roleApi } from '../utils/api'
import type { Project, Requirement, User, ProjectMember, Role } from '../types'
import { useAuth } from '../context/AuthContext'
import RichTextEditor from '../components/RichTextEditor'
import WikiTab from '../components/WikiTab'
import AttachmentsTab from '../components/AttachmentsTab'
import ProjectKanban from '../components/ProjectKanban'

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const [project, setProject] = useState<Project | null>(null)
  const [requirements, setRequirements] = useState<Requirement[]>([])
  const [activeTab, setActiveTab] = useState<'requirements' | 'kanban' | 'members' | 'wiki' | 'attachments' | 'agents'>('requirements')
  const [isLoading, setIsLoading] = useState(true)

  // ── Add member ────────────────────────────────────────────────
  const [showAddMember, setShowAddMember] = useState(false)
  const [allUsers, setAllUsers] = useState<User[]>([])
  const [selectedUserId, setSelectedUserId] = useState('')
  const [selectedRole, setSelectedRole] = useState('')
  const [isAddingMember, setIsAddingMember] = useState(false)
  const [availableRoles, setAvailableRoles] = useState<Role[]>([])

  // Edit member role
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null)
  const [editingRole, setEditingRole] = useState('')

  // ── Requirement CRUD ─────────────────────────────────────────
  const [showAddReqModal, setShowAddReqModal] = useState(false)
  const [newReqTitle, setNewReqTitle] = useState('')
  const [newReqDesc, setNewReqDesc] = useState('')
  const [newReqPriority, setNewReqPriority] = useState('medium')
  const [isAddingReq, setIsAddingReq] = useState(false)

  // Edit requirement
  const [editingReq, setEditingReq] = useState<Requirement | null>(null)
  const [editReqTitle, setEditReqTitle] = useState('')
  const [editReqDesc, setEditReqDesc] = useState('')
  const [editReqStatus, setEditReqStatus] = useState('')
  const [editReqPriority, setEditReqPriority] = useState('')
  const [isEditingReq, setIsEditingReq] = useState(false)

  useEffect(() => { if (id) loadProject() }, [id])
  useEffect(() => { roleApi.list().then(r => setAvailableRoles(r.data.roles || [])) }, [])

  const loadProject = async () => {
    try {
      const [projectRes, reqRes] = await Promise.all([
        projectApi.get(id!),
        requirementApi.list(id!)
      ])
      setProject(projectRes.data.project)
      setRequirements(reqRes.data.requirements)
    } catch (err) {
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  const loadAllUsers = async () => {
    const res = await userApi.list()
    const memberIds = new Set(project?.members?.map(m => m.user.id) || [])
    setAllUsers(res.data.users.filter((u: User) => !memberIds.has(u.id)))
  }

  const openAddMember = () => {
    setSelectedUserId(''); setSelectedRole(''); setIsAddingMember(false)
    Promise.all([loadAllUsers(), roleApi.list()]).then(([_, rolesRes]) => {
      setAvailableRoles(rolesRes.data.roles || [])
      setShowAddMember(true)
    })
  }

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedUserId) return
    setIsAddingMember(true)
    try {
      await projectApi.addMember(id!, { userId: selectedUserId, role: selectedRole })
      setShowAddMember(false)
      loadProject()
    } catch (err) {
      console.error(err)
      alert('無法新增成員')
    } finally {
      setIsAddingMember(false)
    }
  }

  const handleRemoveMember = async (memberId: string) => {
    if (!confirm('確定要移除這個成員嗎？')) return
    try {
      await projectApi.removeMember(memberId)
      loadProject()
    } catch (err) {
      console.error(err)
    }
  }

  const handleUpdateMemberRole = async (member: ProjectMember) => {
    try {
      await projectApi.updateMemberRole(member.id, editingRole)
      setEditingMemberId(null)
      loadProject()
    } catch (err) {
      console.error(err)
      alert('無法更新角色')
    }
  }

  // ── Requirement actions ──────────────────────────────────────
  const handleAddRequirement = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newReqTitle.trim()) return
    setIsAddingReq(true)
    try {
      await requirementApi.create(id!, { title: newReqTitle, description: newReqDesc, priority: newReqPriority })
      setShowAddReqModal(false)
      setNewReqTitle(''); setNewReqDesc(''); setNewReqPriority('medium')
      loadProject()
    } catch (err) {
      console.error(err)
    } finally {
      setIsAddingReq(false)
    }
  }

  const openEditReq = (req: Requirement) => {
    setEditingReq(req)
    setEditReqTitle(req.title)
    setEditReqDesc(req.description || '')
    setEditReqStatus(req.status)
    setEditReqPriority(req.priority)
  }

  const handleEditRequirement = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingReq) return
    setIsEditingReq(true)
    try {
      await requirementApi.update(editingReq.id, {
        title: editReqTitle,
        description: editReqDesc,
        status: editReqStatus,
        priority: editReqPriority
      })
      setEditingReq(null)
      loadProject()
    } catch (err) {
      console.error(err)
      alert('無法更新需求')
    } finally {
      setIsEditingReq(false)
    }
  }

  const handleDeleteRequirement = async (reqId: string) => {
    if (!confirm('確定要刪除這個需求嗎？')) return
    try {
      await requirementApi.delete(reqId)
      loadProject()
    } catch (err) {
      console.error(err)
      alert('無法刪除需求')
    }
  }

  // ── Helpers ──────────────────────────────────────────────────
  const canManageMembers = user?.role === 'admin' || project?.members?.some(m => m.user.id === user?.id && m.role === 'pm')
  const canEditReq = (_req: Requirement) => user?.role === 'admin' || user?.role === 'pm' || user?.role === 'tech_lead'
  const canDeleteReq = (_req: Requirement) => user?.role === 'admin' || user?.role === 'pm'

  const getPriorityColor = (p: string) => {
    switch (p) {
      case 'high': return 'bg-red-100 text-red-700'
      case 'medium': return 'bg-yellow-100 text-yellow-700'
      case 'low': return 'bg-gray-100 text-gray-600'
      default: return 'bg-gray-100 text-gray-600'
    }
  }
  const getPriorityLabel = (p: string) => ({ high: '優先', medium: '中等', low: '較低' }[p] || p)

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-700'
      case 'in_progress': return 'bg-blue-100 text-blue-700'
      case 'completed': return 'bg-green-100 text-green-700'
      default: return 'bg-gray-100 text-gray-600'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending': return '待處理'
      case 'in_progress': return '進行中'
      case 'completed': return '已完成'
      default: return status
    }
  }

  const roleLabel = (r: string) =>
    ({ pm: '項目經理', tech_lead: '技術主管', developer: '開發', tester: '測試' }[r] || r)

  const roleColor = (r: string) =>
    ({ pm: 'bg-purple-100 text-purple-700', tech_lead: 'bg-green-100 text-green-700', developer: 'bg-orange-100 text-orange-700', tester: 'bg-blue-100 text-blue-700' }[r] || 'bg-gray-100 text-gray-700')

  const stripHtml = (html: string) => html?.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim() || ''

  if (isLoading) {
    return <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500" /></div>
  }

  if (!project) return <div className="text-center py-12">項目不存在</div>

  return (
    <div>
      {/* Agent Activity Banner - Always visible for PM/Admin */}
      {(user?.role === 'admin' || user?.role === 'pm' || user?.role === 'tech_lead') && (
        <AgentActivityBanner projectId={id!} />
      )}

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6 lg:mb-8">
        <Link to="/" className="p-2 hover:bg-gray-200 rounded-lg transition-colors self-start">
          <ArrowLeft size={24} />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 truncate">{project.name}</h1>
          <p className="text-gray-500 mt-1 truncate">{project.description ? stripHtml(project.description) : '暫無描述'}</p>
        </div>
        <span className={`badge ${getStatusColor(project.status)} self-start`}>{getStatusLabel(project.status)}</span>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-gray-200 mb-6 overflow-x-auto -mx-4 px-4 lg:mx-0 lg:px-0">
        <button onClick={() => setActiveTab('requirements')} className={`pb-3 px-2 font-medium transition-colors whitespace-nowrap ${activeTab === 'requirements' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-500 hover:text-gray-700'}`}>
          <FileText size={18} className="inline mr-2" />需求 ({requirements.length})
        </button>
        <button onClick={() => setActiveTab('kanban')} className={`pb-3 px-2 font-medium transition-colors whitespace-nowrap ${activeTab === 'kanban' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-500 hover:text-gray-700'}`}>
          <LayoutGrid size={18} className="inline mr-2" />看板
        </button>
        <button onClick={() => setActiveTab('members')} className={`pb-3 px-2 font-medium transition-colors whitespace-nowrap ${activeTab === 'members' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-500 hover:text-gray-700'}`}>
          <Users size={18} className="inline mr-2" />成員 ({project.members?.length || 0})
        </button>
        <button onClick={() => setActiveTab('wiki')} className={`pb-3 px-2 font-medium transition-colors whitespace-nowrap ${activeTab === 'wiki' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-500 hover:text-gray-700'}`}>
          <BookOpen size={18} className="inline mr-2" />Wiki
        </button>
        <button onClick={() => setActiveTab('attachments')} className={`pb-3 px-2 font-medium transition-colors whitespace-nowrap ${activeTab === 'attachments' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-500 hover:text-gray-700'}`}>
          <Paperclip size={18} className="inline mr-2" />附件
        </button>
        {(user?.role === 'admin' || user?.role === 'pm' || user?.role === 'tech_lead') && (
          <button onClick={() => setActiveTab('agents')} className={`pb-3 px-2 font-medium transition-colors whitespace-nowrap ${activeTab === 'agents' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-500 hover:text-gray-700'}`}>
            <Bot size={18} className="inline mr-2" />Agent 任務
          </button>
        )}
      </div>

      {/* Requirements Tab */}
      {activeTab === 'requirements' && (
        <div>
          {(user?.role === 'admin' || user?.role === 'pm') && (
            <button onClick={() => { setNewReqTitle(''); setNewReqDesc(''); setShowAddReqModal(true) }} className="btn-primary flex items-center gap-2 mb-6 w-full sm:w-auto justify-center">
              <Plus size={20} /><span>新建需求</span>
            </button>
          )}
          {requirements.length === 0 ? (
            <div className="card p-12 text-center">
              <FileText size={48} className="mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">暫無需求</h3>
              <p className="text-gray-500">為項目添加第一個需求</p>
            </div>
          ) : (
            <div className="space-y-4">
              {requirements.map((req) => (
                <div key={req.id} className="card p-6 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Link to={`/requirements/${req.id}`} className="font-semibold text-gray-900 hover:text-primary-600">{req.title}</Link>
                        <span className={`badge ${getStatusColor(req.status)}`}>{getStatusLabel(req.status)}</span>
                        <span className={`badge ${getPriorityColor(req.priority)}`}>{getPriorityLabel(req.priority)}</span>
                        {canEditReq(req) && (
                          <>
                            <button onClick={() => openEditReq(req)} className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="編輯需求">
                              <Edit2 size={14} />
                            </button>
                            {canDeleteReq(req) && (
                              <button onClick={() => handleDeleteRequirement(req.id)} className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="刪除需求">
                                <Trash2 size={14} />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                      <p className="text-gray-500 text-sm mb-3">{req.description ? stripHtml(req.description) : '暫無描述'}</p>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-gray-400 flex items-center gap-1"><CheckCircle size={14} />{req.taskCount || 0} 任務</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Kanban Tab */}
      {activeTab === 'kanban' && (
        <ProjectKanban projectId={id!} />
      )}

      {/* Members Tab */}
      {activeTab === 'members' && (
        <div>
          {canManageMembers && (
            <button onClick={openAddMember} className="btn-primary flex items-center gap-2 mb-6 w-full sm:w-auto justify-center">
              <Plus size={20} /><span>新增成員</span>
            </button>
          )}
          <div className="card">
            <div className="p-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">項目成員</h3>
            </div>
            <div className="divide-y divide-gray-100">
              {project.members?.map((member) => (
                <div key={member.id} className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
                      <span className="text-primary-600 font-medium">{member.user.name.charAt(0)}</span>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{member.user.name}</p>
                      <p className="text-sm text-gray-500">{member.user.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {editingMemberId === member.id ? (
                      <>
                        <select value={editingRole} onChange={(e) => setEditingRole(e.target.value)} className="input-field py-1 text-sm w-32">
                          {availableRoles.map(r => (
                            <option key={r.id} value={r.name}>{r.name}</option>
                          ))}
                        </select>
                        <button onClick={() => handleUpdateMemberRole(member)} className="btn-primary py-1 px-3 text-sm">儲存</button>
                        <button onClick={() => setEditingMemberId(null)} className="btn-secondary py-1 px-3 text-sm">取消</button>
                      </>
                    ) : (
                      <>
                        <span className={`badge ${roleColor(member.role)}`}>{roleLabel(member.role)}</span>
                        {canManageMembers && member.user.id !== user?.id && (
                          <>
                            <button onClick={() => { setEditingMemberId(member.id); setEditingRole(member.role) }} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="變更角色">
                              <Edit2 size={16} />
                            </button>
                            <button onClick={() => handleRemoveMember(member.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="移除成員">
                              <UserMinus size={16} />
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Wiki Tab */}
      {activeTab === 'wiki' && (
        <WikiTab projectId={id!} />
      )}

      {/* Attachments Tab */}
      {activeTab === 'attachments' && (
        <AttachmentsTab projectId={id!} />
      )}

      {/* Agent Monitoring Tab */}
      {activeTab === 'agents' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Agent Task List */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-lg shadow">
              <div className="p-4 border-b flex items-center justify-between">
                <h2 className="font-semibold flex items-center gap-2">
                  <Bot className="w-5 h-5 text-purple-600" />
                  AI Agent 任務列表
                </h2>
                <button onClick={() => { window.location.reload() }} className="p-1.5 hover:bg-gray-100 rounded-lg" title="刷新">
                  <RefreshCw size={16} />
                </button>
              </div>

              {/* Show project tasks assigned to agents */}
              <AgentTasksList projectId={id!} />
            </div>
          </div>
        </div>
      )}

      {/* Add Member Modal */}
      {showAddMember && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">新增項目成員</h2>
              <button onClick={() => setShowAddMember(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>
            <form onSubmit={handleAddMember} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">選擇用戶 *</label>
                <select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)} className="input-field" required>
                  <option value="">-- 選擇用戶 --</option>
                  {allUsers.map(u => (
                    <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                  ))}
                </select>
                {allUsers.length === 0 && <p className="text-xs text-gray-500 mt-1">所有用戶已在此項目中</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">項目角色 *</label>
                <select value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)} className="input-field" required>
                  <option value="">-- 選擇角色 --</option>
                  {availableRoles.map(r => (
                    <option key={r.id} value={r.name}>{r.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setShowAddMember(false)} className="btn-secondary">取消</button>
                <button type="submit" disabled={isAddingMember || !selectedUserId} className="btn-primary">
                  {isAddingMember ? '新增中...' : '新增'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Requirement Modal */}
      {showAddReqModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">新建需求</h2>
              <button onClick={() => setShowAddReqModal(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>
            <form onSubmit={handleAddRequirement} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">需求標題 *</label>
                <input type="text" value={newReqTitle} onChange={(e) => setNewReqTitle(e.target.value)} className="input-field" placeholder="例如：用戶登入功能" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
                <RichTextEditor value={newReqDesc} onChange={setNewReqDesc} placeholder="需求的詳細描述..." rows={6} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">優先級</label>
                <select value={newReqPriority} onChange={(e) => setNewReqPriority(e.target.value)} className="input-field">
                  <option value="high">優先</option>
                  <option value="medium">中等</option>
                  <option value="low">較低</option>
                </select>
              </div>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setShowAddReqModal(false)} className="btn-secondary">取消</button>
                <button type="submit" disabled={isAddingReq} className="btn-primary">{isAddingReq ? '創建中...' : '創建'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Requirement Modal */}
      {editingReq && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">編輯需求</h2>
              <button onClick={() => setEditingReq(null)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>
            <form onSubmit={handleEditRequirement} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">需求標題 *</label>
                <input type="text" value={editReqTitle} onChange={(e) => setEditReqTitle(e.target.value)} className="input-field" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
                <RichTextEditor value={editReqDesc} onChange={setEditReqDesc} rows={6} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">優先級</label>
                <select value={editReqPriority} onChange={(e) => setEditReqPriority(e.target.value)} className="input-field">
                  <option value="high">優先</option>
                  <option value="medium">中等</option>
                  <option value="low">較低</option>
                </select>
              </div>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setEditingReq(null)} className="btn-secondary">取消</button>
                <button type="submit" disabled={isEditingReq} className="btn-primary">{isEditingReq ? '保存中...' : '保存'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Agent Activity Banner Component ─────────────────────────────
interface TaskInfo {
  id: string
  title: string
  status: string
  assignee?: { id: string; name: string }
}

function AgentActivityBanner({ projectId }: { projectId: string }) {
  const [inProgressTasks, setInProgressTasks] = useState<TaskInfo[]>([])
  const [loading, setLoading] = useState(true)

  const loadAgentTasks = async () => {
    try {
      const res = await fetch(`/api/tasks?projectId=${projectId}&status=in_progress`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` }
      })
      const data = await res.json()
      const agentTasks = (data.tasks || []).filter((t: TaskInfo) => t.assignee?.name?.includes('Agent') || t.assignee?.name?.includes('AI'))
      setInProgressTasks(agentTasks)
    } catch (err) {
      console.error('Failed to load agent tasks:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAgentTasks()
    const interval = setInterval(loadAgentTasks, 10000) // Refresh every 10 seconds
    return () => clearInterval(interval)
  }, [projectId])

  if (loading) return null

  if (inProgressTasks.length === 0) {
    return (
      <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200 flex items-center gap-3">
        <Bot className="w-5 h-5 text-gray-400" />
        <span className="text-sm text-gray-500">目前沒有 AI Agent 在處理任務</span>
        <span className="text-xs text-gray-400 ml-auto">點擊需求詳情頁的 🤖 按鈕派發任務</span>
      </div>
    )
  }

  return (
    <div className="mb-4 p-3 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg border border-purple-200">
      <div className="flex items-center gap-2 mb-2">
        <Activity className="w-5 h-5 text-purple-600 animate-pulse" />
        <span className="font-medium text-purple-900">AI Agent 正在工作</span>
        <span className="text-xs text-purple-600 bg-purple-100 px-2 py-0.5 rounded ml-2">{inProgressTasks.length} 個任務</span>
      </div>
      <div className="space-y-1">
        {inProgressTasks.map(task => (
          <div key={task.id} className="flex items-center gap-2 text-sm">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-gray-700 truncate flex-1">{task.title}</span>
            <span className="text-xs text-gray-500 bg-white px-2 py-0.5 rounded">{task.assignee?.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Agent Tasks List Component ─────────────────────────────────────
interface AgentTask {
  id: string
  title: string
  description?: string
  status: string
  assignee?: { id: string; name: string; isAgent?: boolean }
  createdAt: string
}

function AgentTasksList({ projectId }: { projectId: string }) {
  const [tasks, setTasks] = useState<AgentTask[]>([])
  const [loading, setLoading] = useState(true)

  const loadTasks = async () => {
    try {
      const res = await fetch(`/api/tasks?projectId=${projectId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` }
      })
      const data = await res.json()
      // Filter to show only tasks assigned to agents
      const agentTasks = (data.tasks || []).filter((t: AgentTask) =>
        t.assignee?.name?.includes('Agent') || t.assignee?.name?.includes('AI')
      )
      setTasks(agentTasks)
    } catch (err) {
      console.error('Failed to load tasks:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTasks()
    const interval = setInterval(loadTasks, 5000) // Refresh every 5 seconds
    return () => clearInterval(interval)
  }, [projectId])

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <span className="px-2 py-1 text-xs bg-yellow-100 text-yellow-700 rounded">待處理</span>
      case 'in_progress':
        return <span className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded flex items-center gap-1">
          <Activity className="w-3 h-3 animate-pulse" />處理中
        </span>
      case 'completed':
        return <span className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded">已完成</span>
      default:
        return <span className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded">{status}</span>
    }
  }

  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className="animate-spin w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full mx-auto"></div>
        <p className="text-gray-500 mt-2">載入中...</p>
      </div>
    )
  }

  if (tasks.length === 0) {
    return (
      <div className="p-8 text-center">
        <Bot className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <h3 className="font-medium text-gray-600">暫無 Agent 任務</h3>
        <p className="text-gray-400 text-sm mt-1">在需求詳情頁點擊 🤖 按鈕派發任務</p>
      </div>
    )
  }

  return (
    <div className="divide-y divide-gray-100">
      {tasks.map(task => (
        <div key={task.id} className="p-4 hover:bg-gray-50 transition-colors">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Bot className="w-4 h-4 text-purple-600" />
                <h4 className="font-medium text-gray-900 truncate">{task.title}</h4>
                {getStatusBadge(task.status)}
              </div>
              {task.description && (
                <p className="text-sm text-gray-500 truncate">{task.description.replace(/<[^>]*>/g, '')}</p>
              )}
              <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                <span>負責人：{task.assignee?.name}</span>
                <span>建立時間：{new Date(task.createdAt).toLocaleString('zh-TW')}</span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}