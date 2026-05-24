import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { CheckCircle, Clock, ListTodo, PlayCircle } from 'lucide-react'
import { taskApi, workLogApi } from '../utils/api'
import { useAuth } from '../context/AuthContext'
import type { Task } from '../types'
import clsx from 'clsx'

type TaskFilter = 'all' | 'pending' | 'in_progress' | 'completed'
type TaskStatus = Task['status']

const statusFlow: Partial<Record<TaskStatus, TaskStatus>> = {
  pending: 'in_progress',
  in_progress: 'completed',
  testing: 'completed',
}

export default function MyTasksPage() {
  const { user } = useAuth()
  const [tasks, setTasks] = useState<Task[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filter, setFilter] = useState<TaskFilter>('all')
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [workLogTask, setWorkLogTask] = useState<Task | null>(null)
  const [workLogForm, setWorkLogForm] = useState({
    hours: '',
    workDate: new Date().toISOString().split('T')[0],
    note: '',
  })
  const [isSubmittingLog, setIsSubmittingLog] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    if (user?.id) loadTasks()
  }, [user?.id])

  const loadTasks = async () => {
    setIsLoading(true)
    setError('')
    try {
      const response = await taskApi.list({ assigneeId: user?.id })
      setTasks(response.data.tasks || [])
    } catch (err) {
      console.error('Failed to load tasks:', err)
      setError('載入任務失敗，請稍後再試')
    } finally {
      setIsLoading(false)
    }
  }

  const filteredTasks = tasks.filter(task => {
    if (filter === 'all') return true
    return task.status === filter
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-700'
      case 'in_progress': return 'bg-blue-100 text-blue-700'
      case 'testing': return 'bg-purple-100 text-purple-700'
      case 'completed': return 'bg-green-100 text-green-700'
      default: return 'bg-gray-100 text-gray-600'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending': return '待處理'
      case 'in_progress': return '進行中'
      case 'testing': return '測試中'
      case 'completed': return '已完成'
      default: return status
    }
  }

  const handleUpdateStatus = async (task: Task) => {
    const nextStatus = statusFlow[task.status]
    if (!nextStatus) return

    setUpdatingId(task.id)
    setError('')
    setSuccess('')
    try {
      await taskApi.updateStatus(task.id, nextStatus)
      setTasks(prev => prev.map(item => item.id === task.id ? { ...item, status: nextStatus } : item))
      setSuccess(`「${task.title}」已更新為${getStatusLabel(nextStatus)}`)
    } catch (err) {
      console.error('Failed to update task status:', err)
      setError('更新任務狀態失敗')
    } finally {
      setUpdatingId(null)
    }
  }

  const openWorkLogModal = (task: Task) => {
    setWorkLogTask(task)
    setWorkLogForm({
      hours: '',
      workDate: new Date().toISOString().split('T')[0],
      note: '',
    })
    setError('')
    setSuccess('')
  }

  const handleSubmitWorkLog = async (e: FormEvent) => {
    e.preventDefault()
    if (!workLogTask) return

    const hours = parseFloat(String(workLogForm.hours).trim())
    if (Number.isNaN(hours) || hours <= 0 || hours > 24) {
      setError('請輸入 0.01 到 24 之間的工作時數')
      return
    }

    setIsSubmittingLog(true)
    setError('')
    try {
      await workLogApi.create({
        taskId: workLogTask.id,
        hours: Number(hours),
        workDate: workLogForm.workDate,
        note: workLogForm.note || undefined,
      })
      setWorkLogTask(null)
      setSuccess(`已為「${workLogTask.title}」登記 ${hours} 小時`)
      loadTasks()
    } catch (err) {
      console.error('Failed to create work log:', err)
      setError('登記工作時數失敗')
    } finally {
      setIsSubmittingLog(false)
    }
  }

  const totalLoggedHours = (task: Task) => {
    return (task.workLogs || []).reduce((sum, log) => sum + Number(log.hours), 0)
  }

  return (
    <div>
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6 lg:mb-8">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">我的任務</h1>
          <p className="text-gray-500 mt-1">顯示目前指派給您的任務，共 {tasks.length} 個</p>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {(['all', 'pending', 'in_progress', 'completed'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={clsx(
                'px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap',
                filter === f ? 'bg-primary-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              )}
            >
              {f === 'all' ? '全部' : getStatusLabel(f)}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 border border-red-100 text-red-700 px-4 py-3 text-sm">{error}</div>}
      {success && <div className="mb-4 rounded-lg bg-green-50 border border-green-100 text-green-700 px-4 py-3 text-sm">{success}</div>}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500"></div>
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="card p-8 sm:p-12 text-center">
          <ListTodo size={48} className="mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">暫無任務</h3>
          <p className="text-gray-500">目前沒有符合條件的指派任務</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredTasks.map((task) => {
            const nextStatus = statusFlow[task.status]
            const loggedHours = totalLoggedHours(task)

            return (
              <div key={task.id} className="card p-4 sm:p-6">
                <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-3 mb-2">
                      {task.status === 'completed' ? (
                        <CheckCircle size={20} className="text-green-500 mt-0.5 flex-shrink-0" />
                      ) : (
                        <ListTodo size={20} className="text-gray-400 mt-0.5 flex-shrink-0" />
                      )}
                      <div className="min-w-0">
                        <h3 className={clsx(
                          'font-semibold text-gray-900 break-words',
                          task.status === 'completed' && 'line-through text-gray-500'
                        )}>
                          {task.title}
                        </h3>
                        {task.assignee && (
                          <p className="text-xs text-gray-400 mt-1">負責人：{task.assignee.name}</p>
                        )}
                      </div>
                    </div>
                    <p className="text-gray-500 text-sm mb-3 break-words">{task.description || '暫無描述'}</p>
                    <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-sm">
                      <span className={`badge ${getStatusColor(task.status)}`}>
                        {getStatusLabel(task.status)}
                      </span>
                      {task.estimatedHours !== undefined && task.estimatedHours !== null && (
                        <span className="text-gray-500 flex items-center gap-1">
                          <Clock size={14} /> 預估 {Number(task.estimatedHours).toFixed(1)} 小時
                        </span>
                      )}
                      <span className="text-gray-500">已登記 {loggedHours.toFixed(1)} 小時</span>
                    </div>
                    {task.requirements && task.requirements.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {task.requirements.map((r) => (
                          <span key={r.requirement.id} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                            {r.requirement.title}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col sm:flex-row xl:flex-col gap-2 w-full sm:w-auto">
                    {nextStatus && (
                      <button
                        onClick={() => handleUpdateStatus(task)}
                        disabled={updatingId === task.id}
                        className="btn-primary flex items-center justify-center gap-2 text-sm px-4 py-2 w-full sm:w-auto"
                      >
                        <PlayCircle size={16} />
                        {updatingId === task.id ? '更新中...' : `標記為${getStatusLabel(nextStatus)}`}
                      </button>
                    )}
                    <button
                      onClick={() => openWorkLogModal(task)}
                      className="btn-secondary flex items-center justify-center gap-2 text-sm px-4 py-2 w-full sm:w-auto"
                    >
                      <Clock size={16} />
                      登記時數
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {workLogTask && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-5 sm:p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-1">登記工作時數</h2>
            <p className="text-sm text-gray-500 mb-4 break-words">任務：{workLogTask.title}</p>
            <form onSubmit={handleSubmitWorkLog} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">日期 *</label>
                <input
                  type="date"
                  value={workLogForm.workDate}
                  onChange={(e) => setWorkLogForm({ ...workLogForm, workDate: e.target.value })}
                  className="input-field"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">工作時數 *</label>
                <input
                  type="number"
                  max="24"
                  value={workLogForm.hours}
                  onChange={(e) => setWorkLogForm({ ...workLogForm, hours: e.target.value })}
                  className="input-field"
                  placeholder="例如：2.5"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
                <textarea
                  value={workLogForm.note}
                  onChange={(e) => setWorkLogForm({ ...workLogForm, note: e.target.value })}
                  className="input-field"
                  rows={3}
                  placeholder="說明完成的工作內容..."
                />
              </div>
              <div className="flex flex-col sm:flex-row gap-3 sm:justify-end pt-2">
                <button type="button" onClick={() => setWorkLogTask(null)} className="btn-secondary order-2 sm:order-1">
                  取消
                </button>
                <button type="submit" disabled={isSubmittingLog} className="btn-primary order-1 sm:order-2">
                  {isSubmittingLog ? '保存中...' : '保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}