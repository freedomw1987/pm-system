import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Search, Plus, FileText, Tag, ChevronRight, X } from 'lucide-react'

interface WikiPage {
  id: string
  title: string
  content: string
  tags: string[]
  project: { id: string; name: string }
  createdBy: { id: string; name: string }
  updatedAt: string
}

interface Project {
  id: string
  name: string
}

export default function WikiPage() {
  const { projectId } = useParams()
  const [pages, setPages] = useState<WikiPage[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState(projectId || '')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newTags, setNewTags] = useState('')
  const [newContent, setNewContent] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    fetchProjects()
  }, [])

  useEffect(() => {
    fetchPages()
  }, [selectedProject, search])

  const fetchProjects = async () => {
    const res = await fetch('/api/projects', {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    })
    const data = await res.json()
    setProjects(data.projects || [])
  }

  const fetchPages = async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (selectedProject) params.set('projectId', selectedProject)
    if (search) params.set('search', search)
    const res = await fetch(`/api/wikis?${params}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    })
    const data = await res.json()
    setPages(data.pages || [])
    setLoading(false)
  }

  const handleCreate = async () => {
    if (!selectedProject || !newTitle.trim()) return
    setCreating(true)
    const tags = newTags.split(',').map(t => t.trim()).filter(Boolean)
    const res = await fetch('/api/wikis', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({
        projectId: selectedProject,
        title: newTitle.trim(),
        content: newContent,
        tags
      })
    })
    const data = await res.json()
    if (data.page) {
      setPages(p => [data.page, ...p])
      setShowCreate(false)
      setNewTitle('')
      setNewTags('')
      setNewContent('')
    }
    setCreating(false)
  }

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">知識庫</h1>
        <button
          onClick={() => setShowCreate(s => !s)}
          className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600"
        >
          <Plus size={18} />
          新增頁面
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <div className="flex-1 relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="搜尋標題、內容或標籤..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
              <X size={16} />
            </button>
          )}
        </div>
        <select
          value={selectedProject}
          onChange={e => setSelectedProject(e.target.value)}
          className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
        >
          <option value="">全部項目</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="mb-6 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold mb-4">新增 Wiki 頁面</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">標題 *</label>
              <input
                type="text"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                placeholder="頁面標題"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">內容</label>
              <textarea
                value={newContent}
                onChange={e => setNewContent(e.target.value)}
                rows={6}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                placeholder="Wiki 內容（支援 Markdown）"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">標籤</label>
              <input
                type="text"
                value={newTags}
                onChange={e => setNewTags(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                placeholder="標籤1, 標籤2, 標籤3"
              />
              <p className="mt-1 text-sm text-gray-500">多個標籤用逗號分隔</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleCreate}
                disabled={creating || !selectedProject || !newTitle.trim()}
                className="px-5 py-2.5 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50"
              >
                {creating ? '建立中...' : '建立'}
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="px-5 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pages list */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">載入中...</div>
      ) : pages.length === 0 ? (
        <div className="text-center py-12">
          <FileText size={48} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500">尚無 Wiki 頁面</p>
          <p className="text-sm text-gray-400 mt-1">切換到項目並新增頁面來開始使用</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pages.map(page => (
            <div key={page.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <Link to={`/wikis/${page.id}`} className="text-lg font-semibold text-gray-900 hover:text-primary-600">
                    {page.title}
                  </Link>
                  <div className="flex items-center gap-3 mt-2 text-sm text-gray-500">
                    <span className="px-2 py-0.5 bg-gray-100 rounded">{page.project.name}</span>
                    <span>由 {page.createdBy.name}</span>
                    <span>{new Date(page.updatedAt).toLocaleDateString('zh-HK')}</span>
                  </div>
                  {page.tags.length > 0 && (
                    <div className="flex gap-2 mt-3">
                      {page.tags.map(tag => (
                        <span key={tag} className="flex items-center gap-1 px-2 py-1 bg-primary-50 text-primary-600 rounded text-sm">
                          <Tag size={12} />
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  {page.content && (
                    <p className="mt-3 text-gray-600 line-clamp-2">{page.content}</p>
                  )}
                </div>
                <ChevronRight size={20} className="text-gray-400 flex-shrink-0 ml-4" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}