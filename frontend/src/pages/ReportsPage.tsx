/**
 * ReportsPage — Sprint 20 US-2/3: 多視角報表 + Excel / PDF 導出
 *
 * 改寫自原本只支援項目視角嘅 ReportsPage:
 *   - 3 個視角 tab: 📊 項目(向後相容) / 🏢 部門 / 👤 個人
 *   - 共通篩選:時間段(快速選擇 + 自訂)+ 視角相關 selector
 *   - 每個視角右上有 📥 Excel + 📄 PDF 兩顆導出按鈕
 *
 * 對應 RB-12:reports 頁面加部門/個人視角 + 導出
 */
import { useEffect, useState } from 'react'
import { BarChart3, DollarSign, TrendingUp, Download, FileText, Building2, User as UserIcon, FolderKanban } from 'lucide-react'
import { reportApi, projectApi, userApi, departmentApi } from '../utils/api'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts'
import type { CostReport, ProgressReport } from '../types'
import ProjectAutocomplete, { type ProjectOption } from '../components/ProjectAutocomplete'
import DepartmentAutocomplete from '../components/DepartmentAutocomplete'
import UserAutocomplete, { type UserOption } from '../components/UserAutocomplete'
import { exportReportPdf, type PdfTableColumn } from '../utils/pdfExport'
import * as ExcelJS from 'exceljs'

type Perspective = 'project' | 'department' | 'user'

interface DepartmentReport {
  department: { id: string; name: string }
  totalHours: number
  userCount: number
  projectBreakdown: { projectId: string; name: string; totalHours: number }[]
  userBreakdown: { userId: string; name: string; email: string; totalHours: number }[]
  totalRequirements: number
  completedRequirements: number
  requirementsProgress: number
  totalTasks: number
  completedTasks: number
  tasksProgress: number
  openBugs: number
}

interface UserReport {
  user: { id: string; name: string; email: string; department: { id: string; name: string } | null }
  totalHours: number
  projectBreakdown: { projectId: string; name: string; totalHours: number }[]
  taskBreakdown: { taskId: string; title: string; hours: number; isBug: boolean }[]
  dailyHours: { date: string; hours: number }[]
  logCount: number
}

