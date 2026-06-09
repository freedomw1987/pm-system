/**
 * AttachmentsTab — 項目附件列表
 *
 * 對應 bug fix 2026-06-09:
 *   - bug #5: 已上傳附件圖片未支持預覽,下載也失敗
 *     + 加 image preview(thumbnail grid 內 inline render)
 *     + 加 lightbox modal 點擊睇大圖
 *     + 下載 href 用 /api/attachments/<id>,filename encoding 已喺
 *       backend 改用 RFC 5987(filename*=UTF-8''...)
 *     + 用 fetch 拉一次 blob 再 trigger download,避免瀏覽器直接
 *       navigate 嘅 URL 丟失 Authorization header 嘅問題
 */
import { useEffect, useMemo, useState, useRef } from 'react'
import { Upload, FileText, Image as ImageIcon, File, Trash2, Download, Paperclip, X, Search } from 'lucide-react'
import { attachmentApi } from '../utils/api'

interface Attachment {
  id: string
  filename: string
  storedPath: string
  mimeType: string
  fileSize: number
  uploadedBy: { id: string; name: string }
  createdAt: string
}

interface AttachmentsTabProps {
  projectId: string
  canUpload?: boolean
}

export default function AttachmentsTab({ projectId, canUpload = true }: AttachmentsTabProps) {
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Lightbox state (RG-2026-06-09 bug #5)
  const [lightbox, setLightbox] = useState<{ url: string; filename: string } | null>(null)
  const [lightboxLoaded, setLightboxLoaded] = useState(false)
  const [lightboxError, setLightboxError] = useState(false)

  useEffect(() => {
    loadAttachments()
  }, [projectId])

  // Search box (client-side filter, 2026-06-09 David feedback C 延伸)
  // Filter by filename (case-insensitive contains).
  const [searchAtt, setSearchAtt] = useState('')
  const filteredAttachments = useMemo(() => {
    const q = searchAtt.trim().toLowerCase()
    if (!q) return attachments
    return attachments.filter(a => a.filename.toLowerCase().includes(q))
  }, [attachments, searchAtt])

  const loadAttachments = async () => {
    try {
      const res = await attachmentApi.listByProject(projectId)
      setAttachments(res.data.attachments)
    } catch (err) {
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setUploading(true)
    try {
      for (let i = 0; i < files.length; i++) {
        await attachmentApi.upload(files[i], 'project', projectId)
      }
      await loadAttachments()
    } catch (err) {
      console.error(err)
      alert('上傳失敗')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('確定要刪除這個附件嗎？')) return
    try {
      await attachmentApi.delete(id)
      setAttachments(prev => prev.filter(a => a.id !== id))
    } catch (err) {
      console.error(err)
      alert('刪除失敗')
    }
  }

  // Bug #5 fix: 用 fetch 帶 token 拉一次,再 trigger download
  // 避免 <a href> navigate 丟 Authorization header 嘅問題
  const handleDownload = async (att: Attachment) => {
    try {
      const token = localStorage.getItem('accessToken')
      const res = await fetch(`/api/attachments/${att.id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = att.filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      // 等多一格先 revoke,等 Safari 有機會處理
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (err) {
      console.error('Download failed:', err)
      alert('下載失敗,請稍後再試')
    }
  }

  const openLightbox = (att: Attachment) => {
    setLightboxLoaded(false)
    setLightboxError(false)
    setLightbox({ url: `/api/attachments/${att.id}?inline=1`, filename: att.filename })
  }

  const closeLightbox = () => {
    setLightbox(null)
    setLightboxLoaded(false)
    setLightboxError(false)
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return <ImageIcon size={20} className="text-green-500" />
    if (mimeType.startsWith('text/') || mimeType.includes('document')) return <FileText size={20} className="text-blue-500" />
    return <File size={20} className="text-gray-400" />
  }

  if (isLoading) {
    return <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500" /></div>
  }

  return (
    <div>
      {/* Upload bar + search box */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {canUpload && (
          <div className="flex items-center gap-4">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileSelect}
              className="hidden"
              id="attachment-upload"
            />
            <label
              htmlFor="attachment-upload"
              className="btn-primary flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Upload size={18} />
              {uploading ? '上傳中...' : '上傳附件'}
            </label>
            <span className="text-sm text-gray-500">支援圖片、文檔、壓縮包等格式</span>
          </div>
        )}
        <div className="relative w-full sm:w-72 sm:ml-auto">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={searchAtt}
            onChange={(e) => setSearchAtt(e.target.value)}
            placeholder="搜尋附件..."
            aria-label="搜尋附件"
            className="w-full pl-8 pr-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>

      {/* Attachment grid */}
      {attachments.length === 0 ? (
        <div className="card p-12 text-center">
          <Paperclip size={48} className="mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">暫無附件</h3>
          <p className="text-gray-500">上傳圖片或文件，方便項目成員下載使用</p>
        </div>
      ) : filteredAttachments.length === 0 ? (
        <div className="card p-12 text-center">
          <Search size={48} className="mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">無符合「{searchAtt}」嘅附件</h3>
          <p className="text-gray-500">試下其他關鍵字,或清空搜尋框</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAttachments.map((att) => {
            const isImage = att.mimeType.startsWith('image/')
            return (
              <div key={att.id} className="card p-4 hover:shadow-md transition-shadow group">
                {/* Image thumbnail preview (bug #5) */}
                {isImage ? (
                  <button
                    type="button"
                    onClick={() => openLightbox(att)}
                    className="block w-full mb-3 overflow-hidden rounded-lg bg-gray-100 aspect-video flex items-center justify-center"
                    title="點擊查看大圖"
                  >
                    <img
                      src={`/api/attachments/${att.id}?inline=1`}
                      alt={att.filename}
                      className="w-full h-full object-cover hover:scale-105 transition-transform"
                      loading="lazy"
                      onError={(e) => {
                        // fallback to icon if inline image fails
                        ;(e.target as HTMLImageElement).style.display = 'none'
                      }}
                    />
                  </button>
                ) : (
                  <div className="mb-3 flex items-center justify-center h-24 rounded-lg bg-gray-50">
                    {getFileIcon(att.mimeType)}
                  </div>
                )}

                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-1">
                    {getFileIcon(att.mimeType)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate text-sm" title={att.filename}>
                      {att.filename}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {formatFileSize(att.fileSize)} · {att.uploadedBy.name}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {formatDate(att.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleDownload(att)}
                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="下載"
                    >
                      <Download size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(att.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="刪除"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Lightbox modal (bug #5) */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={closeLightbox}
        >
          <div
            className="relative max-w-5xl w-full max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3 text-white">
              <p className="truncate font-medium">{lightbox.filename}</p>
              <button
                onClick={closeLightbox}
                className="p-2 hover:bg-white/10 rounded-lg"
                title="關閉"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 min-h-0 flex items-center justify-center">
              {!lightboxLoaded && !lightboxError && (
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-white" />
              )}
              {lightboxError ? (
                <p className="text-white">無法載入圖片</p>
              ) : (
                <img
                  src={lightbox.url}
                  alt={lightbox.filename}
                  className="max-w-full max-h-[80vh] object-contain"
                  onLoad={() => setLightboxLoaded(true)}
                  onError={() => { setLightboxLoaded(true); setLightboxError(true) }}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
