import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Plus, X, Bot } from 'lucide-react'
import clsx from 'clsx'

const LANES = [
  { id: 'backlog', label: '📋 Backlog', color: 'bg-gray-100' },
  { id: 'in_progress', label: '📝 In Progress', color: 'bg-blue-50' },
  { id: 'in_review', label: '🔍 In Review', color: 'bg-yellow-50' },
  { id: 'done', label: '✅ Done', color: 'bg-green-50' },
]

const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-green-100 text-green-700',
}

interface Task {
  id: string
  title: string
  description?: string
  lane: string
  status: string
  assigneeId?: string
  assigneeType?: string
  assignee?: { id: string; name: string }
  dueDate?: string
  priority?: string
  estimatedHours?: number
  workLogs?: { id: string; hours: number }[]
}

interface Worker {
  workerType: 'user' | 'agent'
  workerId: string
  name: string
  role?: string
  model?: string
  status?: string
}

export default function ProjectKanbanPage() {
  const { id: projectId } = useParams<{ id: string }>()
  const [tasks, setTasks] = useState<Task[]>([])
  const [workers, setWorkers] = useState<Worker[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showAddTask, setShowAddTask] = useState(false)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [newTaskLane, setNewTaskLane] = useState('backlog')
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskDesc, setNewTaskDesc] = useState('')
  const [newTaskAssigneeId, setNewTaskAssigneeId] = useState('')
  const [newTaskAssigneeType, setNewTaskAssigneeType] = useState<'user' | 'agent'>('user')
  const [newTaskPriority, setNewTaskPriority] = useState('medium')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (projectId) {
      loadData()
    }
  }, [projectId])

  const loadData = async () => {
    setIsLoading(true)
    try {
      const token = localStorage.getItem('token')
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

      const [tasksRes, membersRes] = await Promise.all([
        fetch(`/api/tasks?projectId=${projectId}`, { headers }),
        fetch(`/api/projects/${projectId}/agents`, { headers })
      ])

      const tasksData = await tasksRes.json()
      const membersData = await membersRes.json()

      setTasks(tasksData.tasks || [])
      setWorkers([
        ...(membersData.members || []).map((m: any) => ({ ...m, workerType: 'user' as const })),
        ...(membersData.agents || []).map((a: any) => ({ ...a, workerType: 'agent' as const }))
      ])
    } catch (err) {
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTaskTitle.trim()) return
    setIsSubmitting(true)
    try {
      const token = localStorage.getItem('token')
      await fetch('/api/tasks', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTaskTitle,
          description: newTaskDesc,
          projectId,
          lane: newTaskLane,
          assigneeId: newTaskAssigneeId || undefined,
          assigneeType: newTaskAssigneeType,
          priority: newTaskPriority,
          status: 'pending'
        })
      })
      setShowAddTask(false)
      setNewTaskTitle('')
      setNewTaskDesc('')
      setNewTaskLane('backlog')
      setNewTaskAssigneeId('')
      setNewTaskPriority('medium')
      loadData()
    } catch (err) {
      console.error(err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleMoveTask = async (taskId: string, newLane: string) => {
    try {
      const token = localStorage.getItem('token')
      const statusMap: Record<string, string> = {
        backlog: 'pending',
        in_progress: 'in_progress',
        in_review: 'in_progress',
        done: 'completed'
      }
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ lane: newLane, status: statusMap[newLane] || 'pending' })
      })
      loadData()
    } catch (err) {
      console.error(err)
    }
  }

  const handleAssignTask = async (taskId: string, assigneeId: string, assigneeType: 'user' | 'agent') => {
    try {
      const token = localStorage.getItem('token')
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigneeId, assigneeType })
      })
      setSelectedTask(null)
      loadData()
    } catch (err) {
      console.error(err)
    }
  }

  const tasksByLane = LANES.reduce((acc, lane) => {
    acc[lane.id] = tasks.filter(t => t.lane === lane.id)
    return acc
  }, {} as Record<string, Task[]>)

  if (isLoading) {
    return <div className="p-8 text-center text-gray-500">載入中...</div>
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kanban 面板</h1>
          <p className="text-gray-500 text-sm">拖動或點擊任務卡改變狀態</p>
        </div>
        <button
          onClick={() => setShowAddTask(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 text-sm font-medium"
        >
          <Plus size={16} />
          新建任務
        </button>
      </div>

      {/* Board */}
      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-4 min-w-max pb-4">
          {LANES.map(lane => (
            <div key={lane.id} className={clsx('w-72 flex-shrink-0 rounded-xl flex flex-col', lane.color)}>
              <div className="px-3 py-3 flex items-center justify-between">
                <h3 className="font-semibold text-gray-700 text-sm">{lane.label}</h3>
                <span className="text-xs text-gray-400 font-medium">{tasksByLane[lane.id]?.length || 0}</span>
              </div>
              <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2">
                {tasksByLane[lane.id]?.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    workers={workers}
                    onClick={() => setSelectedTask(task)}
                  />
                ))}
                {tasksByLane[lane.id]?.length === 0 && (
                  <div className="text-center text-gray-300 text-xs py-8">暫無任務</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add Task Modal */}
      {showAddTask && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">新建任務</h2>
              <button onClick={() => setShowAddTask(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>
            <form onSubmit={handleCreateTask} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">任務標題 *</label>
                <input
                  type="text"
                  value={newTaskTitle}
                  onChange={e => setNewTaskTitle(e.target.value)}
                  className="input-field"
                  placeholder="例如：完成用戶登入頁面"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
                <textarea
                  value={newTaskDesc}
                  onChange={e => setNewTaskDesc(e.target.value)}
                  className="input-field"
                  rows={3}
                  placeholder="任務詳細描述..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">-lane</label>
                <select
                  value={newTaskLane}
                  onChange={e => setNewTaskLane(e.target.value)}
                  className="input-field"
                >
                  {LANES.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">指派給</label>
                <select
                  value={`${newTaskAssigneeType}:${newTaskAssigneeId}`}
                  onChange={e => {
                    const [type, id] = e.target.value.split(':')
                    setNewTaskAssigneeType(type as 'user' | 'agent')
                    setNewTaskAssigneeId(id)
                  }}
                  className="input-field"
                >
                  <option value="">未指派</option>
                  <optgroup label="👤 人員">
                    {workers.filter(w => w.workerType === 'user').map(w => (
                      <option key={`user:${w.workerId}`} value={`user:${w.workerId}`}>{w.name}</option>
                    ))}
                  </optgroup>
                  <optgroup label="🤖 AI Agent">
                    {workers.filter(w => w.workerType === 'agent').map(w => (
                      <option key={`agent:${w.workerId}`} value={`agent:${w.workerId}`}>{w.name} ({w.model})</option>
                    ))}
                  </optgroup>
                </select>
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setShowAddTask(false)} className="btn-secondary">取消</button>
                <button type="submit" disabled={isSubmitting} className="btn-primary">{isSubmitting ? '創建中...' : '創建'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Task Detail Modal */}
      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          workers={workers}
          onClose={() => setSelectedTask(null)}
          onMoveLane={(newLane) => handleMoveTask(selectedTask.id, newLane)}
          onAssign={(assigneeId, assigneeType) => handleAssignTask(selectedTask.id, assigneeId, assigneeType)}
        />
      )}
    </div>
  )
}

// ── Task Card ──────────────────────────────────────────────────────────────────
function TaskCard({
  task, workers, onClick
}: {
  task: Task
  workers: Worker[]
  onClick: () => void
}) {
  const assignee = task.assigneeId
    ? workers.find(w => w.workerId === task.assigneeId && w.workerType === (task.assigneeType || 'user'))
    : null

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-3 cursor-pointer hover:shadow-md transition-shadow relative"
      onClick={onClick}
    >
      {task.priority && (
        <span className={clsx('inline-block text-xs px-2 py-0.5 rounded mb-2', PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium)}>
          {task.priority === 'high' ? '🔴 高' : task.priority === 'medium' ? '🟡 中' : '🟢 低'}
        </span>
      )}
      <p className="text-sm font-medium text-gray-800 leading-snug">{task.title}</p>

      {/* Assignee */}
      <div className="mt-2 flex items-center gap-1.5">
        {assignee ? (
          <div className={clsx('flex items-center gap-1 text-xs px-2 py-1 rounded-full',
            assignee.workerType === 'agent' ? 'bg-purple-50 text-purple-600' : 'bg-gray-50 text-gray-600'
          )}>
            {assignee.workerType === 'agent' ? <Bot size={12} /> : <span>👤</span>}
            <span className="truncate max-w-[100px]">{assignee.name}</span>
          </div>
        ) : (
          <span className="text-xs text-gray-300">未指派</span>
        )}
      </div>

      {/* Work log indicator */}
      {task.workLogs && task.workLogs.length > 0 && (
        <div className="mt-1 text-xs text-gray-400">
          📊 {task.workLogs.length} 條記錄
        </div>
      )}
    </div>
  )
}

// ── Task Detail Modal ──────────────────────────────────────────────────────────
function TaskDetailModal({
  task, workers, onClose, onMoveLane, onAssign
}: {
  task: Task
  workers: Worker[]
  onClose: () => void
  onMoveLane: (lane: string) => void
  onAssign: (assigneeId: string, assigneeType: 'user' | 'agent') => void
}) {
  const assignee = task.assigneeId
    ? workers.find(w => w.workerId === task.assigneeId && w.workerType === (task.assigneeType || 'user'))
    : null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">任務詳情</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
        </div>

        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold">{task.title}</h3>
            {task.description && <p className="text-gray-600 text-sm mt-1">{task.description}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">狀態</span>
              <select
                value={task.lane}
                onChange={e => onMoveLane(e.target.value)}
                className="input-field mt-1"
              >
                {LANES.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
              </select>
            </div>
            <div>
              <span className="text-gray-500">指派給</span>
              <select
                value={`${task.assigneeType || 'user'}:${task.assigneeId || ''}`}
                onChange={e => {
                  const [type, id] = e.target.value.split(':')
                  if (id) onAssign(id, type as 'user' | 'agent')
                }}
                className="input-field mt-1"
              >
                <option value="">未指派</option>
                <optgroup label="👤 人員">
                  {workers.filter(w => w.workerType === 'user').map(w => (
                    <option key={`user:${w.workerId}`} value={`user:${w.workerId}`}>{w.name}</option>
                  ))}
                </optgroup>
                <optgroup label="🤖 AI Agent">
                  {workers.filter(w => w.workerType === 'agent').map(w => (
                    <option key={`agent:${w.workerId}`} value={`agent:${w.workerId}`}>{w.name}</option>
                  ))}
                </optgroup>
              </select>
            </div>
          </div>

          {assignee && (
            <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
              {assignee.workerType === 'agent' ? (
                <>
                  <Bot size={18} className="text-purple-500" />
                  <div>
                    <p className="text-sm font-medium">{assignee.name}</p>
                    <p className="text-xs text-gray-400">🤖 AI Agent · {assignee.model}</p>
                  </div>
                </>
              ) : (
                <>
                  <span className="text-lg">👤</span>
                  <div>
                    <p className="text-sm font-medium">{assignee.name}</p>
                    <p className="text-xs text-gray-400">{assignee.role}</p>
                  </div>
                </>
              )}
            </div>
          )}

          {task.dueDate && (
            <div className="text-sm text-gray-500">
              ⏰ 截止日期：{new Date(task.dueDate).toLocaleDateString('zh-TW')}
            </div>
          )}
        </div>

        <div className="flex justify-end mt-6">
          <button onClick={onClose} className="btn-primary">關閉</button>
        </div>
      </div>
    </div>
  )
}