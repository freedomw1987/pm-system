import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Plus, FileText, Edit2, Trash2, BookOpen, Upload, CheckCircle, AlertCircle, X } from 'lucide-react'
import { wikiApi, documentApi } from '../utils/api'
import WikiEditor from './WikiEditor'

interface WikiPage {
  id: string
  projectId: string
  title: string
  content: string
  order: number
  createdBy?: { id: string; name: string }
  createdAt: string
  updatedAt: string
}

interface WikiTabProps {
  projectId: string
}

export default function WikiTab({ projectId }: WikiTabProps) {
  const [pages, setPages] = useState<WikiPage[]>([])
  const [selectedPage, setSelectedPage] = useState<WikiPage | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [showBatchUpload, setShowBatchUpload] = useState(false)
  const [batchFiles, setBatchFiles] = useState<File[]>([])
  const [batchUploading, setBatchUploading] = useState(false)
  const [batchResults, setBatchResults] = useState<any[]>([])

  useEffect(() => { loadPages() }, [projectId])

  const loadPages = async () => {
    setIsLoading(true)
    try {
      const res = await wikiApi.list(projectId)
      setPages(res.data.pages)
    } catch (err) {
      console.error('Failed to load wiki pages:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreate = async (title: string, content: string) => {
    const res = await wikiApi.create({ projectId, title, content })
    setPages([...pages, res.data.page])
    setSelectedPage(res.data.page)
    setIsCreating(false)
    setIsEditing(false)
  }

  const handleUpdate = async (title: string, content: string) => {
    if (!selectedPage) return
    const res = await wikiApi.update(selectedPage.id, { title, content })
    setPages(pages.map(p => p.id === selectedPage.id ? res.data.page : p))
    setSelectedPage(res.data.page)
    setIsEditing(false)
  }

  const handleDelete = async (pageId: string) => {
    if (!confirm('確定要刪除這個頁面嗎？')) return
    await wikiApi.delete(pageId)
    setPages(pages.filter(p => p.id !== pageId))
    if (selectedPage?.id === pageId) {
      setSelectedPage(null)
      setIsEditing(false)
    }
  }

  const handleBatchFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : []
    setBatchFiles(files)
    setBatchResults([])
  }

  const handleBatchUpload = async () => {
    if (batchFiles.length === 0) return
    setBatchUploading(true)
    setBatchResults([])

    const formData = new FormData()
    batchFiles.forEach(file => formData.append('files', file))
    formData.append('projectId', projectId)

    try {
      const res = await documentApi.batchParse(formData)
      const results = res.data.results || []
      setBatchResults(results)
      if (res.data.wikiPagesCreated > 0) {
        loadPages()
      }
      // Auto-close and return to wiki list after 2 seconds
      setTimeout(() => {
        setShowBatchUpload(false)
        setBatchFiles([])
        setBatchResults([])
      }, 2000)
    } catch (err) {
      console.error('Batch upload failed:', err)
      setBatchResults([{ name: '上傳失敗', success: false, error: '上傳過程中發生錯誤' }])
    } finally {
      setBatchUploading(false)
    }
  }

  const stripMarkdown = (md: string) =>
    md.replace(/[#*`>\[\]!]/g, '').replace(/\n+/g, ' ').trim().slice(0, 80) || '（無內容）'

  // Batch upload modal
  if (showBatchUpload) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900">批量上傳文件（AI 解析）</h3>
          <button
            onClick={() => { setShowBatchUpload(false); setBatchFiles([]); setBatchResults([]) }}
            className="p-1 text-gray-400 hover:text-gray-600"
          >
            <X size={20} />
          </button>
        </div>
        <div className="bg-blue-50 rounded-lg p-3 mb-4 text-sm">
          <p className="text-blue-700">支援格式：PDF、Word (.docx)、Excel (.xlsx)、Markdown (.md)</p>
          <p className="text-blue-600 mt-1">最多 20 個文件，每個最大 50MB。AI 會自動為每個文件建立 Wiki 頁面。</p>
          <p className="text-blue-600 mt-1">支援視覺模型的 AI（如 Claude、GPT-4o）可直接解析 PDF 中的圖片。</p>
        </div>
        <div className="mb-4">
          <input
            type="file"
            multiple
            accept=".pdf,.docx,.xlsx,.md"
            onChange={handleBatchFilesChange}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
          />
        </div>
        {batchFiles.length > 0 && (
          <div className="mb-4">
            <p className="text-sm font-medium text-gray-700 mb-2">已選擇 {batchFiles.length} 個文件：</p>
            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
              {batchFiles.map((file, i) => (
                <span key={i} className="px-3 py-1 bg-gray-100 rounded-full text-sm">{file.name}</span>
              ))}
            </div>
          </div>
        )}
        {batchResults.length > 0 && (
          <div className="mb-4 max-h-48 overflow-y-auto border rounded-lg">
            <div className="p-2 bg-gray-50 border-b sticky top-0">
              <p className="text-sm font-medium">
                結果：{batchResults.filter(r => r.success).length}/{batchResults.length} 成功
              </p>
            </div>
            <div className="divide-y divide-gray-100">
              {batchResults.map((r, i) => (
                <div key={i} className="p-3 flex items-center gap-3 text-sm">
                  {r.success ? (
                    <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                  )}
                  <span className="font-medium">{r.name}</span>
                  {!r.success && <span className="text-red-500 text-xs">{r.error}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="flex gap-3">
          <button
            onClick={handleBatchUpload}
            disabled={batchUploading || batchFiles.length === 0}
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
    )
  }

  if (isEditing || isCreating) {
    return (
      <div className="h-full">
        <WikiEditor
          page={isCreating ? null : selectedPage}
          projectId={projectId}
          onSave={isCreating ? handleCreate : handleUpdate}
          onCancel={() => { setIsEditing(false); setIsCreating(false) }}
        />
      </div>
    )
  }

  return (
    <div className="flex gap-6 h-full" style={{ height: 'calc(100vh - 280px)' }}>
      {/* Left sidebar - page list */}
      <div className="w-72 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">頁面列表</h3>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowBatchUpload(true)}
              className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
              title="批量上傳文件"
            >
              <Upload size={18} />
            </button>
            <button
              onClick={() => { setIsCreating(true); setSelectedPage(null) }}
              className="p-1.5 text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
              title="新建頁面"
            >
              <Plus size={18} />
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-primary-500" />
          </div>
        ) : pages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
            <BookOpen size={32} className="text-gray-400 mb-2" />
            <p className="text-sm text-gray-500 mb-3">尚無 Wiki 頁面</p>
            <button
              onClick={() => setIsCreating(true)}
              className="text-sm text-primary-600 hover:text-primary-700 hover:underline"
            >
              建立第一頁
            </button>
          </div>
        ) : (
          <div className="flex-1 overflow-auto space-y-1">
            {pages.map((page) => (
              <div
                key={page.id}
                className={`group flex items-start gap-2 p-3 rounded-lg cursor-pointer transition-colors ${
                  selectedPage?.id === page.id
                    ? 'bg-primary-50 border border-primary-200'
                    : 'hover:bg-gray-50 border border-transparent'
                }`}
                onClick={() => setSelectedPage(page)}
              >
                <FileText size={16} className={`mt-0.5 flex-shrink-0 ${selectedPage?.id === page.id ? 'text-primary-600' : 'text-gray-400'}`} />
                <div className="flex-1 min-w-0">
                  <p className={`font-medium text-sm truncate ${selectedPage?.id === page.id ? 'text-primary-700' : 'text-gray-900'}`}>
                    {page.title}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">
                    {stripMarkdown(page.content)}
                  </p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => { e.stopPropagation(); setSelectedPage(page); setIsEditing(true) }}
                    className="p-1 text-gray-400 hover:text-blue-600 rounded"
                    title="編輯"
                  >
                    <Edit2 size={13} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(page.id) }}
                    className="p-1 text-gray-400 hover:text-red-600 rounded"
                    title="刪除"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right content - view page */}
      <div className="flex-1 bg-white rounded-xl border border-gray-200 overflow-hidden">
        {selectedPage ? (
          <div className="h-full flex flex-col">
            {/* Page header */}
            <div className="flex items-start justify-between p-6 border-b border-gray-100">
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-bold text-gray-900 mb-1">{selectedPage.title}</h2>
                <p className="text-xs text-gray-400">
                  創建者：{selectedPage.createdBy?.name || '-'} ·
                  {new Date(selectedPage.updatedAt).toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              </div>
              <button
                onClick={() => setIsEditing(true)}
                className="ml-4 btn-secondary flex items-center gap-2 text-sm py-1.5"
              >
                <Edit2 size={14} /> 編輯
              </button>
            </div>

            {/* Page content */}
            <div className="flex-1 overflow-auto p-6">
              {selectedPage.content ? (
                <div className="prose prose-sm max-w-none
                  prose-headings:font-bold prose-headings:text-gray-900
                  prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg
                  prose-p:text-gray-700 prose-p:leading-relaxed
                  prose-a:text-primary-600 prose-a:no-underline hover:prose-a:underline
                  prose-code:bg-gray-200 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm
                  prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-pre:rounded-lg
                  prose-ul:text-gray-700 prose-ol:text-gray-700
                  prose-li:my-1
                  prose-blockquote:border-l-4 prose-blockquote:border-primary-400 prose-blockquote:pl-4 prose-blockquote:text-gray-600
                  prose-strong:text-gray-900
                  prose-table:text-sm prose-table:table-fixed prose-table:w-full
                  prose-thead:bg-gray-100 prose-thead:font-semibold
                  prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:border prose-th:border-gray-300
                  prose-td:px-3 prose-td:py-2 prose-td:border prose-td:border-gray-200
                  prose-tr:border prose-tr:border-gray-200">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {selectedPage.content}
                  </ReactMarkdown>
                </div>
              ) : (
                <div className="text-center py-12 text-gray-400">
                  <p>此頁面尚未有任何內容</p>
                  <button onClick={() => setIsEditing(true)} className="mt-2 text-sm text-primary-600 hover:underline">
                    點此編輯
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center p-8">
            <BookOpen size={48} className="text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-700 mb-2">選擇或建立 Wiki 頁面</h3>
            <p className="text-sm text-gray-400 mb-4">左側選擇頁面查看內容，或建立新頁面</p>
            <button
              onClick={() => setIsCreating(true)}
              className="btn-primary flex items-center gap-2"
            >
              <Plus size={16} /> 新建頁面
            </button>
          </div>
        )}
      </div>
    </div>
  )
}