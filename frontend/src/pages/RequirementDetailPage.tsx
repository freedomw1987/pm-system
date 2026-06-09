import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Plus, CheckCircle, Bug as BugIcon, AlertTriangle, Edit2, Trash2, X, Clock, Bot, Search } from 'lucide-react'
import { requirementApi, taskApi, bugApi, projectApi, workLogApi } from '../utils/api'
import { hasAnyPermission } from '../utils/permissions'
import { useAuth } from '../context/AuthContext'
import RichTextEditor from '../components/RichTextEditor'
import ToggleMultiSelect from '../components/ToggleMultiSelect'
import Pagination from '../components/Pagination'
import { DEFAULT_PAGE_SIZE } from '../utils/pagination'
import type { Requirement, Task, Bug, User } from '../types'

const today = () => new Date().toISOString().split('T')[0]

export default function RequirementDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const [requirement, setRequirement] = useState<Requirement | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [bugs, setBugs] = useState<Bug[]>([])
  const [projectMembers, setProjectMembers] = useState<User[]>([])
  const [activeTab, setActiveTab] = useState<'tasks' | 'bugs'>('tasks')
  const [isLoading, setIsLoading] = useState(true)

  // ── Pagination (US-7.x Sprint 9) ─ sub-lists ──────────────────
  const [pageTask, setPageTask] = useState(1)
  const [pageSizeTask, setPageSizeTask] = useState(DEFAULT_PAGE_SIZE)
  const [totalCountTask, setTotalCountTask] = useState(0)
  const [totalPagesTask, setTotalPagesTask] = useState(1)

  const [pageBug, setPageBug] = useState(1)
  const [pageSizeBug, setPageSizeBug] = useState(DEFAULT_PAGE_SIZE)
  const [totalCountBug, setTotalCountBug] = useState(0)
  const [totalPagesBug, setTotalPagesBug] = useState(1)

  // ── Requirement edit ──────────────────────────────────────────
  const [showEditReq, setShowEditReq] = useState(false)
  const [editReqTitle, setEditReqTitle] = useState('')
  const [editReqDesc, setEditReqDesc] = useState('')
  const [editReqStatus, setEditReqStatus] = useState('')
  const [editReqPriority, setEditReqPriority] = useState('')
  const [editReqAssignee, setEditReqAssignee] = useState('')
  const [isEditingReq, setIsEditingReq] = useState(false)

  // ── Task CRUD ─────────────────────────────────────────────────
  const [showAddTask, setShowAddTask] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskDesc, setNewTaskDesc] = useState('')
  const [newTaskAssignee, setNewTaskAssignee] = useState('')
  const [newTaskParticipantIds, setNewTaskParticipantIds] = useState<string[]>([])
  const [newTaskParentId, setNewTaskParentId] = useState('')
  const [isAddingTask, setIsAddingTask] = useState(false)
  const [autoAssignAgent, setAutoAssignAgent] = useState(true)
  const [recommendedAgent, setRecommendedAgent] = useState<{ id: string; name: string; skills: string[] } | null>(null)
  const [assigningTaskId, setAssigningTaskId] = useState<string | null>(null)

  // Task edit
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [editTaskTitle, setEditTaskTitle] = useState('')
  const [editTaskDesc, setEditTaskDesc] = useState('')
  const [editTaskStatus, setEditTaskStatus] = useState('')
  const [editTaskAssignee, setEditTaskAssignee] = useState('')
  const [editTaskParticipantIds, setEditTaskParticipantIds] = useState<string[]>([])
  const [editTaskParentId, setEditTaskParentId] = useState('')
  const [isEditingTask, setIsEditingTask] = useState(false)

  // ── Bug CRUD ───────────────────────────────────────────────────
  const [showAddBug, setShowAddBug] = useState(false)
  const [newBugTitle, setNewBugTitle] = useState('')
  const [newBugDesc, setNewBugDesc] = useState('')
  const [newBugSeverity, setNewBugSeverity] = useState('medium')
  const [newBugAssignee, setNewBugAssignee] = useState('')
  const [isAddingBug, setIsAddingBug] = useState(false)

  // Bug edit
  const [editingBug, setEditingBug] = useState<Bug | null>(null)
  const [editBugTitle, setEditBugTitle] = useState('')
  const [editBugDesc, setEditBugDesc] = useState('')
  const [editBugStatus, setEditBugStatus] = useState('')
  const [editBugSeverity, setEditBugSeverity] = useState('')
  const [editBugAssignee, setEditBugAssignee] = useState('')
  const [isEditingBug, setIsEditingBug] = useState(false)

  // ── Work log ───────────────────────────────────────────────────
  const [showWorkLogModal, setShowWorkLogModal] = useState(false)
  const [workLogTarget, setWorkLogTarget] = useState<{ type: 'task' | 'bug'; id: string; title: string } | null>(null)
  const [workLogForm, setWorkLogForm] = useState({
    hours: '',
    workDate: today(),
    note: ''
  })
  const [isSubmittingWorkLog, setIsSubmittingWorkLog] = useState(false)

  useEffect(() => { if (id) loadData() }, [id, pageTask, pageSizeTask, pageBug, pageSizeBug])

  const loadProjectMembers = async (projectId?: string) => {
    const targetProjectId = projectId || requirement?.projectId
    if (!targetProjectId) {
      setProjectMembers([])
      return
    }

    try {
      const res = await projectApi.getMembers(targetProjectId)
      const members = (res.data.members || [])
        .map((member: { user: Pick<User, 'id' | 'name'> }) => member.user as User)
        .filter(Boolean)
      setProjectMembers(members)
    } catch (err) {
      console.error('Failed to load project members:', err)
      setProjectMembers([])
    }
  }

  const loadData = async () => {
    try {
      // Sprint 9: paginated sub-lists (US-7.x)
      const [reqRes, tasksRes, bugsRes] = await Promise.all([
        requirementApi.get(id!),
        taskApi.list({ requirementId: id, page: pageTask, pageSize: pageSizeTask }),
        bugApi.list({ requirementId: id, page: pageBug, pageSize: pageSizeBug })
      ])
      const req = reqRes.data.requirement
      setRequirement(req)
      setTasks(tasksRes.data.tasks || [])
      setTotalCountTask(tasksRes.data.totalCount ?? tasksRes.data.tasks?.length ?? 0)
      setTotalPagesTask(tasksRes.data.totalPages ?? 1)
      setBugs(bugsRes.data.bugs || [])
      setTotalCountBug(bugsRes.data.totalCount ?? bugsRes.data.bugs?.length ?? 0)
      setTotalPagesBug(bugsRes.data.totalPages ?? 1)
      await loadProjectMembers(req?.projectId)
    } catch (err) {
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  // ── Requirement actions ────────────────────────────────────────
  const openEditReq = () => {
    if (!requirement) return
    setEditReqTitle(requirement.title)
    setEditReqDesc(requirement.description || '')
    setEditReqStatus(requirement.status)
    setEditReqPriority(requirement.priority || 'medium')
    setEditReqAssignee((requirement as any).assignee?.id || '')
    setShowEditReq(true)
  }

  const handleEditRequirement = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsEditingReq(true)
    try {
      await requirementApi.update(id!, {
        title: editReqTitle,
        description: editReqDesc,
        status: editReqStatus,
        priority: editReqPriority,
        assigneeId: editReqAssignee || undefined
      })
      setShowEditReq(false)
      loadData()
    } catch (err) {
      console.error(err)
      alert('無法更新需求')
    } finally {
      setIsEditingReq(false)
    }
  }

  const handleDeleteRequirement = async () => {
    if (!confirm('確定要刪除這個需求嗎？')) return
    try {
      await requirementApi.delete(id!)
      window.location.href = `/projects/${requirement?.projectId}`
    } catch (err) {
      console.error(err)
      alert('無法刪除需求')
    }
  }

  // ── Task actions ──────────────────────────────────────────────
  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTaskTitle.trim()) return
    setIsAddingTask(true)
    try {
      // Create task
      const result = await taskApi.create({
        title: newTaskTitle,
        description: newTaskDesc,
        assigneeId: newTaskAssignee || undefined,
        participantIds: newTaskParticipantIds,
        parentTaskId: newTaskParentId || undefined,
        requirementIds: [id!],
        projectId: requirement?.projectId
      })

      const taskId = result.data.task?.id

      // Auto-assign to recommended agent if enabled and we have a task ID
      if (autoAssignAgent && taskId && recommendedAgent) {
        try {
          await taskApi.autoAssign(taskId)
        } catch (autoErr) {
          console.error('Auto-assign failed:', autoErr)
          // Continue even if auto-assign fails
        }
      }

      setShowAddTask(false)
      setNewTaskTitle(''); setNewTaskDesc(''); setNewTaskAssignee(''); setNewTaskParticipantIds([]); setNewTaskParentId('')
      setRecommendedAgent(null)
      loadData()
    } catch (err) {
      console.error(err)
      alert('無法建立任務')
    } finally {
      setIsAddingTask(false)
    }
  }

  // Get recommendation when title changes
  useEffect(() => {
    if (newTaskTitle.trim() && newTaskTitle.length >= 3) {
      // Debounce the recommendation
      const timer = setTimeout(async () => {
        try {
          // Get agents overview for matching
          const agentsResponse = await taskApi.getAgentsOverview()
          const agents = agentsResponse.data.agents || []

          // Simple keyword matching
          const keywords = (newTaskTitle + ' ' + newTaskDesc).toLowerCase().match(/\w{2,}/g) || []

          const skillKeywords: Record<string, string[]> = {
            code_review: ['代碼審查', 'code review', 'review', 'pull request', 'pr', '審視', '審核'],
            testing: ['測試', 'test', 'unit test', '測試用例', '自動化'],
            documentation: ['文檔', 'docs', 'readme', 'wiki', '手冊'],
            bug_analysis: ['bug', 'bug分析', '錯誤', '除錯', 'debug', '問題', '修復'],
            refactoring: ['重構', 'refactor', '優化'],
            security_audit: ['安全', 'security', '漏洞', '審計'],
            performance: ['性能', '效能', '優化', 'slow'],
            design: ['設計', '架構', 'architecture', '系統設計']
          }

          let bestAgent: typeof agents[0] | null = null
          let bestScore = 0
          let matchedSkills: string[] = []

          for (const agent of agents) {
            if (agent.activeTasks >= agent.maxConcurrentTasks) continue
            const score = (agent.skills || []).filter((skill: string) => {
              const kws = skillKeywords[skill] || []
              return keywords.some((kw: string) => kws.some((k: string) => k.includes(kw) || kw.includes(k)))
            }).length

            if (score > bestScore) {
              bestScore = score
              bestAgent = agent
              matchedSkills = (agent.skills || []).filter((skill: string) => {
                const kws = skillKeywords[skill] || []
                return keywords.some((kw: string) => kws.some((k: string) => k.includes(kw) || kw.includes(k)))
              })
            }
          }

          if (bestAgent && bestScore > 0) {
            setRecommendedAgent({ id: bestAgent.id, name: bestAgent.name, skills: matchedSkills })
            if (autoAssignAgent) {
              setNewTaskAssignee(bestAgent.id)
            }
          } else {
            setRecommendedAgent(null)
          }
        } catch (err) {
          console.error('Failed to get recommendation:', err)
        }
      }, 500)
      return () => clearTimeout(timer)
    } else {
      setRecommendedAgent(null)
    }
  }, [newTaskTitle, newTaskDesc])

  const openEditTask = (task: Task) => {
    setEditingTask(task)
    setEditTaskTitle(task.title)
    setEditTaskDesc(task.description || '')
    setEditTaskStatus(task.status)
    setEditTaskAssignee(task.assignee?.id || '')
    setEditTaskParticipantIds(task.participants?.map(p => p.user.id).filter(Boolean) || [])
    setEditTaskParentId(task.parentTaskId || task.parentTask?.id || '')
  }

  const handleEditTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingTask) return
    setIsEditingTask(true)
    try {
      await taskApi.update(editingTask.id, {
        title: editTaskTitle,
        description: editTaskDesc,
        status: editTaskStatus,
        assigneeId: editTaskAssignee || null,
        participantIds: editTaskParticipantIds,
        parentTaskId: editTaskParentId || null
      })
      setEditingTask(null)
      loadData()
    } catch (err) {
      console.error(err)
      alert('無法更新任務')
    } finally {
      setIsEditingTask(false)
    }
  }

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('確定要刪除這個任務嗎？')) return
    try {
      await taskApi.delete(taskId)
      loadData()
    } catch (err) {
      console.error(err)
      alert('無法刪除任務')
    }
  }

  const handleTaskStatus = async (taskId: string, status: string) => {
    try {
      await taskApi.updateStatus(taskId, status)
      loadData()
    } catch (err) {
      console.error(err)
    }
  }

  // Get recommendation and assign existing task to agent
  const handleAssignToAgent = async (task: Task) => {
    if (task.assignee && task.assignee.name !== 'N/A') {
      if (!confirm(`任務已分配給 ${task.assignee.name}，確定要重新分配給 AI Agent 嗎？`)) {
        return
      }
    }

    setAssigningTaskId(task.id)
    try {
      // Get recommendation
      const response = await taskApi.getRecommendation(task.id)
      const recommendation = response.data.recommendation

      if (recommendation?.agent) {
        // Auto assign to best agent
        await taskApi.autoAssign(task.id)
        alert(`任務已分配給 ${recommendation.agent.name}`)
        loadData()
      } else {
        alert('找不到擅長此任務的 Agent')
      }
    } catch (err) {
      console.error('Failed to assign task:', err)
      alert('分配失敗')
    } finally {
      setAssigningTaskId(null)
    }
  }

  // ── Bug actions ───────────────────────────────────────────────
  const handleAddBug = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newBugTitle.trim()) return
    setIsAddingBug(true)
    try {
      const bugData = {
        title: newBugTitle,
        description: newBugDesc,
        severity: newBugSeverity,
        assigneeId: newBugAssignee || undefined,
        requirementId: id,
        projectId: requirement?.projectId
      }
      await bugApi.create(bugData)
      setShowAddBug(false)
      setNewBugTitle(''); setNewBugDesc(''); setNewBugSeverity('medium'); setNewBugAssignee('')
      loadData()
    } catch (err) {
      console.error(err)
      alert('無法建立缺陷')
    } finally {
      setIsAddingBug(false)
    }
  }

  const openEditBug = (bug: Bug) => {
    setEditingBug(bug)
    setEditBugTitle(bug.title)
    setEditBugDesc(bug.description || '')
    setEditBugStatus(bug.status)
    setEditBugSeverity(bug.severity)
    setEditBugAssignee((bug as Bug & { assignee?: User }).assignee?.id || '')
  }

  const handleEditBug = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingBug) return
    setIsEditingBug(true)
    try {
      const bugData = {
        title: editBugTitle,
        status: editBugStatus,
        description: editBugDesc,
        severity: editBugSeverity,
        assigneeId: editBugAssignee || undefined
      }
      await bugApi.update(editingBug.id, bugData)
      setEditingBug(null)
      loadData()
    } catch (err) {
      console.error(err)
      alert('無法更新缺陷')
    } finally {
      setIsEditingBug(false)
    }
  }

  // ── Search box (client-side filter, 2026-06-09 David feedback) ──
  const [searchTask, setSearchTask] = useState('')
  const [searchBug, setSearchBug] = useState('')

  const filteredTasks = useMemo(() => {
    const q = searchTask.trim().toLowerCase()
    if (!q) return tasks
    return tasks.filter(t => t.title.toLowerCase().includes(q))
  }, [tasks, searchTask])

  const filteredBugs = useMemo(() => {
    const q = searchBug.trim().toLowerCase()
    if (!q) return bugs
    return bugs.filter(b => b.title.toLowerCase().includes(q))
  }, [bugs, searchBug])

  const handleDeleteBug = async (bugId: string) => {
    if (!confirm('確定要刪除這個缺陷嗎？')) return
    try {
      await bugApi.delete(bugId)
      loadData()
    } catch (err) {
      console.error(err)
      alert('無法刪除缺陷')
    }
  }

  const handleBugStatus = async (bugId: string, status: string) => {
    try {
      await bugApi.updateStatus(bugId, status)
      loadData()
    } catch (err) {
      console.error(err)
    }
  }

  const openWorkLogModal = (target: { type: 'task' | 'bug'; id: string; title: string }) => {
    setWorkLogTarget(target)
    setWorkLogForm({ hours: '', workDate: today(), note: '' })
    setShowWorkLogModal(true)
  }

  const handleWorkLogSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!workLogTarget) return

    const hours = parseFloat(workLogForm.hours)
    if (Number.isNaN(hours) || hours <= 0) {
      alert('請輸入有效的工作時數')
      return
    }

    setIsSubmittingWorkLog(true)
    try {
      await workLogApi.create({
        taskId: workLogTarget.type === 'task' ? workLogTarget.id : undefined,
        bugId: workLogTarget.type === 'bug' ? workLogTarget.id : undefined,
        hours,
        workDate: workLogForm.workDate,
        note: workLogForm.note
      })
      setShowWorkLogModal(false)
      setWorkLogTarget(null)
      setWorkLogForm({ hours: '', workDate: today(), note: '' })
    } catch (err) {
      console.error(err)
      alert('無法登記工作時數')
    } finally {
      setIsSubmittingWorkLog(false)
    }
  }

  // ── Helpers ───────────────────────────────────────────────────
  const canEditReq = hasAnyPermission(user, ['requirements.edit'])
  const canEditTask = hasAnyPermission(user, ['tasks.edit'])
  const canDeleteTask = hasAnyPermission(user, ['tasks.delete'])
  const canDeleteBug = hasAnyPermission(user, ['bugs.delete'])

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
      case 'pending': return 'bg-gray-100 text-gray-700'
      case 'in_progress': return 'bg-blue-100 text-blue-700'
      case 'testing': return 'bg-yellow-100 text-yellow-700'
      case 'completed': return 'bg-green-100 text-green-700'
      case 'open': return 'bg-red-100 text-red-700'
      case 'resolved': return 'bg-green-100 text-green-700'
      case 'verified': return 'bg-primary-100 text-primary-700'
      default: return 'bg-gray-100 text-gray-700'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending': return '待處理'
      case 'in_progress': return '進行中'
      case 'testing': return '測試中'
      case 'completed': return '已完成'
      case 'open': return '已開啟'
      case 'resolved': return '已修復'
      case 'verified': return '已驗證'
      default: return status
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'low': return 'bg-gray-100 text-gray-600'
      case 'medium': return 'bg-yellow-100 text-yellow-700'
      case 'high': return 'bg-orange-100 text-orange-700'
      case 'critical': return 'bg-red-100 text-red-700'
      default: return 'bg-gray-100 text-gray-700'
    }
  }

  const getSeverityLabel = (s: string) => {
    switch (s) {
      case 'low': return '輕微'
      case 'medium': return '中等'
      case 'high': return '高'
      case 'critical': return '嚴重'
      default: return s
    }
  }

  const stripHtml = (html: string) => html?.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim() || ''

  const assigneeOptions = projectMembers.map(member => (
    <option key={member.id} value={member.id}>{member.name}</option>
  ))
  const participantOptions = projectMembers.map(member => ({ id: member.id, name: member.name }))

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary-500" />
      </div>
    )
  }

  if (!requirement) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">找不到這個需求</p>
        <Link to="/projects" className="btn-secondary mt-4 inline-block">返回項目</Link>
      </div>
    )
  }

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="mb-6">
        <Link to={`/projects/${requirement.projectId}`} className="flex items-center gap-1 text-gray-500 hover:text-gray-700 mb-4 transition-colors">
          <ArrowLeft size={18} /><span>返回項目</span>
        </Link>
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-gray-900">{requirement.title}</h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className={`badge ${getStatusColor(requirement.status)}`}>{getStatusLabel(requirement.status)}</span>
              <span className={`badge ${getPriorityColor(requirement.priority)}`}>{getPriorityLabel(requirement.priority)}</span>
              {(requirement as any).assignee && (
                <span className="badge bg-purple-100 text-purple-700">
                  負責人：{(requirement as any).assignee.name}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canEditReq && (
              <>
                <button onClick={openEditReq} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="編輯需求">
                  <Edit2 size={16} />
                </button>
                <button onClick={handleDeleteRequirement} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="刪除需求">
                  <Trash2 size={16} />
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-gray-200 mb-6">
        <button
          onClick={() => setActiveTab('tasks')}
          className={`pb-3 px-2 font-medium transition-colors ${activeTab === 'tasks' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <CheckCircle size={18} className="inline mr-2" />任務 ({tasks.length})
        </button>
        <button
          onClick={() => setActiveTab('bugs')}
          className={`pb-3 px-2 font-medium transition-colors ${activeTab === 'bugs' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <BugIcon size={18} className="inline mr-2" />缺陷 ({bugs.length})
        </button>
      </div>

      {/* Tasks Tab */}
      {activeTab === 'tasks' && (
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
            {hasAnyPermission(user, ['tasks.create']) && (
              <button onClick={() => { setNewTaskTitle(''); setNewTaskDesc(''); setNewTaskAssignee(''); setNewTaskParticipantIds([]); setNewTaskParentId(''); setShowAddTask(true) }} className="btn-primary flex items-center gap-2 w-full sm:w-auto justify-center">
                <Plus size={20} /><span>新建任務</span>
              </button>
            )}
            <div className="relative w-full sm:w-72">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={searchTask}
                onChange={(e) => setSearchTask(e.target.value)}
                placeholder="搜尋任務..."
                aria-label="搜尋任務"
                className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          {tasks.length === 0 ? (
            <div className="card p-12 text-center">
              <CheckCircle size={48} className="mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">暫無任務</h3>
              <p className="text-gray-500">為這個需求添加任務</p>
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="card p-12 text-center">
              <Search size={48} className="mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">無符合「{searchTask}」嘅任務</h3>
              <p className="text-gray-500">試下其他關鍵字,或清空搜尋框</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTasks.map((task) => (
                <div key={task.id} className="card p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h4 className="font-medium text-gray-900">{task.title}</h4>
                        <span className={`badge ${getStatusColor(task.status)}`}>{getStatusLabel(task.status)}</span>
                      </div>
                      {task.description && (
                        <p className="text-gray-500 text-sm truncate">{stripHtml(task.description)}</p>
                      )}
                      {task.assignee && (
                        <p className="text-gray-400 text-xs mt-1">負責人：{task.assignee.name}</p>
                      )}
                      {task.participants && task.participants.length > 0 && (
                        <p className="text-gray-400 text-xs mt-1">參與人：{task.participants.map(p => p.user.name).filter(Boolean).join(', ')}</p>
                      )}
                      {task.parentTask && (
                        <p className="text-gray-400 text-xs mt-1">父任务：{task.parentTask.title}</p>
                      )}
                      {task.subtasks && task.subtasks.length > 0 && (
                        <p className="text-gray-400 text-xs mt-1">子任务：{task.subtasks.map(st => st.title).join(', ')}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <select
                        value={task.status}
                        onChange={(e) => handleTaskStatus(task.id, e.target.value)}
                        className="input-field py-1.5 text-sm"
                      >
                        <option value="pending">待處理</option>
                        <option value="in_progress">進行中</option>
                        <option value="testing">測試中</option>
                        <option value="completed">已完成</option>
                      </select>
                      <button
                        onClick={() => openWorkLogModal({ type: 'task', id: task.id, title: task.title })}
                        className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                        title="登記時數"
                      >
                        <Clock size={14} />
                      </button>
                      {canEditTask && (
                        <button onClick={() => openEditTask(task)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="編輯任務">
                          <Edit2 size={14} />
                        </button>
                      )}
                      {/* Assign to Agent button - for all pending tasks */}
                      {task.status === 'pending' && (
                        <button
                          onClick={() => handleAssignToAgent(task)}
                          disabled={assigningTaskId === task.id}
                          className="p-1.5 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors disabled:opacity-50"
                          title="派給 Agent"
                        >
                          {assigningTaskId === task.id ? (
                            <div className="w-3.5 h-3.5 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Bot size={14} />
                          )}
                        </button>
                      )}
                      {canDeleteTask && (
                        <button onClick={() => handleDeleteTask(task.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="刪除任務">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <Pagination
                page={pageTask}
                pageSize={pageSizeTask}
                totalCount={totalCountTask}
                totalPages={totalPagesTask}
                onPageChange={setPageTask}
                onPageSizeChange={(s) => { setPageSizeTask(s); setPageTask(1) }}
              />
            </div>
          )}
        </div>
      )}

      {/* Bugs Tab */}
      {activeTab === 'bugs' && (
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
            {hasAnyPermission(user, ['bugs.create']) && (
              <button onClick={() => { setNewBugTitle(''); setNewBugDesc(''); setNewBugSeverity('medium'); setNewBugAssignee(''); setShowAddBug(true) }} className="btn-primary flex items-center gap-2 w-full sm:w-auto justify-center">
                <Plus size={20} /><span>新建缺陷</span>
              </button>
            )}
            <div className="relative w-full sm:w-72">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={searchBug}
                onChange={(e) => setSearchBug(e.target.value)}
                placeholder="搜尋缺陷..."
                aria-label="搜尋缺陷"
                className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          {bugs.length === 0 ? (
            <div className="card p-12 text-center">
              <BugIcon size={48} className="mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">暫無缺陷</h3>
              <p className="text-gray-500">還沒有缺陷回報</p>
            </div>
          ) : filteredBugs.length === 0 ? (
            <div className="card p-12 text-center">
              <Search size={48} className="mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">無符合「{searchBug}」嘅缺陷</h3>
              <p className="text-gray-500">試下其他關鍵字,或清空搜尋框</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredBugs.map((bug) => (
                <div key={bug.id} className="card p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <AlertTriangle size={14} className="text-red-500 flex-shrink-0" />
                        <h4 className="font-medium text-gray-900">{bug.title}</h4>
                        <span className={`badge ${getStatusColor(bug.status)}`}>{getStatusLabel(bug.status)}</span>
                        <span className={`badge ${getSeverityColor(bug.severity)}`}>{getSeverityLabel(bug.severity)}</span>
                      </div>
                      {bug.description && (
                        <p className="text-gray-500 text-sm truncate">{stripHtml(bug.description)}</p>
                      )}
                      {bug.reporter && (
                        <p className="text-gray-400 text-xs mt-1">回報人：{bug.reporter.name}</p>
                      )}
                      {(bug as Bug & { assignee?: User }).assignee && (
                        <p className="text-gray-400 text-xs mt-1">負責人：{(bug as Bug & { assignee?: User }).assignee?.name}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <select
                        value={bug.status}
                        onChange={(e) => handleBugStatus(bug.id, e.target.value)}
                        className="input-field py-1.5 text-sm"
                      >
                        <option value="open">已開啟</option>
                        <option value="in_progress">處理中</option>
                        <option value="resolved">已修復</option>
                        <option value="verified">已驗證</option>
                      </select>
                      <button
                        onClick={() => openWorkLogModal({ type: 'bug', id: bug.id, title: bug.title })}
                        className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                        title="登記時數"
                      >
                        <Clock size={14} />
                      </button>
                      <button onClick={() => openEditBug(bug)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="編輯缺陷">
                        <Edit2 size={14} />
                      </button>
                      {canDeleteBug && (
                        <button onClick={() => handleDeleteBug(bug.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="刪除缺陷">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <Pagination
                page={pageBug}
                pageSize={pageSizeBug}
                totalCount={totalCountBug}
                totalPages={totalPagesBug}
                onPageChange={setPageBug}
                onPageSizeChange={(s) => { setPageSizeBug(s); setPageBug(1) }}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Edit Requirement Modal ── */}
      {showEditReq && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">編輯需求</h2>
              <button onClick={() => setShowEditReq(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>
            <form onSubmit={handleEditRequirement} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">標題 *</label>
                <input type="text" value={editReqTitle} onChange={(e) => setEditReqTitle(e.target.value)} className="input-field w-full" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
                <RichTextEditor value={editReqDesc} onChange={setEditReqDesc} rows={6} />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">狀態</label>
                  <select value={editReqStatus} onChange={(e) => setEditReqStatus(e.target.value)} className="input-field w-full">
                    <option value="pending">待處理</option>
                    <option value="in_progress">進行中</option>
                    <option value="completed">已完成</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">優先級</label>
                  <select value={editReqPriority} onChange={(e) => setEditReqPriority(e.target.value)} className="input-field w-full">
                    <option value="high">優先</option>
                    <option value="medium">中等</option>
                    <option value="low">較低</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">負責人</label>
                  <select value={editReqAssignee} onChange={(e) => setEditReqAssignee(e.target.value)} className="input-field w-full">
                    <option value="">-- 不指定 --</option>
                    {projectMembers.map(member => (
                      <option key={member.id} value={member.id}>{member.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setShowEditReq(false)} className="btn-secondary">取消</button>
                <button type="submit" disabled={isEditingReq} className="btn-primary">
                  {isEditingReq ? '保存中...' : '保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Add Task Modal ── */}
      {showAddTask && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">新建任務</h2>
              <button onClick={() => setShowAddTask(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>
            <form onSubmit={handleAddTask} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">標題 *</label>
                <input type="text" value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)} className="input-field w-full" placeholder="輸入任務標題" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
                <RichTextEditor value={newTaskDesc} onChange={setNewTaskDesc} placeholder="輸入任務描述" rows={6} />
              </div>

              {/* Smart Assignment */}
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Bot className="w-5 h-5 text-blue-600" />
                    <span className="font-medium text-gray-900">智能分配</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoAssignAgent}
                      onChange={(e) => {
                        setAutoAssignAgent(e.target.checked)
                        if (e.target.checked && recommendedAgent) {
                          setNewTaskAssignee(recommendedAgent.id)
                        } else if (!e.target.checked) {
                          setNewTaskAssignee('')
                        }
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                {recommendedAgent ? (
                  <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-blue-200">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                      <Bot className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{recommendedAgent.name}</p>
                      <p className="text-sm text-gray-500">
                        匹配技能：
                        {recommendedAgent.skills.map((s) => (
                          <span key={s} className="ml-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">{s}</span>
                        ))}
                      </p>
                    </div>
                    {autoAssignAgent && (
                      <span className="text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded">將自動分配</span>
                    )}
                  </div>
                ) : newTaskTitle.length >= 3 ? (
                  <p className="text-sm text-gray-500">正在分析任務內容...</p>
                ) : (
                  <p className="text-sm text-gray-400">輸入任務標題以獲取推薦</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">負責人</label>
                <select value={newTaskAssignee} onChange={(e) => setNewTaskAssignee(e.target.value)} className="input-field w-full">
                  <option value="">-- 不指定 --</option>
                  {assigneeOptions}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">參與人</label>
                <ToggleMultiSelect
                  options={participantOptions}
                  value={newTaskParticipantIds}
                  onChange={setNewTaskParticipantIds}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">父任务</label>
                <select value={newTaskParentId} onChange={(e) => setNewTaskParentId(e.target.value)} className="input-field w-full">
                  <option value="">无父任务</option>
                  {tasks.map(task => (
                    <option key={task.id} value={task.id}>{task.title}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setShowAddTask(false)} className="btn-secondary">取消</button>
                <button type="submit" disabled={isAddingTask} className="btn-primary">
                  {isAddingTask ? '建立中...' : '建立任務'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit Task Modal ── */}
      {editingTask && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">編輯任務</h2>
              <button onClick={() => setEditingTask(null)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>
            <form onSubmit={handleEditTask} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">標題 *</label>
                <input type="text" value={editTaskTitle} onChange={(e) => setEditTaskTitle(e.target.value)} className="input-field w-full" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
                <RichTextEditor value={editTaskDesc} onChange={setEditTaskDesc} rows={6} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">狀態</label>
                  <select value={editTaskStatus} onChange={(e) => setEditTaskStatus(e.target.value)} className="input-field w-full">
                    <option value="pending">待處理</option>
                    <option value="in_progress">進行中</option>
                    <option value="testing">測試中</option>
                    <option value="completed">已完成</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">負責人</label>
                  <select value={editTaskAssignee} onChange={(e) => setEditTaskAssignee(e.target.value)} className="input-field w-full">
                    <option value="">-- 不指定 --</option>
                    {assigneeOptions}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">參與人</label>
                  <ToggleMultiSelect
                    options={participantOptions}
                    value={editTaskParticipantIds}
                    onChange={setEditTaskParticipantIds}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">父任务</label>
                  <select value={editTaskParentId} onChange={(e) => setEditTaskParentId(e.target.value)} className="input-field w-full">
                    <option value="">无父任务</option>
                    {tasks.filter(task => task.id !== editingTask.id).map(task => (
                      <option key={task.id} value={task.id}>{task.title}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setEditingTask(null)} className="btn-secondary">取消</button>
                <button type="submit" disabled={isEditingTask} className="btn-primary">
                  {isEditingTask ? '保存中...' : '保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Add Bug Modal ── */}
      {showAddBug && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">新建缺陷</h2>
              <button onClick={() => setShowAddBug(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>
            <form onSubmit={handleAddBug} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">標題 *</label>
                <input type="text" value={newBugTitle} onChange={(e) => setNewBugTitle(e.target.value)} className="input-field w-full" placeholder="輸入缺陷標題" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
                <RichTextEditor value={newBugDesc} onChange={setNewBugDesc} placeholder="輸入缺陷描述" rows={6} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">嚴重程度</label>
                <select value={newBugSeverity} onChange={(e) => setNewBugSeverity(e.target.value)} className="input-field w-full">
                  <option value="low">輕微</option>
                  <option value="medium">中等</option>
                  <option value="high">高</option>
                  <option value="critical">嚴重</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">負責人</label>
                <select value={newBugAssignee} onChange={(e) => setNewBugAssignee(e.target.value)} className="input-field w-full">
                  <option value="">-- 不指定 --</option>
                  {assigneeOptions}
                </select>
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setShowAddBug(false)} className="btn-secondary">取消</button>
                <button type="submit" disabled={isAddingBug} className="btn-primary">
                  {isAddingBug ? '建立中...' : '建立缺陷'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit Bug Modal ── */}
      {editingBug && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">編輯缺陷</h2>
              <button onClick={() => setEditingBug(null)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>
            <form onSubmit={handleEditBug} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">標題 *</label>
                <input type="text" value={editBugTitle} onChange={(e) => setEditBugTitle(e.target.value)} className="input-field w-full" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
                <RichTextEditor value={editBugDesc} onChange={setEditBugDesc} rows={6} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">狀態</label>
                  <select value={editBugStatus} onChange={(e) => setEditBugStatus(e.target.value)} className="input-field w-full">
                    <option value="open">已開啟</option>
                    <option value="in_progress">處理中</option>
                    <option value="resolved">已修復</option>
                    <option value="verified">已驗證</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">嚴重程度</label>
                  <select value={editBugSeverity} onChange={(e) => setEditBugSeverity(e.target.value)} className="input-field w-full">
                    <option value="low">輕微</option>
                    <option value="medium">中等</option>
                    <option value="high">高</option>
                    <option value="critical">嚴重</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">負責人</label>
                  <select value={editBugAssignee} onChange={(e) => setEditBugAssignee(e.target.value)} className="input-field w-full">
                    <option value="">-- 不指定 --</option>
                    {assigneeOptions}
                  </select>
                </div>
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setEditingBug(null)} className="btn-secondary">取消</button>
                <button type="submit" disabled={isEditingBug} className="btn-primary">
                  {isEditingBug ? '保存中...' : '保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Work Log Modal ── */}
      {showWorkLogModal && workLogTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">登記工作時數</h2>
                <p className="text-sm text-gray-500 mt-1 break-words">
                  {workLogTarget.type === 'task' ? '任務' : '缺陷'}：{workLogTarget.title}
                </p>
              </div>
              <button
                onClick={() => { setShowWorkLogModal(false); setWorkLogTarget(null) }}
                className="p-1 hover:bg-gray-100 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">時數 *</label>
                <input
                  type="number"
                  min="0.25"
                  max="24"
                  step="0.25"
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
                  rows={4}
                  placeholder="輸入工作內容或備註"
                />
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => { setShowWorkLogModal(false); setWorkLogTarget(null); setWorkLogForm({ hours: '', workDate: today(), note: '' }) }}
                  className="btn-secondary"
                >
                  取消
                </button>
                <button type="submit" disabled={isSubmittingWorkLog} className="btn-primary">
                  {isSubmittingWorkLog ? '登記中...' : '登記時數'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
