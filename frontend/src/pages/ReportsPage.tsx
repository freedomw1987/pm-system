import { useEffect, useState } from 'react'
import { BarChart3, DollarSign, TrendingUp } from 'lucide-react'
import { reportApi, projectApi } from '../utils/api'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { Project, CostReport, ProgressReport } from '../types'
import ProjectAutocomplete, { type ProjectOption } from '../components/ProjectAutocomplete'

export default function ReportsPage() {
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [costReport, setCostReport] = useState<CostReport | null>(null)
  const [progressReport, setProgressReport] = useState<ProgressReport | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    loadProjects()
  }, [])

  useEffect(() => {
    if (selectedProjectId) {
      loadReports()
    }
  }, [selectedProjectId])

  const loadProjects = async () => {
    try {
      // Sprint 14: limit: -1 → 載晒全部項目,畀 Autocomplete 揀(原本 page 1 only 漏咗後面 page)
      const response = await projectApi.list({ limit: -1 })
      // Map wire shape → ProjectOption (camelCase department + status 都喺 wire 入面)
      const opts: ProjectOption[] = (response.data.projects || []).map((p: any) => ({
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

  const loadReports = async () => {
    setIsLoading(true)
    try {
      const [costRes, progressRes] = await Promise.all([
        reportApi.cost(selectedProjectId),
        reportApi.progress(selectedProjectId)
      ])
      setCostReport(costRes.data)
      setProgressReport(progressRes.data)
    } catch (err) {
      console.error('Failed to load reports:', err)
    } finally {
      setIsLoading(false)
    }
  }

  // Prepare chart data
  const chartData = costReport?.members.map((m) => ({
    name: m.name,
    hours: m.totalHours
  })) || []

  return (
    <div>
      <div className="mb-6 lg:mb-8">
        <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">報表</h1>
        <p className="text-gray-500 mt-1">查看項目成本和進度報表</p>
      </div>

      {/* Project Selector — Sprint 14: <ProjectAutocomplete> 取代 native select */}
      <div className="card p-4 lg:p-6 mb-6 lg:mb-8">
        <label className="block text-sm font-medium text-gray-700 mb-2">選擇項目</label>
        <ProjectAutocomplete
          value={selectedProjectId}
          onChange={setSelectedProjectId}
          projects={projects}
          placeholder="請選擇項目"
          required
          ariaLabel="選擇項目以查看報表"
          className="w-full sm:max-w-md"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500"></div>
        </div>
      ) : !selectedProjectId ? (
        <div className="card p-12 text-center">
          <BarChart3 size={48} className="mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">請選擇項目</h3>
          <p className="text-gray-500">選擇上方項目以查看報表</p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Progress Report Cards */}
          {progressReport && (
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <TrendingUp size={24} className="text-primary-500" />
                項目進度
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div className="card p-6">
                  <p className="text-gray-500 text-sm mb-1">需求進度</p>
                  <div className="flex items-end gap-2">
                    <span className="text-3xl font-bold text-primary-600">
                      {progressReport.requirementsProgress}%
                    </span>
                    <span className="text-gray-500 text-sm">
                      ({progressReport.completedRequirements}/{progressReport.totalRequirements})
                    </span>
                  </div>
                  <div className="mt-2 h-2 bg-gray-200 rounded-full">
                    <div
                      className="h-2 bg-primary-500 rounded-full transition-all"
                      style={{ width: `${progressReport.requirementsProgress}%` }}
                    />
                  </div>
                </div>
                <div className="card p-6">
                  <p className="text-gray-500 text-sm mb-1">任務進度</p>
                  <div className="flex items-end gap-2">
                    <span className="text-3xl font-bold text-green-600">
                      {progressReport.tasksProgress}%
                    </span>
                    <span className="text-gray-500 text-sm">
                      ({progressReport.completedTasks}/{progressReport.totalTasks})
                    </span>
                  </div>
                  <div className="mt-2 h-2 bg-gray-200 rounded-full">
                    <div
                      className="h-2 bg-green-500 rounded-full transition-all"
                      style={{ width: `${progressReport.tasksProgress}%` }}
                    />
                  </div>
                </div>
                <div className="card p-6">
                  <p className="text-gray-500 text-sm mb-1">缺陷狀態</p>
                  <div className="flex items-end gap-2">
                    <span className="text-3xl font-bold text-red-600">
                      {progressReport.openBugs}
                    </span>
                    <span className="text-gray-500 text-sm">待處理</span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    {progressReport.resolvedBugs} 已修復 / {progressReport.totalBugs} 總計
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Cost Report */}
          {costReport && (
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <DollarSign size={24} className="text-primary-500" />
                項目成本
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Total Hours Card */}
                <div className="card p-6">
                  <p className="text-gray-500 text-sm mb-1">總工作時數</p>
                  <p className="text-4xl font-bold text-gray-900">{costReport.totalHours.toFixed(1)}h</p>
                </div>

                {/* Chart */}
                <div className="card p-6">
                  <p className="text-sm font-medium text-gray-700 mb-4">各成員工作時數分佈</p>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} unit="h" />
                        <Tooltip
                          formatter={(value) => [`${Number(value).toFixed(1)}h`, '工作時數']}
                        />
                        <Bar dataKey="hours" fill="#667eea" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Member Details Table */}
              <div className="card overflow-hidden mt-6">
                <div className="p-4 border-b border-gray-100">
                  <h3 className="font-semibold text-gray-900">成員詳細</h3>
                </div>
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
                          <div>
                            <p className="font-medium text-gray-900">{member.name}</p>
                            <p className="text-sm text-gray-500">{member.email}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-primary-600 font-medium">
                          {member.totalHours.toFixed(1)}h
                        </td>
                        <td className="px-6 py-4 text-gray-600">
                          {member.tasks.length}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}