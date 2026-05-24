import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Plus, Users, FileText, CheckCircle, UserMinus, Edit2, Trash2, X, BookOpen, Paperclip } from 'lucide-react'
import { projectApi, requirementApi, userApi, roleApi } from '../utils/api'
import type { Project, Requirement, User, ProjectMember, Role } from '../types'
import { useAuth } from '../context/AuthContext'
import RichTextEditor from '../components/RichTextEditor'
import WikiTab from '../components/WikiTab'
import AttachmentsTab from '../components/AttachmentsTab'

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const [project, setProject] = useState<Project | null>(null)
  const [requirements, setRequirements] = useState<Requirement[]>([])
  const [activeTab, setActiveTab] = useState<'requirements' | 'members' | 'wiki' | 'attachments'>('requirements')
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
      await projectApi.removeMember(member.id)
      await projectApi.addMember(id!, { userId: member.user.id, role: editingRole })
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
        <button onClick={() => setActiveTab('members')} className={`pb-3 px-2 font-medium transition-colors whitespace-nowrap ${activeTab === 'members' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-500 hover:text-gray-700'}`}>
          <Users size={18} className="inline mr-2" />成員 ({project.members?.length || 0})
        </button>
        <button onClick={() => setActiveTab('wiki')} className={`pb-3 px-2 font-medium transition-colors whitespace-nowrap ${activeTab === 'wiki' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-500 hover:text-gray-700'}`}>
          <BookOpen size={18} className="inline mr-2" />Wiki
        </button>
        <button onClick={() => setActiveTab('attachments')} className={`pb-3 px-2 font-medium transition-colors whitespace-nowrap ${activeTab === 'attachments' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-500 hover:text-gray-700'}`}>
          <Paperclip size={18} className="inline mr-2" />附件
        </button>
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