export default function ReportsPage() {
  const [perspective, setPerspective] = useState<Perspective>('project')

  // 共通 — 時間段
  const today = new Date().toISOString().split('T')[0]
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // 項目視角
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [costReport, setCostReport] = useState<CostReport | null>(null)
  const [progressReport, setProgressReport] = useState<ProgressReport | null>(null)

  // 部門視角
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([])
  const [selectedDepartmentId, setSelectedDepartmentId] = useState('')
  const [departmentReports, setDepartmentReports] = useState<DepartmentReport[]>([])

  // 個人視角
  const [users, setUsers] = useState<UserOption[]>([])
  const [selectedUserId, setSelectedUserId] = useState('')
  const [userReports, setUserReports] = useState<UserReport[]>([])

  const [isLoading, setIsLoading] = useState(false)

  // 載入 selector options
  useEffect(() => {
    loadProjects()
    loadDepartments()
    loadUsers()
  }, [])

  const loadProjects = async () => {
    try {
      const response = await projectApi.list({ limit: -1 })
      const opts: ProjectOption[] = (response.data.projects || []).map((p: any) => ({
        id: p.id, name: p.name, status: p.status,
        department: p.department ? { name: p.department.name } : null,
      }))
      setProjects(opts)
    } catch (err) { console.error('Failed to load projects:', err) }
  }
  const loadDepartments = async () => {
    try {
      const res = await departmentApi.list()
      setDepartments(res.data.departments || [])
    } catch (err) { console.error('Failed to load departments:', err) }
  }
  const loadUsers = async () => {
    try {
      const res = await userApi.list()
      const raw: any[] = res.data.users || []
      setUsers(raw.map((u) => ({
        id: u.id, name: u.name, email: u.email,
        department: u.department ? { id: u.department.id, name: u.department.name } : u.departmentId ? { id: u.departmentId, name: '' } : null,
      })))
    } catch (err) { console.error('Failed to load users:', err) }
  }

  // 載入當前視角嘅 report
  useEffect(() => {
    if (perspective === 'project' && selectedProjectId) loadProjectReport()
    if (perspective === 'department') loadDepartmentReport()
    if (perspective === 'user') loadUserReport()
  }, [perspective, selectedProjectId, selectedDepartmentId, selectedUserId, startDate, endDate])

  const loadProjectReport = async () => {
    setIsLoading(true)
    try {
      const [costRes, progressRes] = await Promise.all([
        reportApi.cost(selectedProjectId),
        reportApi.progress(selectedProjectId),
      ])
      setCostReport(costRes.data)
      setProgressReport(progressRes.data)
    } catch (err) { console.error('Failed to load project report:', err) }
    finally { setIsLoading(false) }
  }

  const loadDepartmentReport = async () => {
    setIsLoading(true)
    try {
      const res = await reportApi.byDepartment({
        departmentId: selectedDepartmentId || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      })
      setDepartmentReports(res.data.departments || [])
    } catch (err) { console.error('Failed to load department report:', err) }
    finally { setIsLoading(false) }
  }

  const loadUserReport = async () => {
    setIsLoading(true)
    try {
      const res = await reportApi.byUser({
        userId: selectedUserId || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      })
      setUserReports(res.data.users || [])
    } catch (err) { console.error('Failed to load user report:', err) }
    finally { setIsLoading(false) }
  }

  // 快速時間段 helper
  const applyQuickRange = (range: 'today' | 'week' | 'month' | 'all') => {
    const t = new Date()
    const fmt = (d: Date) => d.toISOString().split('T')[0]
    if (range === 'today') { setStartDate(fmt(t)); setEndDate(fmt(t)) }
    else if (range === 'week') { const w = new Date(t); w.setDate(w.getDate() - 7); setStartDate(fmt(w)); setEndDate(fmt(t)) }
    else if (range === 'month') { const m = new Date(t); m.setDate(m.getDate() - 30); setStartDate(fmt(m)); setEndDate(fmt(t)) }
    else { setStartDate(''); setEndDate('') }
  }

  // 導出 helper
  const buildSubtitle = () => {
    if (startDate && endDate) return `Time range: ${startDate} ~ ${endDate}`
    if (startDate) return `Since: ${startDate}`
    if (endDate) return `Until: ${endDate}`
    return 'Time range: all time'
  }

  const exportExcel = async (filename: string, columns: PdfTableColumn[], rows: Record<string, any>[]) => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Report')
    ws.columns = columns.map((c) => ({ header: c.header, key: c.dataKey, width: 18 }))
    rows.forEach((r) => ws.addRow(r))
    const buf = await wb.xlsx.writeBuffer()
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${filename}_${today}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleExportPdf = (filename: string, title: string, columns: PdfTableColumn[], rows: Record<string, any>[]) => {
    exportReportPdf({ title, subtitle: buildSubtitle(), columns, rows, filename, orientation: rows.length > 8 ? 'landscape' : 'portrait' })
  }

  // ── 渲染 ──────────────────────────────────────────────────────

  const projectChartData = costReport?.members.map((m) => ({ name: m.name, hours: m.totalHours })) || []

  return (
    <div>
      <div className="mb-6 lg:mb-8">
        <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">報表</h1>
        <p className="text-gray-500 mt-1">查看項目、部門、個人工作時數與進度</p>
      </div>

      {/* Perspective tabs */}
      <div className="flex gap-2 mb-4 border-b border-gray-200 overflow-x-auto">
        <PerspectiveTab icon={<FolderKanban size={18} />} label="項目" active={perspective === 'project'} onClick={() => setPerspective('project')} />
        <PerspectiveTab icon={<Building2 size={18} />} label="部門" active={perspective === 'department'} onClick={() => setPerspective('department')} />
        <PerspectiveTab icon={<UserIcon size={18} />} label="個人" active={perspective === 'user'} onClick={() => setPerspective('user')} />
      </div>

      {/* 共通篩選:時間段 + 視角 selector */}
      <div className="card p-4 lg:p-6 mb-6 space-y-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs text-gray-500 mb-1">開始日期</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input-field text-sm w-full" />
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs text-gray-500 mb-1">結束日期</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="input-field text-sm w-full" />
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs text-gray-500 mb-1">快速選擇</label>
            <select onChange={(e) => applyQuickRange(e.target.value as any)} className="input-field text-sm w-full" defaultValue="all">
              <option value="all">全部時間</option>
              <option value="today">今天</option>
              <option value="week">最近 7 天</option>
              <option value="month">最近 30 天</option>
            </select>
          </div>
        </div>

        {/* 視角 selector */}
        {perspective === 'project' && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">選擇項目 *</label>
            <ProjectAutocomplete value={selectedProjectId} onChange={setSelectedProjectId} projects={projects} placeholder="請選擇項目" required ariaLabel="選擇項目以查看報表" className="w-full sm:max-w-md" />
          </div>
        )}
        {perspective === 'department' && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">選擇部門(留空顯示全部)</label>
            <DepartmentAutocomplete value={selectedDepartmentId} onChange={setSelectedDepartmentId} departments={departments} placeholder="全部部門" className="w-full sm:max-w-md" />
          </div>
        )}
        {perspective === 'user' && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">選擇員工(留空顯示全部)</label>
            <UserAutocomplete value={selectedUserId} onChange={setSelectedUserId} users={users} placeholder="全部員工" className="w-full sm:max-w-md" />
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500" />
        </div>
      ) : perspective === 'project' ? (
        <ProjectView
          costReport={costReport} progressReport={progressReport} projectChartData={projectChartData}
          selectedProjectId={selectedProjectId}
          onExportExcel={() => {
            if (!costReport) return
            const columns: PdfTableColumn[] = [
              { header: '成員', dataKey: 'name' },
              { header: '時數', dataKey: 'hours' },
              { header: '任務數', dataKey: 'taskCount' },
            ]
            const rows = costReport.members.map((m) => ({ name: m.name, hours: m.totalHours, taskCount: m.tasks.length }))
            void exportExcel(`project_${costReport.project.name}_${today}`, columns, rows)
          }}
          onExportPdf={() => {
            if (!costReport) return
            const columns: PdfTableColumn[] = [
              { header: 'Member', dataKey: 'name' },
              { header: 'Hours', dataKey: 'hours' },
              { header: 'Tasks', dataKey: 'taskCount' },
            ]
            const rows = costReport.members.map((m) => ({ name: m.name, hours: m.totalHours, taskCount: m.tasks.length }))
            handleExportPdf(`project_${costReport.project.name}`, `Project Report — ${costReport.project.name}`, columns, rows)
          }}
        />
      ) : perspective === 'department' ? (
        <DepartmentView
          reports={departmentReports}
          onExportExcel={() => {
            if (departmentReports.length === 0) return
            const columns: PdfTableColumn[] = [
              { header: '部門', dataKey: 'name' },
              { header: '總時數', dataKey: 'totalHours' },
              { header: '成員數', dataKey: 'userCount' },
              { header: '需求進度%', dataKey: 'requirementsProgress' },
              { header: '任務進度%', dataKey: 'tasksProgress' },
              { header: '未修復缺陷', dataKey: 'openBugs' },
            ]
            const rows = departmentReports.map((d) => ({
              name: d.department.name,
              totalHours: d.totalHours,
              userCount: d.userCount,
              requirementsProgress: d.requirementsProgress,
              tasksProgress: d.tasksProgress,
              openBugs: d.openBugs,
            }))
            void exportExcel(`departments_${today}`, columns, rows)
          }}
          onExportPdf={() => {
            if (departmentReports.length === 0) return
            const columns: PdfTableColumn[] = [
              { header: 'Department', dataKey: 'name' },
              { header: 'Hours', dataKey: 'totalHours' },
              { header: 'Members', dataKey: 'userCount' },
              { header: 'Req%', dataKey: 'requirementsProgress' },
              { header: 'Task%', dataKey: 'tasksProgress' },
              { header: 'Open Bugs', dataKey: 'openBugs' },
            ]
            const rows = departmentReports.map((d) => ({
              name: d.department.name,
              totalHours: d.totalHours,
              userCount: d.userCount,
              requirementsProgress: d.requirementsProgress,
              tasksProgress: d.tasksProgress,
              openBugs: d.openBugs,
            }))
            handleExportPdf('departments', 'Department Report', columns, rows)
          }}
        />
      ) : (
        <UserView
          reports={userReports}
          onExportExcel={() => {
            if (userReports.length === 0) return
            const columns: PdfTableColumn[] = [
              { header: '員工', dataKey: 'name' },
              { header: '部門', dataKey: 'department' },
              { header: '總時數', dataKey: 'totalHours' },
              { header: '記錄筆數', dataKey: 'logCount' },
            ]
            const rows = userReports.map((u) => ({
              name: u.user.name,
              department: u.user.department?.name || '-',
              totalHours: u.totalHours,
              logCount: u.logCount,
            }))
            void exportExcel(`users_${today}`, columns, rows)
          }}
          onExportPdf={() => {
            if (userReports.length === 0) return
            const columns: PdfTableColumn[] = [
              { header: 'User', dataKey: 'name' },
              { header: 'Department', dataKey: 'department' },
              { header: 'Hours', dataKey: 'totalHours' },
              { header: 'Logs', dataKey: 'logCount' },
            ]
            const rows = userReports.map((u) => ({
              name: u.user.name,
              department: u.user.department?.name || '-',
              totalHours: u.totalHours,
              logCount: u.logCount,
            }))
            handleExportPdf('users', 'User Report', columns, rows)
          }}
        />
      )}
    </div>
  )
}

