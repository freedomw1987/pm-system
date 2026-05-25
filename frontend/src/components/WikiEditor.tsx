import { useState, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Save, X, Eye, Edit2, Upload, FileUp } from 'lucide-react'
import { attachmentApi, documentApi } from '../utils/api'

interface WikiPage {
  id: string
  title: string
  content: string
  order: number
  createdBy?: { id: string; name: string }
  createdAt: string
}

interface WikiEditorProps {
  page?: WikiPage | null
  projectId: string
  onSave: (title: string, content: string) => Promise<void>
  onCancel: () => void
}

export default function WikiEditor({ page, projectId, onSave, onCancel }: WikiEditorProps) {
  const [title, setTitle] = useState(page?.title || '')
  const [content, setContent] = useState(page?.content || '')
  const [isSaving, setIsSaving] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [isParsing, setIsParsing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const docInputRef = useRef<HTMLInputElement>(null)

  const handleSave = async () => {
    if (!title.trim()) return
    setIsSaving(true)
    try {
      await onSave(title.trim(), content)
    } finally {
      setIsSaving(false)
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    try {
      const res = await attachmentApi.upload(file, 'wiki', projectId)
      const { id, filename, mimeType } = res.data

      // Insert image markdown if it's an image, otherwise insert a link
      const isImage = mimeType.startsWith('image/')
      const insertion = isImage
        ? `![${filename}](/api/attachments/${id})`
        : `[${filename}](/api/attachments/${id})`

      setContent(prev => prev + `\n\n${insertion}\n`)
    } catch (err) {
      console.error(err)
      alert('上傳失敗')
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDocImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsParsing(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('projectId', projectId)

      const res = await documentApi.parse(formData)
      const { wikiPage, analysis } = res.data

      if (wikiPage) {
        setTitle(wikiPage.title)
        setContent(wikiPage.content)
      } else if (analysis?.wikiContent) {
        setTitle(analysis.title || title)
        setContent(analysis.wikiContent)
      } else if (analysis?.content) {
        setTitle(analysis.title || title)
        setContent(analysis.content)
      }
    } catch (err: any) {
      console.error(err)
      const msg = err?.response?.data?.error?.message || '文件解析失敗，請確認 AI 設定已配置'
      alert(msg)
    } finally {
      setIsParsing(false)
      if (docInputRef.current) docInputRef.current.value = ''
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="頁面標題..."
          className="text-2xl font-bold text-gray-900 bg-transparent border-none outline-none w-full placeholder-gray-400"
          autoFocus
        />
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-200">
        <span className="text-xs text-gray-500 uppercase tracking-wide">Markdown</span>
        <div className="flex-1" />
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          id="wiki-upload"
          onChange={handleFileUpload}
        />
        <label
          htmlFor="wiki-upload"
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-primary-600 cursor-pointer transition-colors"
        >
          <Upload size={14} />
          {isUploading ? '上傳中...' : '上傳圖片/附件'}
        </label>

        <div className="w-px h-4 bg-gray-300 mx-1" />

        <input
          ref={docInputRef}
          type="file"
          className="hidden"
          id="doc-import"
          accept=".docx,.md,.xlsx,.pdf"
          onChange={handleDocImport}
        />
        <label
          htmlFor="doc-import"
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-primary-600 cursor-pointer transition-colors"
        >
          <FileUp size={14} />
          {isParsing ? '解析中...' : '導入 Word/Excel/PDF'}
        </label>
        <a
          href="https://www.markdownguide.org/cheat-sheet/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary-600 hover:text-primary-700 hover:underline"
        >
          Markdown 語法參考
        </a>
      </div>

      {/* Editor + Preview split */}
      <div className="flex-1 grid grid-cols-2 gap-4 min-h-0" style={{ height: 'calc(100vh - 380px)' }}>
        {/* Markdown Editor */}
        <div className="flex flex-col">
          <div className="flex items-center gap-1 mb-2">
            <Edit2 size={14} className="text-gray-400" />
            <span className="text-sm font-medium text-gray-600">編輯</span>
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="使用 Markdown 編寫內容...

# 標題
## 二級標題

**粗體** 和 *斜體*

- 列表項目
- 列表項目

[連結文字](URL)

```
代碼區塊
```"
            className="flex-1 input-field resize-none font-mono text-sm"
            style={{ minHeight: '300px' }}
          />
        </div>

        {/* Preview */}
        <div className="flex flex-col">
          <div className="flex items-center gap-1 mb-2">
            <Eye size={14} className="text-gray-400" />
            <span className="text-sm font-medium text-gray-600">預覽</span>
          </div>
          <div className="flex-1 overflow-auto p-4 bg-white rounded-lg border border-gray-200">
            {content ? (
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
                prose-table:text-sm
                prose-table:table-fixed prose-table:w-full
                prose-thead:bg-gray-100 prose-thead:font-semibold
                prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:border prose-th:border-gray-300
                prose-td:px-3 prose-td:py-2 prose-td:border prose-td:border-gray-200
                prose-tr:border prose-tr:border-gray-200">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {content}
                </ReactMarkdown>
              </div>
            ) : (
              <p className="text-gray-400 text-sm italic">左側編輯 Markdown，右側即時預覽</p>
            )}
          </div>
        </div>
      </div>

      {/* Footer actions */}
      <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-gray-200">
        <button onClick={onCancel} className="btn-secondary flex items-center gap-2">
          <X size={16} /> 取消
        </button>
        <button
          onClick={handleSave}
          disabled={isSaving || !title.trim()}
          className="btn-primary flex items-center gap-2"
        >
          <Save size={16} />
          {isSaving ? '儲存中...' : '儲存'}
        </button>
      </div>
    </div>
  )
}