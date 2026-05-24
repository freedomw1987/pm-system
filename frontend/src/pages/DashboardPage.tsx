import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FolderKanban, Plus, Users } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { projectApi } from '../utils/api'
import type { Project } from '../types'

export default function DashboardPage() {
  const { user } = useAuth()
  const [projects, setProjects] = useState<Project[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadProjects()
  }, [])

  const loadProjects = async () => {
    try {
      const response = await projectApi.list()
      setProjects(response.data.projects)
    } catch (err) {
      console.error('Failed to load projects:', err)
    } finally {
      setIsLoading(false)
    }
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
          <p className="text-gray-500 mt-1">歡迎回來，{user?.name}</p>
        </div>
        {(user?.role === 'admin' || user?.role === 'pm') && (
          <Link to="/projects/new" className="btn-primary flex items-center gap-2 justify-center sm:justify-start w-full sm:w-auto">
            <Plus size={20} />
            <span>新建項目</span>
          </Link>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500"></div>
        </div>
      ) : projects.length === 0 ? (
        <div className="card p-12 text-center">
          <FolderKanban size={48} className="mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">暫無項目</h3>
          <p className="text-gray-500 mb-6">建立您的第一個項目開始管理工作</p>
          {(user?.role === 'admin' || user?.role === 'pm') && (
            <Link to="/projects/new" className="btn-primary inline-flex items-center gap-2">
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
                  {project.status === 'active' ? '進行中' : 
                   project.status === 'completed' ? '已完成' : '已歸檔'}
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
    </div>
  )
}