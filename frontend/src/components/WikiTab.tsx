import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Plus, FileText, Edit2, Trash2, BookOpen, Upload, CheckCircle, AlertCircle, X, Search, Loader2, Clock } from 'lucide-react'
import { wikiApi, documentApi, type BatchParseProgressEvent } from '../utils/api'
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
  // Sprint 21 US-21.4: streaming progress — 每個 file 嘅實時狀態
  // 用 object lookup(index -> status)而非 array,適合中途加 / 移除
  const [batchProgress, setBatchProgress] = useState<Record<number, {
    name: string
    status: 'pending' | 'processing' | 'success' | 'error' | 'duplicate'
    error?: string
    type?: string
    size?: number
  }>>({})
  const [batchSummary, setBatchSummary] = useState<{
    total: number
    successful: number
    failed: number
    wikiPagesCreated: number
  } | null>(null)
  const [batchError, setBatchError] = useState<string>('')
  const [batchConcurrency, setBatchConcurrency] = useState(3)
  // 統計「處理中」嘅數量(用嚟 render progress bar)
  const batchInFlight = useRef(0)

  useEffect(() => { loadPages() }, [projectId])

  // Search box (client-side filter, 2026-06-09 David feedback C 延伸)
  // Filter by title (case-insensitive contains).
  const [searchWiki, setSearchWiki] = useState('')
  const filteredPages = useMemo(() => {
    const q = searchWiki.trim().toLowerCase()
    if (!q) return pages
    return pages.filter(p => p.title.toLowerCase().includes(q))
  }, [pages, searchWiki])

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
    setBatchProgress({})
    setBatchSummary(null)
    setBatchError('')
    batchInFlight.current = 0
  }

  const handleBatchUpload = async () => {
    if (batchFiles.length === 0) return
    setBatchUploading(true)
    setBatchProgress({})
    setBatchSummary(null)
    setBatchError('')
    batchInFlight.current = 0

    const formData = new FormData()
    batchFiles.forEach(file => formData.append('files', file))
    formData.append('projectId', projectId)

    try {
      // Sprint 21 US-21.4: 用 SSE streaming,每個 file 完成即時更新 UI
      await documentApi.batchParseStream(
        formData,
        (event: BatchParseProgressEvent) => {
          if (event.type === 'start') {
            setBatchConcurrency(event.concurrency || 3)
            // 預先初始化所有 file 為 'pending',咁 UI 一開始就有完整 list
            const init: typeof batchProgress = {}
            event.fileNames?.forEach((name, idx) => {
              init[idx] = { name, status: 'pending' }
            })
            setBatchProgress(init)
          } else if (event.type === 'file') {
            setBatchProgress((prev) => ({
              ...prev,
              [event.index!]: {
                name: event.name || prev[event.index!]?.name || 'unknown',
                status: event.success
                  ? (event.duplicate ? 'duplicate' : 'success')
                  : 'error',
                error: event.error,
                type: event.fileType,
                size: event.size
              }
            }))
            // 統計有冇未完成嘅 file → 維持 progress bar
            if (event.success === false) {
              // 失敗都算 done
            }
          } else if (event.type === 'complete') {
            setBatchSummary({
              total: event.total || 0,
              successful: event.successful || 0,
              failed: event.failed || 0,
              wikiPagesCreated: event.wikiPagesCreated || 0
            })
            // Reload wiki pages so the new ones appear in the sidebar
            if ((event.wikiPagesCreated || 0) > 0) {
              loadPages()
            }
          } else if (event.type === 'error') {
            setBatchError(event.message || 'batch processing failed')
          }
        }
      )
    } catch (err: any) {
      console.error('Batch upload failed:', err)
      setBatchError(err?.message || '上傳過程中發生錯誤')
    } finally {
      setBatchUploading(false)
    }
  }

  // 重新打開 modal 時 reset 狀態(避免殘留上次嘅 progress)
  const closeBatchModal = () => {
    setShowBatchUpload(false)
    setBatchFiles([])
    setBatchProgress({})
    setBatchSummary(null)
    setBatchError('')
    batchInFlight.current = 0
  }

  const stripMarkdown = (md: string) =>
    md.replace(/[#*`>\[\]!]/g, '').replace(/\n+/g, ' ').trim().slice(0, 80) || '（無內容）'

  // Batch upload modal (Sprint 21 US-21.4: streaming progress UI)
  if (showBatchUpload) {
    const completedCount = Object.values(batchProgress).filter(
      (p) => p.status === 'success' || p.status === 'duplicate' || p.status === 'error'
    ).length
    const isInProgress = batchUploading && !batchSummary
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900">批量上傳文件（AI 解析）</h3>
          <button
            onClick={closeBatchModal}
            className="p-1 text-gray-400 hover:text-gray-600"
            disabled={isInProgress}
            title={isInProgress ? '處理中,唔可以關閉' : '關閉'}
          >
            <X size={20} />
          </button>
        </div>
        <div className="bg-blue-50 rounded-lg p-3 mb-4 text-sm">
          <p className="text-blue-700">
            支援格式:PDF、Word (.docx / .doc)、Excel (.xlsx / .xls)、Markdown (.md)、純文字 (.txt)
          </p>
          <p className="text-blue-600 mt-1">
            檔案數量無上限(每個最大 50MB),server 會以 {batchConcurrency} 個並發排隊處理,
            AI 會自動為每個文件建立 Wiki 頁面。
          </p>
          <p className="text-blue-600 mt-1">
            支援視覺模型的 AI(如 Claude、GPT-4o)可直接解析 PDF 中的圖片。
          </p>
        </div>
        <div className="mb-4">
          <input
            type="file"
            multiple
            // Sprint 21 US-21.1: 加 .doc / .xls / .txt 對齊 backend SUPPORTED_EXTENSIONS
            accept=".pdf,.doc,.docx,.xls,.xlsx,.md,.txt"
            onChange={handleBatchFilesChange}
            disabled={isInProgress}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100 disabled:opacity-50"
          />
        </div>
        {batchFiles.length > 0 && (
          <div className="mb-4">
            <p className="text-sm font-medium text-gray-700 mb-2">
              已選擇 {batchFiles.length} 個文件
              {batchSummary && ` · 成功 ${batchSummary.successful} / 失敗 ${batchSummary.failed}`}
            </p>
            {/* Progress bar — 已完成 / 總數 */}
            {Object.keys(batchProgress).length > 0 && (
              <div className="w-full bg-gray-200 rounded-full h-1.5 mb-3 overflow-hidden">
                <div
                  className="bg-primary-500 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${(completedCount / batchFiles.length) * 100}%` }}
                />
              </div>
            )}
            {/* 個別 file 進度 list(實時更新) */}
            <div className="max-h-64 overflow-y-auto border rounded-lg divide-y divide-gray-100">
              {Object.entries(batchProgress).map(([idx, p]) => (
                <div key={idx} className="p-3 flex items-center gap-3 text-sm">
                  {p.status === 'pending' && (
                    <Clock className="w-4 h-4 text-gray-400 shrink-0" />
                  )}
                  {p.status === 'success' && (
                    <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                  )}
                  {p.status === 'duplicate' && (
                    <CheckCircle className="w-4 h-4 text-yellow-500 shrink-0" />
                  )}
                  {p.status === 'error' && (
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                  )}
                  <span className="font-medium flex-1 truncate">{p.name}</span>
                  <span className="text-xs text-gray-400 shrink-0">
                    {p.status === 'pending' && '等待中'}
                    {p.status === 'success' && '已建立 Wiki'}
                    {p.status === 'duplicate' && '已存在(同名)'}
                    {p.status === 'error' && (p.error || '失敗')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        {batchError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-100 text-red-700 text-sm rounded-lg">
            <strong>批次錯誤:</strong> {batchError}
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
                <Loader2 size={16} className="animate-spin" />
                處理中... ({completedCount}/{batchFiles.length})
              </>
            ) : (
              <>
                <Upload size={16} />
                開始上傳並解析
              </>
            )}
          </button>
          <button
            onClick={closeBatchModal}
            disabled={isInProgress}
            className="px-5 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            {batchSummary ? '完成' : '取消'}
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
        <div className="flex items-center justify-between mb-3">
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

        {/* Search box (2026-06-09) */}
        <div className="relative mb-3">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={searchWiki}
            onChange={(e) => setSearchWiki(e.target.value)}
            placeholder="搜尋頁面..."
            aria-label="搜尋 Wiki 頁面"
            className="w-full pl-8 pr-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
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
        ) : filteredPages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
            <Search size={28} className="text-gray-400 mb-2" />
            <p className="text-sm text-gray-500">無符合「{searchWiki}」嘅頁面</p>
            <p className="text-xs text-gray-400 mt-1">試下其他關鍵字,或清空搜尋框</p>
          </div>
        ) : (
          <div className="flex-1 overflow-auto space-y-1">
            {filteredPages.map((page) => (
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