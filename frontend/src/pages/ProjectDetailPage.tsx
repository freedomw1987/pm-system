import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Plus, Users, FileText, CheckCircle, UserMinus, Edit2, Trash2, X, BookOpen, Paperclip, LayoutGrid, Bot, Activity, RefreshCw, AlertTriangle, Search, Clock } from 'lucide-react'
import { projectApi, requirementApi, taskApi, bugApi, userApi, roleApi, workLogApi } from '../utils/api'
import { hasAnyPermission } from '../utils/permissions'
import type { Project, Requirement, User, ProjectMember, Role, Task, Bug } from '../types'
import { useAuth } from '../context/AuthContext'
import RichTextEditor from '../components/RichTextEditor'
import WikiTab from '../components/WikiTab'
import AttachmentsTab from '../components/AttachmentsTab'
import ProjectKanban from '../components/ProjectKanban'
import ToggleMultiSelect from '../components/ToggleMultiSelect'
import Pagination from '../components/Pagination'
import AddTaskModal, { type MemberOption } from '../components/AddTaskModal'
import { DEFAULT_PAGE_SIZE } from '../utils/pagination'

const today = () => new Date().toISOString().split('T')[0]

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const [project, setProject] = useState<Project | null>(null)
  const [requirements, setRequirements] = useState<Requirement[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [bugs, setBugs] = useState<Bug[]>([])
  const [activeTab, setActiveTab] = useState<'requirements' | 'tasks' | 'bugs' | 'kanban' | 'members' | 'wiki' | 'attachments' | 'agents'>('requirements')
  const [isLoading, setIsLoading] = useState(true)

  // ── Pagination (US-7.x Sprint 9) ─ sub-list tabs ───────────────
  const [pageReq, setPageReq] = useState(1)
  const [pageSizeReq, setPageSizeReq] = useState(DEFAULT_PAGE_SIZE)
  const [totalCountReq, setTotalCountReq] = useState(0)
  const [totalPagesReq, setTotalPagesReq] = useState(1)

  const [pageTask, setPageTask] = useState(1)
  const [pageSizeTask, setPageSizeTask] = useState(DEFAULT_PAGE_SIZE)
  const [totalCountTask, setTotalCountTask] = useState(0)
  const [totalPagesTask, setTotalPagesTask] = useState(1)

  const [pageBug, setPageBug] = useState(1)
  const [pageSizeBug, setPageSizeBug] = useState(DEFAULT_PAGE_SIZE)
  const [totalCountBug, setTotalCountBug] = useState(0)
  const [totalPagesBug, setTotalPagesBug] = useState(1)

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
  const [newReqAssignee, setNewReqAssignee] = useState('')
  const [isAddingReq, setIsAddingReq] = useState(false)

  // ── Task CRUD ────────────────────────────────────────────────
  const [showAddTaskModal, setShowAddTaskModal] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskDesc, setNewTaskDesc] = useState('')
  const [newTaskAssignee, setNewTaskAssignee] = useState('')
  const [newTaskParticipantIds, setNewTaskParticipantIds] = useState<string[]>([])
  const [newTaskParentId, setNewTaskParentId] = useState('')
  const [isAddingTask, setIsAddingTask] = useState(false)
  const [autoAssignAgent, setAutoAssignAgent] = useState(true)
  const [recommendedAgent, setRecommendedAgent] = useState<{ id: string; name: string; skills: string[] } | null>(null)
  const [assigningTaskId, setAssigningTaskId] = useState<string | null>(null)

  // Edit task
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [editTaskTitle, setEditTaskTitle] = useState('')
  const [editTaskDesc, setEditTaskDesc] = useState('')
  const [editTaskAssignee, setEditTaskAssignee] = useState('')
  const [editTaskParticipantIds, setEditTaskParticipantIds] = useState<string[]>([])
  const [editTaskParentId, setEditTaskParentId] = useState('')
  const [editTaskStatus, setEditTaskStatus] = useState('')
  const [isEditingTask, setIsEditingTask] = useState(false)

  // ── Work log ─────────────────────────────────────────────────
  const [showWorkLogModal, setShowWorkLogModal] = useState(false)
  const [workLogTarget, setWorkLogTarget] = useState<{ type: 'task' | 'bug'; id: string; title: string } | null>(null)
  const [workLogForm, setWorkLogForm] = useState({
    hours: '',
    workDate: today(),
    note: ''
  })
  const [isSubmittingWorkLog, setIsSubmittingWorkLog] = useState(false)

  // ── Bug CRUD ────────────────────────────────────────────────
  const [showAddBugModal, setShowAddBugModal] = useState(false)
  const [newBugTitle, setNewBugTitle] = useState('')
  const [newBugDesc, setNewBugDesc] = useState('')
  const [newBugSeverity, setNewBugSeverity] = useState('medium')
  const [newBugAssignee, setNewBugAssignee] = useState('')
  const [isAddingBug, setIsAddingBug] = useState(false)

  // Edit bug
  const [editingBug, setEditingBug] = useState<Bug | null>(null)
  const [editBugTitle, setEditBugTitle] = useState('')
  const [editBugDesc, setEditBugDesc] = useState('')
  const [editBugSeverity, setEditBugSeverity] = useState('')
  const [editBugStatus, setEditBugStatus] = useState('')
  const [editBugAssignee, setEditBugAssignee] = useState('')
  const [isEditingBug, setIsEditingBug] = useState(false)

  // Edit requirement
  const [editingReq, setEditingReq] = useState<Requirement | null>(null)
  const [editReqTitle, setEditReqTitle] = useState('')
  const [editReqDesc, setEditReqDesc] = useState('')
  const [editReqStatus, setEditReqStatus] = useState('')
  const [editReqPriority, setEditReqPriority] = useState('')
  const [isEditingReq, setIsEditingReq] = useState(false)

  // ── Search box (client-side filter, 2026-06-09 David feedback) ──
  const [searchReq, setSearchReq] = useState('')
  const [searchTask, setSearchTask] = useState('')
  const [searchBug, setSearchBug] = useState('')

  useEffect(() => { if (id) loadProject() }, [id, pageReq, pageSizeReq, pageTask, pageSizeTask, pageBug, pageSizeBug])
  useEffect(() => { roleApi.list().then(r => setAvailableRoles(r.data.roles || [])) }, [])

  // Get recommendation when task title changes (smart-assign panel)
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

  const loadProject = async () => {
    setIsLoading(true)
    try {
      const projectRes = await projectApi.get(id!)
      setProject(projectRes.data.project)

      // Sprint 9: paginated sub-lists (US-7.x)
      const [reqRes, tasksRes, bugsRes] = await Promise.allSettled([
        requirementApi.list(id!, { page: pageReq, pageSize: pageSizeReq }),
        taskApi.list({ projectId: id, page: pageTask, pageSize: pageSizeTask }),
        bugApi.list({ projectId: id, page: pageBug, pageSize: pageSizeBug })
      ])

      if (reqRes.status === 'fulfilled') {
        setRequirements(reqRes.value.data.requirements || [])
        setTotalCountReq(reqRes.value.data.totalCount ?? reqRes.value.data.requirements?.length ?? 0)
        setTotalPagesReq(reqRes.value.data.totalPages ?? 1)
      } else {
        console.error('Failed to load requirements:', reqRes.reason)
      }

      if (tasksRes.status === 'fulfilled') {
        setTasks(tasksRes.value.data.tasks || [])
        setTotalCountTask(tasksRes.value.data.totalCount ?? tasksRes.value.data.tasks?.length ?? 0)
        setTotalPagesTask(tasksRes.value.data.totalPages ?? 1)
      } else {
        console.error('Failed to load tasks:', tasksRes.reason)
      }

      if (bugsRes.status === 'fulfilled') {
        setBugs(bugsRes.value.data.bugs || [])
        setTotalCountBug(bugsRes.value.data.totalCount ?? bugsRes.value.data.bugs?.length ?? 0)
        setTotalPagesBug(bugsRes.value.data.totalPages ?? 1)
      } else {
        console.error('Failed to load bugs:', bugsRes.reason)
      }
    } catch (err) {
      console.error(err)
      setProject(null)
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

  // ── Search box filter (client-side, 2026-06-09) ──
  // Filter by title (case-insensitive contains). Use useMemo so we don't
  // re-filter on every render; only when source data or query changes.
  const filteredRequirements = useMemo(() => {
    const q = searchReq.trim().toLowerCase()
    if (!q) return requirements
    return requirements.filter(r => r.title.toLowerCase().includes(q))
  }, [requirements, searchReq])

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

  // ── Requirement actions ──────────────────────────────────────
  const handleAddRequirement = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newReqTitle.trim()) return
    setIsAddingReq(true)
    try {
      await requirementApi.create(id!, { title: newReqTitle, description: newReqDesc, priority: newReqPriority, assigneeId: newReqAssignee || undefined })
      setShowAddReqModal(false)
      setNewReqTitle(''); setNewReqDesc(''); setNewReqPriority('medium'); setNewReqAssignee('')
      loadProject()
    } catch (err) {
      console.error(err)
    } finally {
      setIsAddingReq(false)
    }
  }

  // ── Task actions ─────────────────────────────────────────────
  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTaskTitle.trim()) return
    setIsAddingTask(true)
    try {
      // Create task
      const result = await taskApi.create({
        title: newTaskTitle,
        description: newTaskDesc,
        projectId: id,
        assigneeId: newTaskAssignee || undefined,
        participantIds: newTaskParticipantIds,
        parentTaskId: newTaskParentId || undefined
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

      setShowAddTaskModal(false)
      setNewTaskTitle(''); setNewTaskDesc(''); setNewTaskAssignee(''); setNewTaskParticipantIds([]); setNewTaskParentId('')
      setRecommendedAgent(null)
      loadProject()
    } catch (err) {
      console.error(err)
      alert('無法建立任務')
    } finally {
      setIsAddingTask(false)
    }
  }

  const handleTaskStatus = async (taskId: string, status: string) => {
    try {
      await taskApi.updateStatus(taskId, status)
      loadProject()
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
        loadProject()
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

  const handleBugStatus = async (bugId: string, status: string) => {
    try {
      await bugApi.updateStatus(bugId, status)
      loadProject()
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

  // ── Bug actions ──────────────────────────────────────────────
  const handleAddBug = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newBugTitle.trim()) return
    setIsAddingBug(true)
    try {
      await bugApi.create({ title: newBugTitle, description: newBugDesc, severity: newBugSeverity, assigneeId: newBugAssignee || undefined, projectId: id })
      setShowAddBugModal(false)
      setNewBugTitle(''); setNewBugDesc(''); setNewBugSeverity('medium'); setNewBugAssignee('')
      loadProject()
    } catch (err) {
      console.error(err)
    } finally {
      setIsAddingBug(false)
    }
  }

  // ── Task edit/delete actions ────────────────────────────────
  const openEditTask = (task: Task) => {
    setEditingTask(task)
    setEditTaskTitle(task.title)
    setEditTaskDesc(task.description || '')
    setEditTaskAssignee(task.assignee?.id || '')
    setEditTaskParticipantIds(task.participants?.map(p => p.user.id).filter(Boolean) || [])
    setEditTaskParentId(task.parentTaskId || task.parentTask?.id || '')
    setEditTaskStatus(task.status)
  }

  const handleEditTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingTask) return
    setIsEditingTask(true)
    try {
      const payload: any = { title: editTaskTitle, description: editTaskDesc, status: editTaskStatus }
      if (editTaskAssignee) payload.assigneeId = editTaskAssignee
      else payload.assigneeId = null // unassign
      payload.participantIds = editTaskParticipantIds
      payload.parentTaskId = editTaskParentId || null
      await taskApi.update(editingTask.id, payload)
      setEditingTask(null)
      loadProject()
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
      loadProject()
    } catch (err) {
      console.error(err)
      alert('無法刪除任務')
    }
  }

  // ── Bug edit/delete actions ──────────────────────────────────
  const openEditBug = (bug: Bug) => {
    setEditingBug(bug)
    setEditBugTitle(bug.title)
    setEditBugDesc(bug.description || '')
    setEditBugSeverity(bug.severity)
    setEditBugStatus(bug.status)
    setEditBugAssignee(bug.assignee?.id || '')
  }

  const handleEditBug = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingBug) return
    setIsEditingBug(true)
    try {
      await bugApi.update(editingBug.id, {
        title: editBugTitle,
        description: editBugDesc,
        severity: editBugSeverity,
        status: editBugStatus,
        assigneeId: editBugAssignee || null
      })
      setEditingBug(null)
      loadProject()
    } catch (err) {
      console.error(err)
      alert('無法更新缺陷')
    } finally {
      setIsEditingBug(false)
    }
  }

  const handleDeleteBug = async (bugId: string) => {
    if (!confirm('確定要刪除這個缺陷嗎？')) return
    try {
      await bugApi.delete(bugId)
      loadProject()
    } catch (err) {
      console.error(err)
      alert('無法刪除缺陷')
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
  const canManageMembers = hasAnyPermission(user, ['projects.edit']) || project?.members?.some(m => m.user.id === user?.id && m.role === 'pm')
  const canEditReq = (_req: Requirement) => hasAnyPermission(user, ['requirements.edit'])
  const canDeleteReq = (_req: Requirement) => hasAnyPermission(user, ['requirements.delete'])
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

  // Derived lists for the task/bug modals (proj already has `project.members`; no extra fetch needed)
  const assigneeOptions: MemberOption[] = project?.members?.map((m: ProjectMember) => ({ id: m.user.id, name: m.user.name })) || []
  const participantOptions: MemberOption[] = project?.members?.map((m: ProjectMember) => ({ id: m.user.id, name: m.user.name })) || []

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
      {hasAnyPermission(user, ['tasks.view']) && (
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
        <button onClick={() => setActiveTab('tasks')} className={`pb-3 px-2 font-medium transition-colors whitespace-nowrap ${activeTab === 'tasks' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-500 hover:text-gray-700'}`}>
          <CheckCircle size={18} className="inline mr-2" />任務 ({tasks.length})
        </button>
        <button onClick={() => setActiveTab('bugs')} className={`pb-3 px-2 font-medium transition-colors whitespace-nowrap ${activeTab === 'bugs' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-500 hover:text-gray-700'}`}>
          <AlertTriangle size={18} className="inline mr-2" />缺陷 ({bugs.length})
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
        {hasAnyPermission(user, ['tasks.view']) && (
          <button onClick={() => setActiveTab('agents')} className={`pb-3 px-2 font-medium transition-colors whitespace-nowrap ${activeTab === 'agents' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-500 hover:text-gray-700'}`}>
            <Bot size={18} className="inline mr-2" />Agent 任務
          </button>
        )}
      </div>

      {/* Requirements Tab */}
      {activeTab === 'requirements' && (
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
            {hasAnyPermission(user, ['requirements.create']) && (
              <button onClick={() => { setNewReqTitle(''); setNewReqDesc(''); setShowAddReqModal(true) }} className="btn-primary flex items-center gap-2 w-full sm:w-auto justify-center">
                <Plus size={20} /><span>新建需求</span>
              </button>
            )}
            <div className="relative w-full sm:w-72">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={searchReq}
                onChange={(e) => setSearchReq(e.target.value)}
                placeholder="搜尋需求..."
                aria-label="搜尋需求"
                className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>
          {requirements.length === 0 ? (
            <div className="card p-12 text-center">
              <FileText size={48} className="mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">暫無需求</h3>
              <p className="text-gray-500">為項目添加第一個需求</p>
            </div>
          ) : filteredRequirements.length === 0 ? (
            <div className="card p-12 text-center">
              <Search size={48} className="mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">無符合「{searchReq}」嘅需求</h3>
              <p className="text-gray-500">試下其他關鍵字,或清空搜尋框</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredRequirements.map((req) => (
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
                        <span className="text-gray-400 flex items-center gap-1"><CheckCircle size={14} />{req._count?.tasks ?? req.taskCount ?? 0} 任務</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              <Pagination
                page={pageReq}
                pageSize={pageSizeReq}
                totalCount={totalCountReq}
                totalPages={totalPagesReq}
                onPageChange={setPageReq}
                onPageSizeChange={(s) => { setPageSizeReq(s); setPageReq(1) }}
              />
            </div>
          )}
        </div>
      )}

      {/* Tasks Tab */}
      {activeTab === 'tasks' && (
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
            {hasAnyPermission(user, ['tasks.create']) && (
              <button onClick={() => { setNewTaskTitle(''); setNewTaskDesc(''); setNewTaskAssignee(''); setNewTaskParticipantIds([]); setNewTaskParentId(''); setShowAddTaskModal(true) }} className="btn-primary flex items-center gap-2 w-full sm:w-auto justify-center">
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
              <p className="text-gray-500">點擊上方按鈕新增任務</p>
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
                      {task.requirements && task.requirements.length > 0 && (
                        <p className="text-gray-400 text-xs mt-1">需求：{task.requirements.map(r => r.requirement?.title).filter(Boolean).join(', ')}</p>
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
              <button onClick={() => { setNewBugTitle(''); setNewBugDesc(''); setNewBugSeverity('medium'); setNewBugAssignee(''); setShowAddBugModal(true) }} className="btn-primary flex items-center gap-2 w-full sm:w-auto justify-center">
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
              <AlertTriangle size={48} className="mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">暫無缺陷</h3>
              <p className="text-gray-500">點擊上方按鈕回報缺陷</p>
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
                      {bug.assignee && (
                        <p className="text-gray-400 text-xs mt-1">負責人：{bug.assignee.name}</p>
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
                      {hasAnyPermission(user, ['bugs.edit']) && (
                        <button onClick={() => openEditBug(bug)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="編輯缺陷">
                          <Edit2 size={14} />
                        </button>
                      )}
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

      {/* Kanban Tab */}
      {activeTab === 'kanban' && (
        <ProjectKanban projectId={id!} />
      )}

      {/* Members Tab */}
      {activeTab === 'members' && (
        <MembersTab
          project={project}
          canManageMembers={canManageMembers}
          user={user}
          editingMemberId={editingMemberId}
          setEditingMemberId={setEditingMemberId}
          editingRole={editingRole}
          setEditingRole={setEditingRole}
          availableRoles={availableRoles}
          handleUpdateMemberRole={handleUpdateMemberRole}
          handleRemoveMember={handleRemoveMember}
          openAddMember={openAddMember}
          showAddMember={showAddMember}
          setShowAddMember={setShowAddMember}
          allUsers={allUsers}
          selectedUserId={selectedUserId}
          setSelectedUserId={setSelectedUserId}
          selectedRole={selectedRole}
          setSelectedRole={setSelectedRole}
          isAddingMember={isAddingMember}
          handleAddMember={handleAddMember}
          roleColor={roleColor}
          roleLabel={roleLabel}
        />
      )}

      {/* Wiki Tab */}
      {activeTab === 'wiki' && (
        <WikiTabComponent projectId={id!} />
      )}

      {/* Attachments Tab */}
      {activeTab === 'attachments' && (
        <AttachmentsTabComponent projectId={id!} />
      )}

      {/* Agent Monitoring Tab */}
      {activeTab === 'agents' && (
        <AgentMonitoringTab id={id!} />
      )}

      {/* Modals */}
      <AddTaskModal
        open={showAddTaskModal}
        onClose={() => setShowAddTaskModal(false)}
        title={newTaskTitle} setTitle={setNewTaskTitle}
        description={newTaskDesc} setDescription={setNewTaskDesc}
        assigneeId={newTaskAssignee} setAssigneeId={setNewTaskAssignee}
        participantIds={newTaskParticipantIds} setParticipantIds={setNewTaskParticipantIds}
        parentTaskId={newTaskParentId} setParentTaskId={setNewTaskParentId}
        autoAssignAgent={autoAssignAgent} setAutoAssignAgent={setAutoAssignAgent}
        recommendedAgent={recommendedAgent}
        assigneeOptions={assigneeOptions}
        participantOptions={participantOptions}
        parentTaskOptions={tasks}
        isSubmitting={isAddingTask}
        onSubmit={handleAddTask}
      />
      <AddBugModal
        showAddBugModal={showAddBugModal} setShowAddBugModal={setShowAddBugModal}
        newBugTitle={newBugTitle} setNewBugTitle={setNewBugTitle}
        newBugDesc={newBugDesc} setNewBugDesc={setNewBugDesc}
        newBugSeverity={newBugSeverity} setNewBugSeverity={setNewBugSeverity}
        newBugAssignee={newBugAssignee} setNewBugAssignee={setNewBugAssignee}
        isAddingBug={isAddingBug} handleAddBug={handleAddBug}
        assigneeOptions={assigneeOptions}
      />
      <EditTaskModal
        editingTask={editingTask} setEditingTask={setEditingTask}
        editTaskTitle={editTaskTitle} setEditTaskTitle={setEditTaskTitle}
        editTaskDesc={editTaskDesc} setEditTaskDesc={setEditTaskDesc}
        editTaskAssignee={editTaskAssignee} setEditTaskAssignee={setEditTaskAssignee}
        editTaskParticipantIds={editTaskParticipantIds} setEditTaskParticipantIds={setEditTaskParticipantIds}
        editTaskParentId={editTaskParentId} setEditTaskParentId={setEditTaskParentId}
        editTaskStatus={editTaskStatus} setEditTaskStatus={setEditTaskStatus}
        isEditingTask={isEditingTask} handleEditTask={handleEditTask}
        tasks={tasks}
        assigneeOptions={assigneeOptions} participantOptions={participantOptions}
      />
      <EditBugModal
        editingBug={editingBug} setEditingBug={setEditingBug}
        editBugTitle={editBugTitle} setEditBugTitle={setEditBugTitle}
        editBugDesc={editBugDesc} setEditBugDesc={setEditBugDesc}
        editBugSeverity={editBugSeverity} setEditBugSeverity={setEditBugSeverity}
        editBugStatus={editBugStatus} setEditBugStatus={setEditBugStatus}
        editBugAssignee={editBugAssignee} setEditBugAssignee={setEditBugAssignee}
        isEditingBug={isEditingBug} handleEditBug={handleEditBug}
        assigneeOptions={assigneeOptions}
      />
      <WorkLogModal
        showWorkLogModal={showWorkLogModal} setShowWorkLogModal={setShowWorkLogModal}
        workLogTarget={workLogTarget} setWorkLogTarget={setWorkLogTarget}
        workLogForm={workLogForm} setWorkLogForm={setWorkLogForm}
        isSubmittingWorkLog={isSubmittingWorkLog} handleWorkLogSubmit={handleWorkLogSubmit}
      />
      <AddMemberModal
        showAddMember={showAddMember} setShowAddMember={setShowAddMember}
        allUsers={allUsers} selectedUserId={selectedUserId} setSelectedUserId={setSelectedUserId}
        selectedRole={selectedRole} setSelectedRole={setSelectedRole}
        availableRoles={availableRoles}
        isAddingMember={isAddingMember} handleAddMember={handleAddMember}
      />
      <RequirementModals
        showAddReqModal={showAddReqModal} setShowAddReqModal={setShowAddReqModal}
        newReqTitle={newReqTitle} setNewReqTitle={setNewReqTitle}
        newReqDesc={newReqDesc} setNewReqDesc={setNewReqDesc}
        newReqPriority={newReqPriority} setNewReqPriority={setNewReqPriority}
        newReqAssignee={newReqAssignee} setNewReqAssignee={setNewReqAssignee}
        isAddingReq={isAddingReq} handleAddRequirement={handleAddRequirement}
        editingReq={editingReq} setEditingReq={setEditingReq}
        editReqTitle={editReqTitle} setEditReqTitle={setEditReqTitle}
        editReqDesc={editReqDesc} setEditReqDesc={setEditReqDesc}
        editReqPriority={editReqPriority} setEditReqPriority={setEditReqPriority}
        editReqStatus={editReqStatus} setEditReqStatus={setEditReqStatus}
        isEditingReq={isEditingReq} handleEditRequirement={handleEditRequirement}
        projectMembers={project?.members}
      />
    </div>
  )
}

// ── Add Member Modal ──────────────────────────────────────────────────────
function AddMemberModal({ showAddMember, setShowAddMember, allUsers, selectedUserId, setSelectedUserId, selectedRole, setSelectedRole, availableRoles, isAddingMember, handleAddMember }: any) {
  const [userSearch, setUserSearch] = useState('')
  const [isUserListOpen, setIsUserListOpen] = useState(false)

  useEffect(() => {
    if (showAddMember) {
      setUserSearch('')
      setIsUserListOpen(false)
    }
  }, [showAddMember])

  if (!showAddMember) return null

  const selectedUser = allUsers.find((u: User) => u.id === selectedUserId)
  const normalizedSearch = userSearch.trim().toLowerCase()
  const filteredUsers = normalizedSearch
    ? allUsers.filter((u: User) =>
        `${u.name} ${u.email}`.toLowerCase().includes(normalizedSearch)
      )
    : allUsers

  const chooseUser = (userId: string) => {
    setSelectedUserId(userId)
    setUserSearch('')
    setIsUserListOpen(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">新增項目成員</h2>
          <button onClick={() => setShowAddMember(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
        </div>
        <form onSubmit={handleAddMember} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">選擇用戶 *</label>
            <input type="hidden" value={selectedUserId} required />
            <div
              className="relative"
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                  setIsUserListOpen(false)
                }
              }}
            >
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={userSearch}
                onChange={(e) => {
                  setUserSearch(e.target.value)
                  setIsUserListOpen(true)
                }}
                onFocus={() => setIsUserListOpen(true)}
                className="input-field pl-9"
                placeholder={selectedUser ? `${selectedUser.name} (${selectedUser.email})` : '搜尋姓名或 Email'}
                autoComplete="off"
              />
              {isUserListOpen && (
                <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                  {filteredUsers.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-gray-500">找不到符合的用戶</div>
                  ) : (
                    filteredUsers.map((u: User) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => chooseUser(u.id)}
                        className={`flex w-full flex-col px-3 py-2 text-left text-sm transition-colors ${
                          selectedUserId === u.id
                            ? 'bg-primary-50 text-primary-700'
                            : 'text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <span className="font-medium">{u.name}</span>
                        <span className="text-xs text-gray-500">{u.email}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            {allUsers.length === 0 && <p className="text-xs text-gray-500 mt-1">所有用戶已在此項目中</p>}
            {selectedUser && <p className="text-xs text-gray-500 mt-1">已選擇：{selectedUser.name} ({selectedUser.email})</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">項目角色 *</label>
            <select value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)} className="input-field" required>
              <option value="">-- 選擇角色 --</option>
              {availableRoles.map((r: any) => (
                <option key={r.id} value={r.name}>{r.name}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-3 justify-end">
            <button type="button" onClick={() => setShowAddMember(false)} className="btn-secondary">取消</button>
            <button type="submit" disabled={isAddingMember || !selectedUserId || !selectedRole} className="btn-primary">{isAddingMember ? '添加中...' : '添加'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Members Tab Component ────────────────────────────────────────────────
function MembersTab({ project, canManageMembers, user, editingMemberId, setEditingMemberId, editingRole, setEditingRole, availableRoles, handleUpdateMemberRole, handleRemoveMember, openAddMember, showAddMember, setShowAddMember, allUsers, selectedUserId, setSelectedUserId, selectedRole, setSelectedRole, isAddingMember, handleAddMember, roleColor, roleLabel }: any) {
  if (!project) return null
  return (
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
          {project.members?.map((member: any) => (
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
                      {availableRoles.map((r: any) => (
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
  )
}

// ── Wiki Tab Component ───────────────────────────────────────────────────
function WikiTabComponent({ projectId }: { projectId: string }) {
  return <WikiTab projectId={projectId} />
}

// ── Attachments Tab Component ───────────────────────────────────────────
function AttachmentsTabComponent({ projectId }: { projectId: string }) {
  return <AttachmentsTab projectId={projectId} />
}

// ── Agent Monitoring Tab Component ──────────────────────────────────────
function AgentMonitoringTab({ id }: { id: string }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
          <AgentTasksList projectId={id} />
        </div>
      </div>
    </div>
  )
}

// ── Requirement Modals Component ───────────────────────────────────────
function RequirementModals({ showAddReqModal, setShowAddReqModal, newReqTitle, setNewReqTitle, newReqDesc, setNewReqDesc, newReqPriority, setNewReqPriority, newReqAssignee, setNewReqAssignee, isAddingReq, handleAddRequirement, editingReq, setEditingReq, editReqTitle, setEditReqTitle, editReqDesc, setEditReqDesc, editReqPriority, setEditReqPriority, editReqStatus, setEditReqStatus, isEditingReq, handleEditRequirement, projectMembers }: any) {
  return (
    <>
      {showAddReqModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">新建需求</h2>
              <button onClick={() => setShowAddReqModal(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>
            <form onSubmit={handleAddRequirement} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">需求標題 *</label>
                <input type="text" value={newReqTitle} onChange={(e) => setNewReqTitle(e.target.value)} className="input-field w-full" placeholder="例如：用戶登入功能" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
                <RichTextEditor value={newReqDesc} onChange={setNewReqDesc} placeholder="需求的詳細描述..." rows={6} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">優先級</label>
                  <select value={newReqPriority} onChange={(e) => setNewReqPriority(e.target.value)} className="input-field w-full">
                    <option value="high">優先</option>
                    <option value="medium">中等</option>
                    <option value="low">較低</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">負責人</label>
                  <select value={newReqAssignee} onChange={(e) => setNewReqAssignee(e.target.value)} className="input-field w-full">
                    <option value="">-- 不指定 --</option>
                    {projectMembers?.map((m: any) => (
                      <option key={m.user.id} value={m.user.id}>{m.user.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setShowAddReqModal(false)} className="btn-secondary">取消</button>
                <button type="submit" disabled={isAddingReq} className="btn-primary">{isAddingReq ? '建立中...' : '建立需求'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingReq && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">編輯需求</h2>
              <button onClick={() => setEditingReq(null)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>
            <form onSubmit={handleEditRequirement} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">需求標題 *</label>
                <input type="text" value={editReqTitle} onChange={(e) => setEditReqTitle(e.target.value)} className="input-field w-full" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
                <RichTextEditor value={editReqDesc} onChange={setEditReqDesc} rows={6} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">優先級</label>
                  <select value={editReqPriority} onChange={(e) => setEditReqPriority(e.target.value)} className="input-field w-full">
                    <option value="high">優先</option>
                    <option value="medium">中等</option>
                    <option value="low">較低</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">狀態</label>
                  <select value={editReqStatus} onChange={(e) => setEditReqStatus(e.target.value)} className="input-field w-full">
                    <option value="pending">待處理</option>
                    <option value="in_progress">進行中</option>
                    <option value="completed">已完成</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setEditingReq(null)} className="btn-secondary">取消</button>
                <button type="submit" disabled={isEditingReq} className="btn-primary">{isEditingReq ? '保存中...' : '保存'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
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

// ── Add Bug Modal ──────────────────────────────────────────────────────
function AddBugModal({ showAddBugModal, setShowAddBugModal, newBugTitle, setNewBugTitle, newBugDesc, setNewBugDesc, newBugSeverity, setNewBugSeverity, newBugAssignee, setNewBugAssignee, isAddingBug, handleAddBug, assigneeOptions }: any) {
  if (!showAddBugModal) return null
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">新建缺陷</h2>
          <button onClick={() => setShowAddBugModal(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
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
              {assigneeOptions.map((m: MemberOption) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setShowAddBugModal(false)} className="btn-secondary">取消</button>
            <button type="submit" disabled={isAddingBug} className="btn-primary">
              {isAddingBug ? '建立中...' : '建立缺陷'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Edit Task Modal ──────────────────────────────────────────────────────
function EditTaskModal({ editingTask, setEditingTask, editTaskTitle, setEditTaskTitle, editTaskDesc, setEditTaskDesc, editTaskAssignee, setEditTaskAssignee, editTaskParticipantIds, setEditTaskParticipantIds, editTaskParentId, setEditTaskParentId, editTaskStatus, setEditTaskStatus, isEditingTask, handleEditTask, tasks, assigneeOptions, participantOptions }: any) {
  if (!editingTask) return null
  return (
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
                {assigneeOptions.map((m: MemberOption) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
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
                {tasks?.filter((task: Task) => task.id !== editingTask.id).map((task: Task) => (
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
  )
}

// ── Edit Bug Modal ──────────────────────────────────────────────────────
function EditBugModal({ editingBug, setEditingBug, editBugTitle, setEditBugTitle, editBugDesc, setEditBugDesc, editBugSeverity, setEditBugSeverity, editBugStatus, setEditBugStatus, editBugAssignee, setEditBugAssignee, isEditingBug, handleEditBug, assigneeOptions }: any) {
  if (!editingBug) return null
  return (
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
                {assigneeOptions.map((m: MemberOption) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
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
  )
}

// ── Work Log Modal ──────────────────────────────────────────────────────
function WorkLogModal({ showWorkLogModal, setShowWorkLogModal, workLogTarget, setWorkLogTarget, workLogForm, setWorkLogForm, isSubmittingWorkLog, handleWorkLogSubmit }: any) {
  if (!showWorkLogModal || !workLogTarget) return null
  return (
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
  )
}
