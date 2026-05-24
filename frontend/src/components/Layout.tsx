import { useState } from 'react'
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { LayoutDashboard, FolderKanban, ListTodo, Bug, Clock, BarChart3, Users, LogOut, Menu, X, FileText, ShieldCheck, ChevronLeft, ChevronRight, Settings, BookOpen } from 'lucide-react'
import clsx from 'clsx'

const navItems: Array<{ path: string; icon: any; label: string; permissions: string[]; adminOnly?: boolean }> = [
  { path: '/', icon: LayoutDashboard, label: '儀表板', permissions: [] },
  { path: '/projects', icon: FolderKanban, label: '項目', permissions: ['projects.view', 'projects.create'] },
  { path: '/my-requirements', icon: FileText, label: '我的需求', permissions: ['requirements.view'] },
  { path: '/my-tasks', icon: ListTodo, label: '我的任務', permissions: ['tasks.view'] },
  { path: '/my-bugs', icon: Bug, label: '我的缺陷', permissions: ['bugs.view'] },
  { path: '/work-logs', icon: Clock, label: '工作時數', permissions: ['worklogs.view'] },
  { path: '/reports', icon: BarChart3, label: '報表', permissions: ['reports.view'] },
  { path: '/wiki', icon: BookOpen, label: '知識庫', permissions: [] },
  { path: '/users', icon: Users, label: '用戶管理', permissions: ['users.view'] },
  { path: '/roles', icon: ShieldCheck, label: '角色權限', permissions: ['roles.view'] },
  { path: '/settings', icon: Settings, label: 'AI 設定', permissions: [], adminOnly: true },
]

/**
 * Get user permissions from token or localStorage user object.
 * Permissions are stored in localStorage after login as userData.permissions.
 */
function getUserPermissions(user: any): string[] {
  if (!user) return []
  if (user.permissions && Array.isArray(user.permissions)) return user.permissions
  return []
}

/**
 * Check if user has at least one of the required permissions.
 * If permissions array is empty, always show (no permission required).
 */
function hasAnyPermission(user: any, permissions: string[]): boolean {
  if (!permissions || permissions.length === 0) return true
  if (!user) return false
  if (user.role === 'admin') return true
  const userPerms = getUserPermissions(user)
  return permissions.some(p => userPerms.includes(p))
}

export default function Layout() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem('sidebar-collapsed') === 'true'
  })

  const handleCollapse = () => {
    const newVal = !collapsed
    setCollapsed(newVal)
    localStorage.setItem('sidebar-collapsed', String(newVal))
  }

  const filteredNavItems = navItems.filter(item => {
  if (item.adminOnly && user?.role !== 'admin') return false
  return hasAnyPermission(user, item.permissions)
})

  return (
    <div className="min-h-screen flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={clsx(
        "fixed lg:static inset-y-0 left-0 z-50 bg-white border-r border-gray-200 flex flex-col transform transition-all duration-200 ease-in-out lg:transform-none",
        sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        collapsed ? "lg:w-16" : "lg:w-64"
      )}>
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          {!collapsed && <h1 className="text-xl font-bold text-primary-500">PM System</h1>}
          <div className="flex items-center gap-2 ml-auto">
            <button 
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-2 hover:bg-gray-100 rounded-lg"
            >
              <X size={20} />
            </button>
            <button 
              onClick={handleCollapse}
              className="hidden lg:flex p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-700 transition-colors"
              title={collapsed ? '展開側邊欄' : '收起側邊欄'}
            >
              {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
            </button>
          </div>
        </div>

        <nav className="flex-1 p-2 lg:p-4 space-y-1 overflow-y-auto">
          {filteredNavItems.map((item) => {
            const Icon = item.icon
            const isActive = location.pathname === item.path || 
              (item.path !== '/' && location.pathname.startsWith(item.path))
            
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                title={collapsed ? item.label : undefined}
                className={clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                  isActive
                    ? 'bg-primary-50 text-primary-600'
                    : 'text-gray-600 hover:bg-gray-50',
                  collapsed ? 'lg:justify-center lg:px-0' : ''
                )}
              >
                <Icon size={20} className="flex-shrink-0" />
                {!collapsed && <span className="font-medium">{item.label}</span>}
              </Link>
            )
          })}
        </nav>

        <div className="p-2 lg:p-4 border-t border-gray-200">
          {!collapsed && (
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                <span className="text-primary-600 font-medium">
                  {user?.name?.charAt(0) || 'U'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate">{user?.name}</p>
                <p className="text-sm text-gray-500 truncate">{user?.email}</p>
              </div>
            </div>
          )}
          <button
            onClick={() => { logout(); navigate('/login') }}
            className={clsx(
              "flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors",
              collapsed ? "justify-center p-2 w-full" : ""
            )}
          >
            <LogOut size={18} />
            {!collapsed && <span>登出</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 bg-gray-100 overflow-auto">
        {/* Mobile header with hamburger */}
        <div className="lg:hidden sticky top-0 bg-white border-b border-gray-200 z-30">
          <div className="flex items-center p-4">
            <button 
              onClick={() => setSidebarOpen(true)}
              className="p-2 hover:bg-gray-100 rounded-lg mr-3"
            >
              <Menu size={24} />
            </button>
            <span className="font-bold text-primary-500">PM System</span>
          </div>
        </div>

        <div className="p-4 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}