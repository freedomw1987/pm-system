import { useEffect, useState } from 'react'
import { Clock, Plus, Calendar, Edit2, Trash2, X, Check, Download } from 'lucide-react'
import { workLogApi, projectApi, taskApi, bugApi, userApi } from '../utils/api'
import type { WorkLog } from '../types'
import * as XLSX from 'xlsx'

interface ProjectOption { id: string; name: string }
interface TaskOption { id: string; title: string; requirementTitle?: string }
interface BugOption { id: string; title: string; requirementTitle?: string }

export default function WorkLogsPage() {
  const [workLogs, setWorkLogs] = useState<WorkLog[]>([])
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [tasks, setTasks] = useState<TaskOption[]>([])
  const [bugs, setBugs] = useState<BugOption[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  // Filter state
  const [filterProject, setFilterProject] = useState('')
  const [filterUser, setFilterUser] = useState('')
  const [users, setUsers] = useState<{ id: string; name: string }[]>([])
  const [filteredLogs, setFilteredLogs] = useState<WorkLog[]>([])
  const [formData, setFormData] = useState({
    projectId: '',
    taskId: '',
    bugId: '',
    hours: '',
    workDate: new Date().toISOString().split('T')[0],
    note: ''
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ hours: '', workDate: '', note: '' })

  useEffect(() => {
    loadProjects()
    loadUsers()
    loadData()
  }, [])

  // Apply filters when workLogs or filter values change
  useEffect(() => {
    let result = workLogs
    if (filterProject) {
      result = result.filter(log =>
        log.task?.project?.id === filterProject || log.bug?.project?.id === filterProject
      )
    }
    if (filterUser) {
      result = result.filter(log => log.user?.id === filterUser)
    }
    setFilteredLogs(result)
  }, [workLogs, filterProject, filterUser])

  const loadProjects = async () => {
    try {
      const res = await projectApi.list()
      setProjects(res.data.projects || [])
    } catch (err) {
      console.error('Failed to load projects:', err)
    }
  }

  const loadUsers = async () => {
    try {
      const res = await userApi.list()
      setUsers(res.data.users || [])
    } catch (err) {
      console.error('Failed to load users:', err)
    }
  }

  const loadData = async () => {
    try {
      const logsRes = await workLogApi.list()
      setWorkLogs(logsRes.data.workLogs || [])
    } catch (err) {
      console.error('Failed to load data:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const loadTasksAndBugs = async (projectId: string) => {
    if (!projectId) {
      setTasks([])
      setBugs([])
      return
    }
    try {
      const [tasksRes, bugsRes] = await Promise.all([
        taskApi.list({ projectId }),
        bugApi.list({ projectId })
      ])
      setTasks(tasksRes.data.tasks || [])
      setBugs(bugsRes.data.bugs || [])
    } catch (err) {
      console.error('Failed to load tasks/bugs:', err)
    }
  }

  const handleProjectChange = (projectId: string) => {
    setFormData({ ...formData, projectId, taskId: '', bugId: '' })
    loadTasksAndBugs(projectId)
  }

  const [workLogType, setWorkLogType] = useState<'task' | 'bug' | ''>('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      const payload: any = {
        hours: parseFloat(formData.hours),
        workDate: formData.workDate,
        note: formData.note
      }
      if (workLogType === 'task' && formData.taskId) payload.taskId = formData.taskId
      if (workLogType === 'bug' && formData.bugId) payload.bugId = formData.bugId

      await workLogApi.create(payload)
      setShowForm(false)
      setFormData({ projectId: '', taskId: '', bugId: '', hours: '', workDate: new Date().toISOString().split('T')[0], note: '' })
      setWorkLogType('')
      setTasks([])
      setBugs([])
      loadData()
    } catch (err) {
      console.error('Failed to create work log:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const startEdit = (log: WorkLog) => {
    setEditingId(log.id)
    setEditForm({
      hours: String(log.hours),
      workDate: log.workDate.split('T')[0],
      note: log.note || ''
    })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditForm({ hours: '', workDate: '', note: '' })
  }

  const saveEdit = async (logId: string) => {
    try {
      await workLogApi.update(logId, {
        hours: parseFloat(editForm.hours),
        workDate: editForm.workDate,
        note: editForm.note
      })
      setEditingId(null)
      loadData()
    } catch (err) {
      console.error('Failed to update work log:', err)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('確定要刪除這筆時數記錄？')) return
    try {
      await workLogApi.delete(id)
      loadData()
    } catch (err) {
      console.error('Failed to delete work log:', err)
    }
  }

  const exportExcel = () => {
    const data = filteredLogs.map(log => ({
      '日期': new Date(log.workDate).toLocaleDateString('zh-TW'),
      '項目': log.task?.project?.name || log.bug?.project?.name || '-',
      '類型': log.task ? '任務' : log.bug ? '缺陷' : '-',
      '任務/缺陷': log.task?.title || log.bug?.title || '-',
      '人員': log.user?.name || '-',
      '時數': log.hours,
      '備註': log.note || ''
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '工作時數')
    XLSX.writeFile(wb, `工作時數_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 lg:mb-8">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">工作時數</h1>
          <p className="text-gray-500 mt-1">登記並查看工作時數記錄</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="btn-primary flex items-center gap-2 justify-center sm:justify-start w-full sm:w-auto"
        >
          <Plus size={20} />
          <span>登記時數</span>
        </button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 mb-6 lg:mb-8">
        <div className="card p-4 lg:p-6">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-lg bg-primary-100 flex items-center justify-center flex-shrink-0">
              <Clock className="text-primary-600" size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-xl lg:text-2xl font-bold text-gray-900 truncate">
                {filteredLogs.reduce((sum, log) => sum + (Number(log.hours) || 0), 0).toFixed(1)}h
              </p>
              <p className="text-gray-500 text-sm">總計時數</p>
            </div>
          </div>
        </div>
        <div className="card p-4 lg:p-6">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
              <Calendar className="text-green-600" size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-xl lg:text-2xl font-bold text-gray-900 truncate">{filteredLogs.length}</p>
              <p className="text-gray-500 text-sm">記錄筆數</p>
            </div>
          </div>
        </div>
        <div className="card p-4 lg:p-6 sm:col-span-2 lg:col-span-1">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Clock className="text-purple-600" size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-xl lg:text-2xl font-bold text-gray-900 truncate">
                {filteredLogs.length > 0
                  ? (filteredLogs.reduce((sum, log) => sum + (Number(log.hours) || 0), 0) / filteredLogs.length).toFixed(1)
                  : 0}h
              </p>
              <p className="text-gray-500 text-sm">平均時數</p>
            </div>
          </div>
        </div>
        <div className="card p-4 lg:p-6 lg:col-span-1">
          <button onClick={exportExcel} className="btn-secondary w-full flex items-center justify-center gap-2">
            <Download size={20} />
            <span>導出Excel</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <select
          value={filterProject}
          onChange={(e) => setFilterProject(e.target.value)}
          className="input-field text-sm"
        >
          <option value="">全部項目</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select
          value={filterUser}
          onChange={(e) => setFilterUser(e.target.value)}
          className="input-field text-sm"
        >
          <option value="">全部人員</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
      </div>

      {/* Work Logs List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500"></div>
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="card p-12 text-center">
          <Clock size={48} className="mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">暫無時數記錄</h3>
          <p className="text-gray-500">開始登記您的工作時數</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">日期</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">項目</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">任務/缺陷</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">人員</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">時數</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">備註</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase w-24">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    {/* Date */}
                    <td className="px-6 py-4 text-sm text-gray-900 whitespace-nowrap">
                      {new Date(log.workDate).toLocaleDateString('zh-TW')}
                    </td>

                    {/* Project */}
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {log.task?.project?.name || log.bug?.project?.name || '-'}
                    </td>

                    {/* Task or Bug */}
                    <td className="px-6 py-4 text-sm text-gray-600 max-w-[200px] truncate">
                      {log.task?.title
                        ? `📋 ${log.task.title}`
                        : log.bug?.title
                        ? `🐛 ${log.bug.title}`
                        : '-'}
                    </td>

                    {/* User */}
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {log.user?.name || '-'}
                    </td>

                    {/* Hours */}
                    <td className="px-6 py-4">
                      {editingId === log.id ? (
                        <input
                          type="number"
                          step="0.25"
                          max="24"
                          value={editForm.hours}
                          onChange={(e) => setEditForm({ ...editForm, hours: e.target.value })}
                          className="input-field w-20 text-sm py-1"
                        />
                      ) : (
                        <span className="text-sm font-medium text-primary-600">{log.hours}h</span>
                      )}
                    </td>

                    {/* Note */}
                    <td className="px-6 py-4">
                      {editingId === log.id ? (
                        <input
                          type="text"
                          value={editForm.note}
                          onChange={(e) => setEditForm({ ...editForm, note: e.target.value })}
                          className="input-field text-sm py-1 w-full"
                          placeholder="備註"
                        />
                      ) : (
                        <span className="text-sm text-gray-500 max-w-[200px] truncate block">
                          {log.note || '-'}
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4">
                      {editingId === log.id ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => saveEdit(log.id)}
                            className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                            title="保存"
                          >
                            <Check size={16} />
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors"
                            title="取消"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => startEdit(log)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="編輯"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(log.id)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="刪除"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">登記工作時數</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Project */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">項目 *</label>
                <select
                  value={formData.projectId}
                  onChange={(e) => handleProjectChange(e.target.value)}
                  className="input-field"
                  required
                >
                  <option value="">選擇項目</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

{/* Task/Bug type selector - appears after project is selected */}
              {formData.projectId && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">登記類型</label>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => { setWorkLogType('task'); setFormData({ ...formData, taskId: '', bugId: '' }) }}
                      className={`flex-1 py-2 px-4 rounded-lg border-2 transition-colors ${workLogType === 'task' ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 hover:border-primary-300'}`}
                    >
                      📋 任務
                    </button>
                    <button
                      type="button"
                      onClick={() => { setWorkLogType('bug'); setFormData({ ...formData, taskId: '', bugId: '' }) }}
                      className={`flex-1 py-2 px-4 rounded-lg border-2 transition-colors ${workLogType === 'bug' ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 hover:border-primary-300'}`}
                    >
                      🐛 缺陷
                    </button>
                  </div>
                </div>
              )}

              {/* Task/Bug select - combined after type is selected */}
              {formData.projectId && workLogType && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">任務/缺陷</label>
                  <select
                    value={workLogType === 'task' ? formData.taskId : formData.bugId}
                    onChange={(e) => {
                      if (workLogType === 'task') {
                        setFormData({ ...formData, taskId: e.target.value, bugId: '' })
                      } else {
                        setFormData({ ...formData, bugId: e.target.value, taskId: '' })
                      }
                    }}
                    className="input-field"
                  >
                    <option value="">選擇任務/缺陷</option>
                    {workLogType === 'task' && tasks.map((t) => (
                      <option key={t.id} value={t.id}>📋 {t.title}</option>
                    ))}
                    {workLogType === 'bug' && bugs.map((b) => (
                      <option key={b.id} value={b.id}>🐛 {b.title}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Hours */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">時數（小數，如 0.25 = 15分鐘）*</label>
                <input
                  type="number"
                  step="0.25"
                  max="24"
                  value={formData.hours}
                  onChange={(e) => setFormData({ ...formData, hours: e.target.value })}
                  className="input-field"
                  placeholder="2.5"
                />
              </div>

              {/* Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">日期 *</label>
                <input
                  type="date"
                  value={formData.workDate}
                  onChange={(e) => setFormData({ ...formData, workDate: e.target.value })}
                  className="input-field"
                  required
                />
              </div>

              {/* Note */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">備註</label>
                <textarea
                  value={formData.note}
                  onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                  className="input-field"
                  rows={2}
                  placeholder="工作內容說明..."
                />
              </div>

              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false)
                    setFormData({ projectId: '', taskId: '', bugId: '', hours: '', workDate: new Date().toISOString().split('T')[0], note: '' })
                    setWorkLogType('')
                    setTasks([])
                    setBugs([])
                  }}
                  className="btn-secondary"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !formData.taskId && !formData.bugId}
                  className="btn-primary"
                >
                  {isSubmitting ? '保存中...' : '保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}