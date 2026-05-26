import { useState, useEffect } from 'react'
import { Plus, Grip, Bot, User, X } from 'lucide-react'
import { requirementApi, taskApi, projectApi } from '../utils/api'
import type { Requirement, Task } from '../types'

interface ProjectKanbanProps {
  projectId: string
}

interface TaskCard {
  id: string
  title: string
  status: string
  assignee?: { id: string; name: string; isAgent?: boolean }
}

interface RequirementColumn {
  requirement: Requirement
  tasks: {
    pending: TaskCard[]
    in_progress: TaskCard[]
    completed: TaskCard[]
  }
}

interface MemberOption {
  id: string
  name: string
  email: string
}

export default function ProjectKanban({ projectId }: ProjectKanbanProps) {
  const [loading, setLoading] = useState(true)
  const [columns, setColumns] = useState<RequirementColumn[]>([])
  const [error, setError] = useState<string | null>(null)
  const [draggedTask, setDraggedTask] = useState<{ taskId: string; fromStatus: string; fromReqId: string } | null>(null)
  const [showAddTaskModal, setShowAddTaskModal] = useState(false)
  const [selectedRequirement, setSelectedRequirement] = useState<string | null>(null)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskDesc, setNewTaskDesc] = useState('')
  const [newTaskAssignee, setNewTaskAssignee] = useState('')
  const [members, setMembers] = useState<MemberOption[]>([])
  const [isAddingTask, setIsAddingTask] = useState(false)

  useEffect(() => {
    loadData()
  }, [projectId])

  const loadData = async () => {
    try {
      setLoading(true)
      setError(null)

      // Load requirements and tasks
      const [reqResponse, taskResponse, membersResponse] = await Promise.all([
        requirementApi.list(projectId),
        taskApi.list({ projectId }),
        projectApi.getMembers(projectId)
      ])

      const requirements = reqResponse.data.requirements || []
      const tasks = taskResponse.data.tasks || []
      const membersData = membersResponse.data.members || []

      setMembers(membersData.map((m: any) => ({ id: m.user.id, name: m.user.name, email: m.user.email })))

      // Group tasks by requirement and status
      const columnsData: RequirementColumn[] = requirements.map((req: Requirement) => ({
        requirement: req,
        tasks: {
          pending: tasks
            .filter((t: Task) =>
              t.requirements?.some((tr) => tr.requirement.id === req.id) &&
              t.status === 'pending'
            )
            .map((t: Task) => ({
              id: t.id,
              title: t.title,
              status: t.status,
              assignee: t.assignee ? {
                id: t.assignee.id,
                name: t.assignee.name,
                isAgent: t.assignee.isAgent
              } : undefined
            })),
          in_progress: tasks
            .filter((t: Task) =>
              t.requirements?.some((tr) => tr.requirement.id === req.id) &&
              t.status === 'in_progress'
            )
            .map((t: Task) => ({
              id: t.id,
              title: t.title,
              status: t.status,
              assignee: t.assignee ? {
                id: t.assignee.id,
                name: t.assignee.name,
                isAgent: t.assignee.isAgent
              } : undefined
            })),
          completed: tasks
            .filter((t: Task) =>
              t.requirements?.some((tr) => tr.requirement.id === req.id) &&
              t.status === 'completed'
            )
            .map((t: Task) => ({
              id: t.id,
              title: t.title,
              status: t.status,
              assignee: t.assignee ? {
                id: t.assignee.id,
                name: t.assignee.name,
                isAgent: t.assignee.isAgent
              } : undefined
            }))
        }
      }))

      setColumns(columnsData)
    } catch (err) {
      console.error('Failed to load kanban data:', err)
      setError('載入看板失敗')
    } finally {
      setLoading(false)
    }
  }

  const handleDragStart = (e: React.DragEvent, taskId: string, status: string, reqId: string) => {
    setDraggedTask({ taskId, fromStatus: status, fromReqId: reqId })
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = async (e: React.DragEvent, toStatus: string, _toReqId: string) => {
    e.preventDefault()

    if (!draggedTask) return

    // Update task status
    try {
      await taskApi.updateStatus(draggedTask.taskId, toStatus)
      // Refresh data
      loadData()
    } catch (err) {
      console.error('Failed to update task status:', err)
    }

    setDraggedTask(null)
  }

  const handleAddTask = async () => {
    if (!newTaskTitle.trim() || !selectedRequirement) return

    try {
      setIsAddingTask(true)
      await taskApi.create({
        title: newTaskTitle,
        description: newTaskDesc || undefined,
        assigneeId: newTaskAssignee || undefined,
        requirementIds: [selectedRequirement],
        projectId
      })
      setNewTaskTitle('')
      setNewTaskDesc('')
      setNewTaskAssignee('')
      setSelectedRequirement(null)
      setShowAddTaskModal(false)
      loadData()
    } catch (err) {
      console.error('Failed to create task:', err)
    } finally {
      setIsAddingTask(false)
    }
  }

  const openAddTaskModal = (reqId: string) => {
    setSelectedRequirement(reqId)
    setShowAddTaskModal(true)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-gray-100 border-gray-300'
      case 'in_progress':
        return 'bg-blue-50 border-blue-300'
      case 'completed':
        return 'bg-green-50 border-green-300'
      default:
        return 'bg-gray-100 border-gray-300'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500">{error}</p>
        <button onClick={loadData} className="mt-2 text-blue-600 hover:underline">
          重試
        </button>
      </div>
    )
  }

  return (
    <div className="h-full">
      {/* Kanban Board */}
      <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: 'calc(100vh - 200px)' }}>
        {columns.map((col) => (
          <div
            key={col.requirement.id}
            className="flex-shrink-0 w-80 bg-gray-100 rounded-lg p-3"
          >
            {/* Requirement Header */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-sm truncate">{col.requirement.title}</h3>
                <span className={`px-2 py-0.5 rounded text-xs ${col.requirement.status === 'completed' ? 'bg-green-100 text-green-700' : col.requirement.status === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-600'}`}>
                  {col.requirement.status}
                </span>
              </div>
              <button
                onClick={() => openAddTaskModal(col.requirement.id)}
                className="w-full py-1.5 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors flex items-center justify-center gap-1"
              >
                <Plus className="w-4 h-4" />
                新增任務
              </button>
            </div>

            {/* Status Columns */}
            <div className="space-y-3">
              {/* Pending Column */}
              <div
                className={`${getStatusColor('pending')} border rounded-lg p-2 min-h-[100px]`}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, 'pending', col.requirement.id)}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-500">待處理</span>
                  <span className="text-xs bg-gray-200 px-1.5 rounded">{col.tasks.pending.length}</span>
                </div>
                <div className="space-y-2">
                  {col.tasks.pending.map((task) => (
                    <KanbanCard
                      key={task.id}
                      task={task}
                      onDragStart={(e) => handleDragStart(e, task.id, 'pending', col.requirement.id)}
                      isDragging={draggedTask?.taskId === task.id}
                    />
                  ))}
                </div>
              </div>

              {/* In Progress Column */}
              <div
                className={`${getStatusColor('in_progress')} border rounded-lg p-2 min-h-[100px]`}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, 'in_progress', col.requirement.id)}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-blue-600">進行中</span>
                  <span className="text-xs bg-blue-200 px-1.5 rounded">{col.tasks.in_progress.length}</span>
                </div>
                <div className="space-y-2">
                  {col.tasks.in_progress.map((task) => (
                    <KanbanCard
                      key={task.id}
                      task={task}
                      onDragStart={(e) => handleDragStart(e, task.id, 'in_progress', col.requirement.id)}
                      isDragging={draggedTask?.taskId === task.id}
                    />
                  ))}
                </div>
              </div>

              {/* Completed Column */}
              <div
                className={`${getStatusColor('completed')} border rounded-lg p-2 min-h-[100px]`}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, 'completed', col.requirement.id)}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-green-600">完成</span>
                  <span className="text-xs bg-green-200 px-1.5 rounded">{col.tasks.completed.length}</span>
                </div>
                <div className="space-y-2">
                  {col.tasks.completed.map((task) => (
                    <KanbanCard
                      key={task.id}
                      task={task}
                      onDragStart={(e) => handleDragStart(e, task.id, 'completed', col.requirement.id)}
                      isDragging={draggedTask?.taskId === task.id}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}

        {columns.length === 0 && (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            暫無需求，請先新增需求
          </div>
        )}
      </div>

      {/* Add Task Modal */}
      {showAddTaskModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">新建任務</h2>
              <button onClick={() => setShowAddTaskModal(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); handleAddTask() }} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">標題 *</label>
                <input
                  type="text"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="輸入任務標題"
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
                <textarea
                  value={newTaskDesc}
                  onChange={(e) => setNewTaskDesc(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="輸入任務描述"
                  rows={4}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">負責人</label>
                <select
                  value={newTaskAssignee}
                  onChange={(e) => setNewTaskAssignee(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- 不指定 --</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>{m.name} ({m.email})</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddTaskModal(false)
                    setNewTaskTitle('')
                    setNewTaskDesc('')
                    setNewTaskAssignee('')
                    setSelectedRequirement(null)
                  }}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={!newTaskTitle.trim() || isAddingTask}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {isAddingTask ? '建立中...' : '建立任務'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// Kanban Task Card Component
interface KanbanCardProps {
  task: TaskCard
  onDragStart: (e: React.DragEvent) => void
  isDragging: boolean
}

function KanbanCard({ task, onDragStart, isDragging }: KanbanCardProps) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      className={`bg-white rounded-lg shadow-sm p-3 cursor-move hover:shadow-md transition-shadow ${
        isDragging ? 'opacity-50' : ''
      }`}
    >
      <div className="flex items-start gap-2">
        <Grip className="w-4 h-4 text-gray-300 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{task.title}</p>
          {task.assignee && (
            <div className="flex items-center gap-1 mt-2">
              {task.assignee.isAgent ? (
                <div className="flex items-center gap-1 bg-purple-100 px-2 py-0.5 rounded text-xs text-purple-700">
                  <Bot className="w-3 h-3" />
                  <span>{task.assignee.name}</span>
                </div>
              ) : (
                <div className="flex items-center gap-1 bg-gray-100 px-2 py-0.5 rounded text-xs text-gray-600">
                  <User className="w-3 h-3" />
                  <span>{task.assignee.name}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}