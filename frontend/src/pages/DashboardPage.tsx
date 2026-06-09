/**
 * DashboardPage — Sprint 14 widget grid + Sprint 15 scope=my + Sprint 16 minimal
 *
 * Sprint 16 (David 2026-06-10 feedback):Dashboard 只 show 統計 + 項目清單,
 * 拎走「最近訪問」quick switch section(屬於 navigation 唔屬於統計/清單)。
 *
 * 結構:
 * - 上半:個人化 widget grid(4 個 widget,全係 user-specific 統計)
 *   - 我的任務(進行中,5 個)
 *   - 我的缺陷(未解決,5 個)
 *   - 本週時數 + chart
 *   - 我參與嘅項目(backend `projectTotalCount`,scope=my 嚴格)
 * - 下半:我參與嘅項目 grid(scope=my 嚴格,pageSize 12)
 *
 * 設計 rationale:Activity Feed 係 Linear / Asana / Jira 等 PM tool 嘅標準 pattern,
 * 用戶 0-config 即刻有「今日做咩」嘅 context(對比舊版只係 6 個項目卡 list)。
 * Sprint 16 進一步收緊:David 講「只 show 統計 + 項目清單」,
 * 連 quick switch(navigation affordance)都拎走,等 Dashboard 100% 對應 David 嘅定義。
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  FolderKanban,
  Plus,
  Users,
  ListTodo,
  Bug as BugIcon,
  Clock,
  TrendingUp,
  ChevronRight,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { projectApi, taskApi, bugApi, workLogApi } from '../utils/api'
import { hasAnyPermission } from '../utils/permissions'
import type { Project, Task, Bug as BugType } from '../types'

// localStorage keys for "recently visited projects" — Sprint 16 拎走
// (David: Dashboard 只 show 統計 + 項目清單,navigation affordance 唔屬於呢類)

export default function DashboardPage() {
  const { user } = useAuth()
  const [projects, setProjects] = useState<Project[]>([])
  const [projectTotalCount, setProjectTotalCount] = useState(0)
  const [myTasks, setMyTasks] = useState<Task[]>([])
  const [myBugs, setMyBugs] = useState<BugType[]>([])
  const [weekHours, setWeekHours] = useState(0)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadAll()
  }, [user?.id])

  const loadAll = async () => {
    setIsLoading(true)
    try {
      const [projRes, tasksRes, bugsRes, workLogsRes] = await Promise.all([
        // Sprint 15: scope=my 嚴格只見自己 member 嘅(David 2026-06-10 feedback)
        // Default backend 寬鬆(member OR 同部門)改為嚴格(member only)— 包括 admin
        projectApi.list({ scope: 'my', page: 1, pageSize: 12 }),
        user?.id
          ? taskApi.list({ assigneeId: user.id, status: 'in_progress', page: 1, pageSize: 5 })
          : Promise.resolve({ data: { tasks: [] } } as any),
        user?.id
          ? bugApi.list({ status: 'open', page: 1, pageSize: 5 })
          : Promise.resolve({ data: { bugs: [] } } as any),
        user?.id
          ? workLogApi.list({
              userId: user.id,
              startDate: getWeekStart(),
              endDate: getToday(),
              groupBy: 'day',
              page: 1,
              pageSize: 7,
            } as any)
          : Promise.resolve({ data: { groupedData: [] } } as any),
      ])

      setProjects(projRes.data.projects || [])
      setProjectTotalCount(projRes.data.totalCount ?? (projRes.data.projects || []).length)
      setMyTasks(tasksRes.data.tasks || [])
      setMyBugs(bugsRes.data.bugs || [])

      // 本週時數:sum groupedData
      const grouped = workLogsRes.data.groupedData || []
      const total = grouped.reduce((sum: number, g: any) => sum + (g.totalHours || 0), 0)
      setWeekHours(Math.round(total * 10) / 10)
    } catch (err) {
      console.error('Failed to load dashboard:', err)
    } finally {
      setIsLoading(false)
    }
  }

  // 本週開始 = Monday
  function getWeekStart(): string {
    const today = new Date()
    const day = today.getDay() || 7 // Sunday=0 → 7
    const monday = new Date(today)
    monday.setDate(today.getDate() - (day - 1))
    return monday.toISOString().split('T')[0]
  }

  function getToday(): string {
    return new Date().toISOString().split('T')[0]
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-700'
      case 'completed': return 'bg-blue-100 text-blue-700'
      case 'archived': return 'bg-gray-100 text-gray-600'
      default: return 'bg-gray-100 text-gray-600'
    }
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 lg:mb-8">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">儀表板</h1>
          <p className="text-gray-500 mt-1">歡迎回來,{user?.name}</p>
        </div>
        {hasAnyPermission(user, ['projects.create']) && (
          <Link
            to="/projects/new"
            className="btn-primary flex items-center gap-2 justify-center sm:justify-start w-full sm:w-auto"
          >
            <Plus size={20} />
            <span>新建項目</span>
          </Link>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500"></div>
        </div>
      ) : (
        <>
          {/* === Activity Feed — Sprint 14 widget grid === */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 mb-6 lg:mb-8">
            {/* Widget 1: 我的任務 */}
            <Link
              to="/my-tasks"
              className="card p-4 lg:p-6 hover:shadow-lg transition-shadow group"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <ListTodo className="text-blue-600" size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-500">進行中任務</p>
                  <p className="text-2xl font-bold text-gray-900">{myTasks.length}</p>
                </div>
                <ChevronRight className="text-gray-300 group-hover:text-primary-500 transition-colors" size={20} />
              </div>
              {myTasks.length > 0 ? (
                <div className="space-y-1.5">
                  {myTasks.slice(0, 3).map((t) => (
                    <div key={t.id} className="text-xs text-gray-600 truncate">
                      • {t.title}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400">冇進行中嘅任務</p>
              )}
            </Link>

            {/* Widget 2: 我的缺陷 */}
            <Link
              to="/my-bugs"
              className="card p-4 lg:p-6 hover:shadow-lg transition-shadow group"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
                  <BugIcon className="text-red-600" size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-500">未解決缺陷</p>
                  <p className="text-2xl font-bold text-gray-900">{myBugs.length}</p>
                </div>
                <ChevronRight className="text-gray-300 group-hover:text-primary-500 transition-colors" size={20} />
              </div>
              {myBugs.length > 0 ? (
                <div className="space-y-1.5">
                  {myBugs.slice(0, 3).map((b) => (
                    <div key={b.id} className="text-xs text-gray-600 truncate">
                      • {b.title}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400">冇未解決嘅缺陷 🎉</p>
              )}
            </Link>

            {/* Widget 3: 本週時數 */}
            <Link
              to="/work-logs"
              className="card p-4 lg:p-6 hover:shadow-lg transition-shadow group"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                  <Clock className="text-green-600" size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-500">本週時數</p>
                  <p className="text-2xl font-bold text-gray-900">{weekHours}h</p>
                </div>
                <ChevronRight className="text-gray-300 group-hover:text-primary-500 transition-colors" size={20} />
              </div>
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <TrendingUp size={12} />
                <span>本週由週一計起</span>
              </div>
            </Link>

            {/* Widget 4: 我參與嘅項目 (Sprint 15: 改 '項目總數' → '我參與嘅項目' 因為 scope=my) */}
            <Link
              to="/projects"
              className="card p-4 lg:p-6 hover:shadow-lg transition-shadow group"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center flex-shrink-0">
                  <FolderKanban className="text-primary-600" size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-500">我參與嘅項目</p>
                  <p className="text-2xl font-bold text-gray-900">{projectTotalCount}</p>
                </div>
                <ChevronRight className="text-gray-300 group-hover:text-primary-500 transition-colors" size={20} />
              </div>
              <p className="text-xs text-gray-400">
                {/* active count 用 client-side filter(只睇首 12 個,sample indicator) */}
                Dashboard 預設顯示 12 個 ·{' '}
                {projects.filter((p) => p.status === 'active').length} 個進行中
              </p>
            </Link>
          </div>

          {/* === 我參與嘅項目 grid (Sprint 15: scope=my 嚴格只 show 自己 member 嘅) === */}
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900">我參與嘅項目</h2>
            <Link
              to="/projects"
              className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
            >
              查看全部 <ChevronRight size={14} />
            </Link>
          </div>
          {projects.length === 0 ? (
            <div className="card p-12 text-center">
              <FolderKanban size={48} className="mx-auto text-gray-300 mb-4" />
              {/* Sprint 15: empty state 改 '暫無我參與嘅項目', 因為 scope=my */}
              <h3 className="text-lg font-medium text-gray-900 mb-2">暫無我參與嘅項目</h3>
              <p className="text-gray-500 mb-6">
                {hasAnyPermission(user, ['projects.create'])
                  ? '建立您的第一個項目,或聯絡 PM 邀請您加入'
                  : '聯絡 PM 邀請您加入項目'}
              </p>
              {hasAnyPermission(user, ['projects.create']) && (
                <Link
                  to="/projects/new"
                  className="btn-primary inline-flex items-center gap-2"
                >
                  <Plus size={20} />
                  新建項目
                </Link>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {projects.map((project) => (
                <Link
                  key={project.id}
                  to={`/projects/${project.id}`}
                  className="card p-6 hover:shadow-lg transition-shadow"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 rounded-lg bg-primary-100 flex items-center justify-center">
                      <FolderKanban className="text-primary-600" size={24} />
                    </div>
                    <span className={`badge ${getStatusColor(project.status)}`}>
                      {project.status === 'active'
                        ? '進行中'
                        : project.status === 'completed'
                        ? '已完成'
                        : '已歸檔'}
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">{project.name}</h3>
                  <p className="text-gray-500 text-sm mb-4 line-clamp-2">
                    {project.description || '暫無描述'}
                  </p>
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <Users size={16} />
                      {project.memberCount || 0} 人
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