// ── Perspective Tab 子元件 ─────────────────────────────────────

function PerspectiveTab({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition-colors whitespace-nowrap ${
        active ? 'border-primary-500 text-primary-700 font-medium' : 'border-transparent text-gray-500 hover:text-gray-700'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

// ── 視角元件 ─────────────────────────────────────────────────────

interface ProjectViewProps {
  costReport: CostReport | null
  progressReport: ProgressReport | null
  projectChartData: { name: string; hours: number }[]
  selectedProjectId: string
  onExportExcel: () => void
  onExportPdf: () => void
}
function ProjectView({ costReport, progressReport, projectChartData, selectedProjectId, onExportExcel, onExportPdf }: ProjectViewProps) {
  if (!selectedProjectId) {
    return (
      <div className="card p-12 text-center">
        <BarChart3 size={48} className="mx-auto text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">請選擇項目</h3>
        <p className="text-gray-500">選擇上方項目以查看報表</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <ExportBar onExcel={onExportExcel} onPdf={onExportPdf} />
      {progressReport && (
        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <TrendingUp size={24} className="text-primary-500" />項目進度
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="card p-6">
              <p className="text-gray-500 text-sm mb-1">需求進度</p>
              <div className="flex items-end gap-2">
                <span className="text-3xl font-bold text-primary-600">{progressReport.requirementsProgress}%</span>
                <span className="text-gray-500 text-sm">({progressReport.completedRequirements}/{progressReport.totalRequirements})</span>
              </div>
              <div className="mt-2 h-2 bg-gray-200 rounded-full">
                <div className="h-2 bg-primary-500 rounded-full transition-all" style={{ width: `${progressReport.requirementsProgress}%` }} />
              </div>
            </div>
            <div className="card p-6">
              <p className="text-gray-500 text-sm mb-1">任務進度</p>
              <div className="flex items-end gap-2">
                <span className="text-3xl font-bold text-green-600">{progressReport.tasksProgress}%</span>
                <span className="text-gray-500 text-sm">({progressReport.completedTasks}/{progressReport.totalTasks})</span>
              </div>
              <div className="mt-2 h-2 bg-gray-200 rounded-full">
                <div className="h-2 bg-green-500 rounded-full transition-all" style={{ width: `${progressReport.tasksProgress}%` }} />
              </div>
            </div>
            <div className="card p-6">
              <p className="text-gray-500 text-sm mb-1">缺陷狀態</p>
              <div className="flex items-end gap-2">
                <span className="text-3xl font-bold text-red-600">{progressReport.openBugs}</span>
                <span className="text-gray-500 text-sm">待處理</span>
              </div>
              <p className="text-sm text-gray-500 mt-1">{progressReport.resolvedBugs} 已修復 / {progressReport.totalBugs} 總計</p>
            </div>
          </div>
        </div>
      )}
      {costReport && (
        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <DollarSign size={24} className="text-primary-500" />項目成本
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card p-6">
              <p className="text-gray-500 text-sm mb-1">總工作時數</p>
              <p className="text-4xl font-bold text-gray-900">{costReport.totalHours.toFixed(1)}h</p>
            </div>
            <div className="card p-6">
              <p className="text-sm font-medium text-gray-700 mb-4">各成員工作時數分佈</p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={projectChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} unit="h" />
                    <Tooltip formatter={(value) => [`${Number(value).toFixed(1)}h`, '工作時數']} />
                    <Bar dataKey="hours" fill="#667eea" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
          <div className="card overflow-hidden mt-6">
            <div className="p-4 border-b border-gray-100"><h3 className="font-semibold text-gray-900">成員詳細</h3></div>
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">成員</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">時數</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">任務數</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {costReport.members.map((member) => (
                  <tr key={member.userId} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <p className="font-medium text-gray-900">{member.name}</p>
                      <p className="text-sm text-gray-500">{member.email}</p>
                    </td>
                    <td className="px-6 py-4 text-primary-600 font-medium">{member.totalHours.toFixed(1)}h</td>
                    <td className="px-6 py-4 text-gray-600">{member.tasks.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

interface DepartmentViewProps {
  reports: DepartmentReport[]
  onExportExcel: () => void
  onExportPdf: () => void
}
function DepartmentView({ reports, onExportExcel, onExportPdf }: DepartmentViewProps) {
  if (reports.length === 0) {
    return (
      <div className="card p-12 text-center">
        <Building2 size={48} className="mx-auto text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">暫無部門資料</h3>
        <p className="text-gray-500">調整時間段或選擇其他部門</p>
      </div>
    )
  }
  return (
    <div className="space-y-6">
      <ExportBar onExcel={onExportExcel} onPdf={onExportPdf} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {reports.map((d) => (
          <div key={d.department.id} className="card p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2"><Building2 size={18} />{d.department.name}</h3>
              <span className="text-2xl font-bold text-primary-600">{d.totalHours.toFixed(1)}h</span>
            </div>
            <p className="text-sm text-gray-500 mb-4">{d.userCount} 名成員</p>
            <div className="space-y-3 text-sm">
              <ProgressBar label="需求進度" percent={d.requirementsProgress} suffix={`${d.completedRequirements}/${d.totalRequirements}`} color="bg-primary-500" />
              <ProgressBar label="任務進度" percent={d.tasksProgress} suffix={`${d.completedTasks}/${d.totalTasks}`} color="bg-green-500" />
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">未修復缺陷</span>
                <span className="font-medium text-red-600">{d.openBugs}</span>
              </div>
            </div>
            {d.projectBreakdown.length > 0 && (
              <details className="mt-4 text-sm">
                <summary className="cursor-pointer text-gray-600 hover:text-gray-900">項目分佈({d.projectBreakdown.length})</summary>
                <ul className="mt-2 space-y-1">
                  {d.projectBreakdown.slice(0, 5).map((p) => (
                    <li key={p.projectId} className="flex justify-between text-gray-600">
                      <span className="truncate">{p.name}</span>
                      <span className="text-primary-600 ml-2 flex-shrink-0">{p.totalHours.toFixed(1)}h</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {d.userBreakdown.length > 0 && (
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer text-gray-600 hover:text-gray-900">成員分佈({d.userBreakdown.length})</summary>
                <ul className="mt-2 space-y-1">
                  {d.userBreakdown.map((u) => (
                    <li key={u.userId} className="flex justify-between text-gray-600">
                      <span className="truncate">{u.name}</span>
                      <span className="text-primary-600 ml-2 flex-shrink-0">{u.totalHours.toFixed(1)}h</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

interface UserViewProps {
  reports: UserReport[]
  onExportExcel: () => void
  onExportPdf: () => void
}
function UserView({ reports, onExportExcel, onExportPdf }: UserViewProps) {
  if (reports.length === 0) {
    return (
      <div className="card p-12 text-center">
        <UserIcon size={48} className="mx-auto text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">暫無員工資料</h3>
        <p className="text-gray-500">調整時間段或選擇其他員工</p>
      </div>
    )
  }
  return (
    <div className="space-y-6">
      <ExportBar onExcel={onExportExcel} onPdf={onExportPdf} />
      {reports.map((u) => (
        <div key={u.user.id} className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <UserIcon size={18} />{u.user.name}
              </h3>
              {u.user.department && <p className="text-sm text-gray-500 mt-0.5">{u.user.department.name}</p>}
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-primary-600">{u.totalHours.toFixed(1)}h</p>
              <p className="text-xs text-gray-500">{u.logCount} 筆記錄</p>
            </div>
          </div>

          {/* Daily hours chart */}
          {u.dailyHours.length > 0 && (
            <div className="h-48 mb-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={u.dailyHours}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} unit="h" />
                  <Tooltip formatter={(value) => [`${Number(value).toFixed(1)}h`, 'Hours']} />
                  <Line type="monotone" dataKey="hours" stroke="#667eea" strokeWidth={2} dot={{ r: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {u.projectBreakdown.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">項目分佈</h4>
                <ul className="text-sm space-y-1">
                  {u.projectBreakdown.slice(0, 5).map((p) => (
                    <li key={p.projectId} className="flex justify-between text-gray-600">
                      <span className="truncate">{p.name}</span>
                      <span className="text-primary-600 ml-2 flex-shrink-0">{p.totalHours.toFixed(1)}h</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {u.taskBreakdown.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">任務/缺陷(前 5)</h4>
                <ul className="text-sm space-y-1">
                  {u.taskBreakdown.slice(0, 5).map((t) => (
                    <li key={`${t.isBug ? 'bug' : 'task'}-${t.taskId}`} className="flex justify-between text-gray-600">
                      <span className="truncate">{t.isBug ? '🐛' : '📋'} {t.title}</span>
                      <span className="text-primary-600 ml-2 flex-shrink-0">{t.hours.toFixed(1)}h</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── 共用小元件 ──────────────────────────────────────────────────

function ExportBar({ onExcel, onPdf }: { onExcel: () => void; onPdf: () => void }) {
  return (
    <div className="flex gap-2 justify-end">
      <button onClick={onExcel} className="btn-secondary flex items-center gap-2 text-sm" title="導出 Excel">
        <Download size={16} />Excel
      </button>
      <button onClick={onPdf} className="btn-secondary flex items-center gap-2 text-sm" title="導出 PDF">
        <FileText size={16} />PDF
      </button>
    </div>
  )
}

function ProgressBar({ label, percent, suffix, color }: { label: string; percent: number; suffix?: string; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-gray-500">{label}</span>
        <span className="text-gray-900 font-medium">{percent}%{suffix && <span className="text-gray-400 text-xs ml-1">({suffix})</span>}</span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full">
        <div className={`h-2 ${color} rounded-full transition-all`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}
