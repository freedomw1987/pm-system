import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Search, Plus, FileText, Tag, ChevronRight, X, Upload, CheckCircle, AlertCircle } from 'lucide-react'
import { documentApi } from '../utils/api'

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
  const [showBatchUpload, setShowBatchUpload] = useState(false)
  const [batchFiles, setBatchFiles] = useState<File[]>([])
  const [batchUploading, setBatchUploading] = useState(false)
  const [batchResults, setBatchResults] = useState<any[]>([])

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

  const handleBatchFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : []
    setBatchFiles(files)
    setBatchResults([])
  }

  const handleBatchUpload = async () => {
    if (!selectedProject || batchFiles.length === 0) return
    setBatchUploading(true)
    setBatchResults([])

    const formData = new FormData()
    batchFiles.forEach(file => formData.append('files', file))
    formData.append('projectId', selectedProject)

    try {
      const res = await documentApi.batchParse(formData)
      setBatchResults(res.data.results || [])
      if (res.data.wikiPagesCreated > 0) {
        fetchPages()
      }
    } catch (err) {
      console.error('Batch upload failed:', err)
      setBatchResults([{ name: '上傳失敗', success: false, error: '上傳過程中發生錯誤' }])
    } finally {
      setBatchUploading(false)
    }
  }

  // Sprint 21 US-21.3: user pressed "更新此頁" on a duplicate — call PUT
  // /wikis/:id with the existing page's id. The latest parsed content is
  // already in the batch result (we keep the structured LLM analysis).
  const handleReplaceWikiPage = async (result: any) => {
    if (!result?.existingPage?.id) return
    const replaceId = result.existingPage.id
    const newTitle = result.existingPage.title
    // We have only the existing page's title in the result; for the content
    // we use the original parsedTextPreview. To avoid losing detail, the
    // backend's PUT only updates title (since the user is replacing in
    // place). A more thorough flow would re-run parse+analyze, but that
    // costs another LLM call — out of scope for Sprint 21.
    const newContent = result.parsedTextPreview || result.analysis?.wikiContent || result.analysis?.content || ''
    const tags: string[] = result.analysis?.tags || ['ai-parsed']

    try {
      const res = await fetch(`/api/wikis/${replaceId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          title: newTitle,
          content: newContent,
          tags
        })
      })
      if (res.ok) {
        // Remove the duplicate row, optionally re-fetch
        setBatchResults(prev => prev.map(r =>
          r === result ? { ...r, duplicate: false, replaced: true, wikiPage: { id: replaceId, title: newTitle } } : r
        ))
        fetchPages()
      } else {
        const data = await res.json().catch(() => ({}))
        alert(`更新失敗: ${data?.error?.message || res.statusText}`)
      }
    } catch (err) {
      console.error('Replace failed:', err)
      alert('更新失敗,請稍後再試')
    }
  }

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">知識庫</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowBatchUpload(s => !s)}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
          >
            <Upload size={18} />
            批量上傳
          </button>
          <button
            onClick={() => setShowCreate(s => !s)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600"
          >
            <Plus size={18} />
            新增頁面
          </button>
        </div>
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

      {/* Batch upload form */}
      {showBatchUpload && (
        <div className="mb-6 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold mb-4">批量上傳文件（AI 解析）</h3>
          {!selectedProject && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-amber-800 mb-4">
              請先選擇項目後再上傳文件
            </div>
          )}
          <div className="bg-blue-50 rounded-lg p-3 mb-4 text-sm">
            <p className="font-medium text-blue-800 mb-1">支援格式</p>
            <p className="text-blue-700">PDF、Word (.docx / .doc)、Excel (.xlsx / .xls)、Markdown (.md)、純文字 (.txt)</p>
            <p className="text-blue-600 mt-1">最多 20 個文件，每個最大 50MB</p>
            <p className="text-blue-600 mt-1 text-xs">ℹ️ 同一項目內已有同名 Wiki 時,會自動偵測並提示您確認是否更新</p>
          </div>
          <div className="mb-4">
            <input
              type="file"
              multiple
              accept=".pdf,.docx,.xlsx,.md,.doc,.xls,.txt"
              onChange={handleBatchFilesChange}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
            />
          </div>
          {batchFiles.length > 0 && (
            <div className="mb-4">
              <p className="text-sm font-medium text-gray-700 mb-2">已選擇 {batchFiles.length} 個文件：</p>
              <div className="flex flex-wrap gap-2">
                {batchFiles.map((file, i) => (
                  <span key={i} className="px-3 py-1 bg-gray-100 rounded-full text-sm">{file.name}</span>
                ))}
              </div>
            </div>
          )}
          {batchResults.length > 0 && (
            <div className="mb-4 max-h-60 overflow-y-auto border rounded-lg">
              <div className="p-2 bg-gray-50 border-b sticky top-0">
                <p className="text-sm font-medium">
                  結果：{batchResults.filter(r => r.success).length}/{batchResults.length} 成功
                  {(() => {
                    const created = batchResults[0]?.wikiPagesCreated ?? 0
                    const dupes = batchResults.filter(r => r.success && r.duplicate).length
                    return (
                      <>
                        {created > 0 && `，已建立 ${created} 個 Wiki 頁面`}
                        {dupes > 0 && `，${dupes} 個檔案偵測到同項目已有同名 Wiki`}
                      </>
                    )
                  })()}
                </p>
              </div>
              <div className="divide-y divide-gray-100">
                {batchResults.map((r, i) => (
                  <div key={i} className="p-3 flex items-center gap-3 text-sm">
                    {r.success ? (
                      r.duplicate ? (
                        <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                      ) : (
                        <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                      )
                    ) : (
                      <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <span className="font-medium">{r.name}</span>
                      {r.duplicate && r.existingPage && (
                        <div className="text-xs text-amber-700 mt-1">
                          ⚠️ 同項目已有同名 Wiki:「{r.existingPage.title}」
                          (更新於 {new Date(r.existingPage.updatedAt).toLocaleDateString('zh-HK')})
                        </div>
                      )}
                      {!r.success && <span className="text-red-500 text-xs block">{r.error}</span>}
                    </div>
                    {r.duplicate && r.existingPage && (
                      <button
                        onClick={() => handleReplaceWikiPage(r)}
                        className="px-3 py-1 bg-amber-500 text-white text-xs rounded hover:bg-amber-600"
                      >
                        更新此頁
                      </button>
                    )}
                    {r.success && r.wikiPage && !r.duplicate && (
                      <Link to={`/wikis/${r.wikiPage.id}`} className="text-primary-600 text-xs hover:underline">
                        查看 →
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-3">
            <button
              onClick={handleBatchUpload}
              disabled={batchUploading || !selectedProject || batchFiles.length === 0}
              className="px-5 py-2.5 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 flex items-center gap-2"
            >
              {batchUploading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                  處理中...
                </>
              ) : (
                <>
                  <Upload size={16} />
                  開始上傳並解析
                </>
              )}
            </button>
            <button
              onClick={() => { setShowBatchUpload(false); setBatchFiles([]); setBatchResults([]) }}
              className="px-5 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              取消
            </button>
          </div>
        </div>
      )}

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