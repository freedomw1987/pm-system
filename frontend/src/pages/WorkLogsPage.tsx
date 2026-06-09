import { useEffect, useState } from 'react'
import { Clock, Plus, Calendar, Edit2, Trash2, X, Check, Download, BarChart3, Users, Eye } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { workLogApi, projectApi, taskApi, bugApi, userApi, departmentApi } from '../utils/api'
import type { WorkLog } from '../types'
import * as ExcelJS from 'exceljs'
import { hasAnyPermission, hasPermission } from '../utils/permissions'
import ProjectAutocomplete, { type ProjectOption } from '../components/ProjectAutocomplete'

interface TaskOption { id: string; title: string; requirementTitle?: string }
interface BugOption { id: string; title: string; requirementTitle?: string }
interface DepartmentOption { id: string; name: string }

interface GroupedData {
  name: string
  department?: string
  totalHours: number
  count: number
}

export default function WorkLogsPage() {
  const { user } = useAuth()
  const [workLogs, setWorkLogs] = useState<WorkLog[]>([])
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [tasks, setTasks] = useState<TaskOption[]>([])
  const [bugs, setBugs] = useState<BugOption[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  // Filter state
  const [filterProject, setFilterProject] = useState('')
  const [filterUser, setFilterUser] = useState('')
  const [filterDepartment, setFilterDepartment] = useState('')
  const [filterStartDate, setFilterStartDate] = useState('')
  const [filterEndDate, setFilterEndDate] = useState('')
  const [groupBy, setGroupBy] = useState<'user' | 'department' | 'project' | 'day' | 'week' | 'month' | ''>('')
  const [groupedData, setGroupedData] = useState<GroupedData[]>([])
  const [grandTotal, setGrandTotal] = useState(0)
  const [totalRecords, setTotalRecords] = useState(0)
  const [users, setUsers] = useState<{ id: string; name: string; departmentId?: string }[]>([])
  const [departments, setDepartments] = useState<DepartmentOption[]>([])
  const [filteredLogs, setFilteredLogs] = useState<WorkLog[]>([])
  // Server-side stats (source of truth, ignore client-side filters for these)
  const [serverTotalCount, setServerTotalCount] = useState(0)
  const [serverTotalHours, setServerTotalHours] = useState(0)
  // Pagination state (list mode only; ignored when groupBy is active)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [totalPages, setTotalPages] = useState(1)
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
  const [detailLog, setDetailLog] = useState<WorkLog | null>(null)

  useEffect(() => {
    loadProjects()
    loadUsers()
    loadDepartments()
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
    if (filterDepartment) {
      result = result.filter(log =>
        (log.user as any)?.department?.id === filterDepartment ||
        (log.user as any)?.departmentId === filterDepartment
      )
    }
    setFilteredLogs(result)
  }, [workLogs, filterProject, filterUser, filterDepartment])

  const loadProjects = async () => {
    try {
      // Sprint 14: limit: -1 → 載晒全部項目,畀 Autocomplete 揀(原本 page 1 only 漏咗後面 page)
      const res = await projectApi.list({ limit: -1 })
      // Map wire shape → ProjectOption (camelCase department + status 都喺 wire 入面)
      const opts: ProjectOption[] = (res.data.projects || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        department: p.department ? { name: p.department.name } : null,
      }))
      setProjects(opts)
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

  const loadDepartments = async () => {
    try {
      const res = await departmentApi.list()
      setDepartments(res.data.departments || [])
    } catch (err) {
      console.error('Failed to load departments:', err)
    }
  }

  const loadData = async () => {
    setIsLoading(true)
    try {
      const params: any = {}
      if (filterProject) params.projectId = filterProject
      if (filterUser) params.userId = filterUser
      if (filterDepartment) params.departmentId = filterDepartment
      if (filterStartDate) params.startDate = filterStartDate
      if (filterEndDate) params.endDate = filterEndDate
      if (groupBy) params.groupBy = groupBy
      // List mode: pass pagination (ignored by server when groupBy is set)
      if (!groupBy) {
        params.page = currentPage
        params.pageSize = pageSize
      }

      const res = await workLogApi.list(params)

      if (groupBy) {
        // Grouped data mode
        setGroupedData(res.data.groupedData || [])
        setGrandTotal(res.data.grandTotal || 0)
        setTotalRecords(res.data.totalRecords || 0)
        setWorkLogs([])
        // Group mode resets pagination state
        setServerTotalCount(res.data.totalRecords || 0)
        setServerTotalHours(res.data.grandTotal || 0)
        setTotalPages(1)
      } else {
        // Regular list mode — server returns {workLogs, totalCount, totalHours, page, pageSize, totalPages}
        setWorkLogs(res.data.workLogs || [])
        setGroupedData([])
        setGrandTotal(0)
        setTotalRecords(0)
        setServerTotalCount(res.data.totalCount ?? (res.data.workLogs?.length ?? 0))
        setServerTotalHours(res.data.totalHours ?? 0)
        if (typeof res.data.totalPages === 'number') setTotalPages(res.data.totalPages)
      }
    } catch (err) {
      console.error('Failed to load data:', err)
    } finally {
      setIsLoading(false)
    }
  }

  // Reload when filters, groupBy, page, or pageSize changes
  useEffect(() => {
    loadData()
  }, [filterProject, filterUser, filterDepartment, filterStartDate, filterEndDate, groupBy, currentPage, pageSize])

  // Reset to page 1 whenever a filter or groupBy changes (page itself should not trigger this)
  useEffect(() => {
    setCurrentPage(1)
  }, [filterProject, filterUser, filterDepartment, filterStartDate, filterEndDate, groupBy])

  // Apply client-side filters for list mode (fallback when backend filtering not available)
  useEffect(() => {
    if (groupBy) {
      setFilteredLogs([])
      return
    }
    let result = workLogs
    if (filterProject) {
      result = result.filter(log =>
        log.task?.project?.id === filterProject || log.bug?.project?.id === filterProject
      )
    }
    if (filterUser) {
      result = result.filter(log => log.user?.id === filterUser)
    }
    if (filterDepartment) {
      result = result.filter(log =>
        (log.user as any)?.department?.id === filterDepartment ||
        (log.user as any)?.departmentId === filterDepartment
      )
    }
    setFilteredLogs(result)
  }, [workLogs, filterProject, filterUser, filterDepartment, groupBy])

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
    } catch (err: any) {
      console.error('Failed to update work log:', err)
      const msg = err?.response?.data?.error?.message || '無法更新記錄'
      alert(msg)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('確定要刪除這筆時數記錄？')) return
    try {
      await workLogApi.delete(id)
      loadData()
    } catch (err: any) {
      console.error('Failed to delete work log:', err)
      const msg = err?.response?.data?.error?.message || '無法刪除記錄'
      alert(msg)
    }
  }

  const exportExcel = async () => {
    try {
      // Always export the FULL filtered set (same filter context as the list),
      // independent of the current page. Use `limit: -1` to bypass server pagination.
      const params: any = { limit: -1 }
      if (filterProject) params.projectId = filterProject
      if (filterUser) params.userId = filterUser
      if (filterDepartment) params.departmentId = filterDepartment
      if (filterStartDate) params.startDate = filterStartDate
      if (filterEndDate) params.endDate = filterEndDate

      const res = await workLogApi.list(params)
      const allLogs: WorkLog[] = res.data.workLogs || []

      const data = allLogs.map(log => ({
        '日期': new Date(log.workDate).toLocaleDateString('zh-TW'),
        '項目': log.task?.project?.name || log.bug?.project?.name || '-',
        '類型': log.task ? '任務' : log.bug ? '缺陷' : '-',
        '任務/缺陷': log.task?.title || log.bug?.title || '-',
        '部門': (log.user as any)?.department?.name || '-',
        '人員': log.user?.name || '-',
        '時數': log.hours,
        '備註': log.note || ''
      }))
      const ws = new ExcelJS.Workbook()
      const sheet = ws.addWorksheet('工作時數')
      sheet.columns = [
        { header: '日期', key: '日期', width: 14 },
        { header: '項目', key: '項目', width: 20 },
        { header: '類型', key: '類型', width: 8 },
        { header: '任務/缺陷', key: '任務/缺陷', width: 24 },
        { header: '部門', key: '部門', width: 14 },
        { header: '人員', key: '人員', width: 14 },
        { header: '時數', key: '時數', width: 8 },
        { header: '備註', key: '備註', width: 30 }
      ]
      data.forEach(row => sheet.addRow(row))
      const buf = await ws.xlsx.writeBuffer()
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `工作時數_${new Date().toISOString().split('T')[0]}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Failed to export Excel:', err)
      alert('導出失敗，請重試')
    }
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
          disabled={!hasAnyPermission(user, ['worklogs.create'])}
          title={!hasAnyPermission(user, ['worklogs.create']) ? '您沒有登記時數的權限' : ''}
        >
          <Plus size={20} />
          <span>登記時數</span>
        </button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 mb-6 lg:mb-8">
        {groupBy ? (
          <>
            <div className="card p-4 lg:p-6">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-lg bg-primary-100 flex items-center justify-center flex-shrink-0">
                  <Clock className="text-primary-600" size={20} />
                </div>
                <div className="min-w-0">
                  <p className="text-xl lg:text-2xl font-bold text-gray-900 truncate">{grandTotal.toFixed(1)}h</p>
                  <p className="text-gray-500 text-sm">總計時數</p>
                </div>
              </div>
            </div>
            <div className="card p-4 lg:p-6">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                  <BarChart3 className="text-green-600" size={20} />
                </div>
                <div className="min-w-0">
                  <p className="text-xl lg:text-2xl font-bold text-gray-900 truncate">{totalRecords}</p>
                  <p className="text-gray-500 text-sm">記錄筆數</p>
                </div>
              </div>
            </div>
            <div className="card p-4 lg:p-6 sm:col-span-2 lg:col-span-1">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                  <Users className="text-purple-600" size={20} />
                </div>
                <div className="min-w-0">
                  <p className="text-xl lg:text-2xl font-bold text-gray-900 truncate">{groupedData.length}</p>
                  <p className="text-gray-500 text-sm">分組項目數</p>
                </div>
              </div>
            </div>
            <div className="card p-4 lg:p-6 lg:col-span-1">
              <button onClick={async () => {
                try {
                  const exportData = groupedData.map(g => ({
                    '分組': g.name,
                    '部門': g.department || '-',
                    '時數': g.totalHours,
                    '筆數': g.count
                  }))
                  const ws2 = new ExcelJS.Workbook()
                  const sheet2 = ws2.addWorksheet(`分組_${groupBy}`)
                  sheet2.columns = [
                    { header: '分組', key: '分組', width: 20 },
                    { header: '部門', key: '部門', width: 14 },
                    { header: '時數', key: '時數', width: 8 },
                    { header: '筆數', key: '筆數', width: 8 }
                  ]
                  exportData.forEach(row => sheet2.addRow(row))
                  const buf = await ws2.xlsx.writeBuffer()
                  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `工作時數_${groupBy}_${new Date().toISOString().split('T')[0]}.xlsx`
                  a.click()
                  URL.revokeObjectURL(url)
                } catch (err) {
                  console.error('Failed to export grouped Excel:', err)
                  alert('分組導出失敗，請重試')
                }
              }} className="btn-secondary w-full flex items-center justify-center gap-2">
                <Download size={20} />
                <span>導出分組</span>
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="card p-4 lg:p-6">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-lg bg-primary-100 flex items-center justify-center flex-shrink-0">
                  <Clock className="text-primary-600" size={20} />
                </div>
                <div className="min-w-0">
                  <p className="text-xl lg:text-2xl font-bold text-gray-900 truncate">
                    {serverTotalHours.toFixed(1)}h
                  </p>
                  <p className="text-gray-500 text-sm">總計時數（全部記錄）</p>
                </div>
              </div>
            </div>
            <div className="card p-4 lg:p-6">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                  <Calendar className="text-green-600" size={20} />
                </div>
                <div className="min-w-0">
                  <p className="text-xl lg:text-2xl font-bold text-gray-900 truncate">{serverTotalCount}</p>
                  <p className="text-gray-500 text-sm">記錄筆數（全部）</p>
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
                    {serverTotalCount > 0
                      ? (serverTotalHours / serverTotalCount).toFixed(1)
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
          </>
        )}
      </div>

      {/* Filters */}
      <div className="space-y-4 mb-6">
        {/* Date range filter */}
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[150px]">
            <label className="block text-xs text-gray-500 mb-1">開始日期</label>
            <input
              type="date"
              value={filterStartDate}
              onChange={(e) => setFilterStartDate(e.target.value)}
              className="input-field text-sm w-full"
            />
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className="block text-xs text-gray-500 mb-1">結束日期</label>
            <input
              type="date"
              value={filterEndDate}
              onChange={(e) => setFilterEndDate(e.target.value)}
              className="input-field text-sm w-full"
            />
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className="block text-xs text-gray-500 mb-1">快速選擇</label>
            <select
              onChange={(e) => {
                const today = new Date()
                const formatDate = (d: Date) => d.toISOString().split('T')[0]
                switch (e.target.value) {
                  case 'today':
                    setFilterStartDate(formatDate(today))
                    setFilterEndDate(formatDate(today))
                    break
                  case 'week':
                    const weekAgo = new Date(today)
                    weekAgo.setDate(weekAgo.getDate() - 7)
                    setFilterStartDate(formatDate(weekAgo))
                    setFilterEndDate(formatDate(today))
                    break
                  case 'month':
                    const monthAgo = new Date(today)
                    monthAgo.setDate(monthAgo.getDate() - 30)
                    setFilterStartDate(formatDate(monthAgo))
                    setFilterEndDate(formatDate(today))
                    break
                  case 'all':
                    setFilterStartDate('')
                    setFilterEndDate('')
                    break
                }
              }}
              className="input-field text-sm w-full"
            >
              <option value="all">全部時間</option>
              <option value="today">今天</option>
              <option value="week">最近7天</option>
              <option value="month">最近30天</option>
            </select>
          </div>
        </div>

        {/* Project, Department, User filters + Group By */}
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[150px]">
            {/* Sprint 14: replace native select with <ProjectAutocomplete> for type-ahead + keyboard nav */}
            <ProjectAutocomplete
              value={filterProject}
              onChange={(id) => setFilterProject(id)}
              projects={projects}
              placeholder="全部項目"
              ariaLabel="篩選項目"
              className="w-full"
            />
          </div>
          <div className="flex-1 min-w-[150px]">
            {hasAnyPermission(user, ['worklogs.view_all']) ? (
              <select
                value={filterDepartment}
                onChange={(e) => setFilterDepartment(e.target.value)}
                className="input-field text-sm w-full"
              >
                <option value="">全部部門</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            ) : (
              <input type="text" value="我所在部門" disabled className="input-field text-sm w-full bg-gray-100" />
            )}
          </div>
          <div className="flex-1 min-w-[150px]">
            {hasAnyPermission(user, ['worklogs.view_all']) ? (
              <select
                value={filterUser}
                onChange={(e) => setFilterUser(e.target.value)}
                className="input-field text-sm w-full"
              >
                <option value="">全部人員</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            ) : (
              <input type="text" value="我自己" disabled className="input-field text-sm w-full bg-gray-100" />
            )}
          </div>
          <div className="flex-1 min-w-[150px]">
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as any)}
              className="input-field text-sm w-full"
            >
              <option value="">顯示列表</option>
              <option value="user">按人員統計</option>
              <option value="department">按部門統計</option>
              <option value="project">按項目統計</option>
              <option value="day">按日期統計</option>
              <option value="week">按週統計</option>
              <option value="month">按月統計</option>
            </select>
          </div>
        </div>
      </div>

      {/* Grouped Data View */}
      {groupBy && !isLoading ? (
        groupedData.length === 0 ? (
          <div className="card p-12 text-center">
            <BarChart3 size={48} className="mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">暫無時數記錄</h3>
            <p className="text-gray-500">嘗試調整篩選條件</p>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      {groupBy === 'user' ? '人員' : groupBy === 'department' ? '部門' : groupBy === 'project' ? '項目' : groupBy === 'day' ? '日期' : groupBy === 'week' ? '週期' : '月份'}
                    </th>
                    {groupBy === 'user' && (
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">部門</th>
                    )}
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">時數</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">記錄筆數</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">平均時數</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {groupedData.map((item, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">{item.name}</td>
                      {groupBy === 'user' && (
                        <td className="px-6 py-4 text-sm text-gray-600">{item.department || '-'}</td>
                      )}
                      <td className="px-6 py-4 text-sm text-right font-medium text-primary-600">{item.totalHours.toFixed(1)}h</td>
                      <td className="px-6 py-4 text-sm text-right text-gray-600">{item.count}</td>
                      <td className="px-6 py-4 text-sm text-right text-gray-500">{(item.totalHours / item.count).toFixed(1)}h</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 font-medium">
                  <tr>
                    <td className="px-6 py-3 text-sm text-gray-900">總計</td>
                    {groupBy === 'user' && <td className="px-6 py-3"></td>}
                    <td className="px-6 py-3 text-sm text-primary-600 text-right">{grandTotal.toFixed(1)}h</td>
                    <td className="px-6 py-3 text-sm text-gray-600 text-right">{totalRecords}</td>
                    <td className="px-6 py-3 text-sm text-gray-500 text-right">{(grandTotal / totalRecords).toFixed(1)}h</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">日期</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">項目</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">任務/缺陷</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">部門</th>
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

                    {/* Department */}
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {(log.user as any)?.department?.name
                        || (log.user as any)?.departmentId
                        || '-'}
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
                            onClick={() => setDetailLog(log)}
                            className="p-1.5 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            title="查看詳情"
                          >
                            <Eye size={16} />
                          </button>
                          {(user?.role === 'admin' || log.user?.id === user?.id) && hasAnyPermission(user, ['worklogs.edit']) ? (
                            <button
                              onClick={() => startEdit(log)}
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="編輯"
                            >
                              <Edit2 size={16} />
                            </button>
                          ) : hasAnyPermission(user, ['worklogs.edit_all']) ? (
                            <button
                              onClick={() => startEdit(log)}
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="編輯全部"
                            >
                              <Edit2 size={16} />
                            </button>
                          ) : null}
                          {(user?.role === 'admin' || log.user?.id === user?.id) && hasAnyPermission(user, ['worklogs.delete']) ? (
                            <button
                              onClick={() => handleDelete(log.id)}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="刪除"
                            >
                              <Trash2 size={16} />
                            </button>
                          ) : hasAnyPermission(user, ['worklogs.delete_all']) ? (
                            <button
                              onClick={() => handleDelete(log.id)}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="刪除全部"
                            >
                              <Trash2 size={16} />
                            </button>
                          ) : null}
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

      {/* Pagination controls (list mode only) */}
      {!groupBy && !isLoading && workLogs.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4 px-1">
          <div className="text-sm text-gray-500">
            第 <span className="font-medium text-gray-900">{(currentPage - 1) * pageSize + 1}</span>–<span className="font-medium text-gray-900">{Math.min(currentPage * pageSize, serverTotalCount)}</span> 筆，共 <span className="font-medium text-gray-900">{serverTotalCount}</span> 筆
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-sm text-gray-500">每頁</label>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(parseInt(e.target.value))}
              className="input-field text-sm py-1 w-auto"
            >
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
            <div className="flex items-center gap-1 ml-2">
              <button
                type="button"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage <= 1}
                className="px-2 py-1 text-sm rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                title="首頁"
              >
                «
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="px-3 py-1 text-sm rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                上一頁
              </button>
              <span className="px-3 py-1 text-sm text-gray-700">
                第 <span className="font-medium text-gray-900">{currentPage}</span> / {totalPages} 頁
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="px-3 py-1 text-sm rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                下一頁
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage >= totalPages}
                className="px-2 py-1 text-sm rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                title="尾頁"
              >
                »
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detailLog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-bold text-gray-900">工作時數詳情</h2>
              <button onClick={() => setDetailLog(null)} className="p-1 text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-500 mb-1">日期</p>
                <p className="text-gray-900 font-medium">{new Date(detailLog.workDate).toLocaleDateString('zh-TW')}</p>
              </div>
              <div>
                <p className="text-gray-500 mb-1">時數</p>
                <p className="text-primary-600 font-semibold">{detailLog.hours}h</p>
              </div>
              <div>
                <p className="text-gray-500 mb-1">項目</p>
                <p className="text-gray-900 font-medium">{detailLog.task?.project?.name || detailLog.bug?.project?.name || '-'}</p>
              </div>
              <div>
                <p className="text-gray-500 mb-1">人員</p>
                <p className="text-gray-900 font-medium">{detailLog.user?.name || '-'}</p>
              </div>
              <div>
                <p className="text-gray-500 mb-1">部門</p>
                <p className="text-gray-900 font-medium">{(detailLog.user as any)?.department?.name || '-'}</p>
              </div>
              <div>
                <p className="text-gray-500 mb-1">關聯對象</p>
                <p className="text-gray-900 font-medium break-words">
                  {detailLog.task?.title ? `任務：${detailLog.task.title}` : detailLog.bug?.title ? `缺陷：${detailLog.bug.title}` : '-'}
                </p>
              </div>
            </div>

            <div className="mt-5">
              <p className="text-gray-500 text-sm mb-2">備註</p>
              <div className="min-h-[120px] whitespace-pre-wrap break-words rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-800">
                {detailLog.note || '-'}
              </div>
            </div>

            <div className="flex justify-end mt-5">
              <button type="button" onClick={() => setDetailLog(null)} className="btn-secondary">關閉</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">登記工作時數</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Project — Sprint 14: <ProjectAutocomplete> 取代 native select */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">項目 *</label>
                <ProjectAutocomplete
                  value={formData.projectId}
                  onChange={(id) => handleProjectChange(id)}
                  projects={projects}
                  placeholder="選擇項目"
                  required
                  ariaLabel="選擇項目"
                />
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
