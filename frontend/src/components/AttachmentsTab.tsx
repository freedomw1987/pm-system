import { useEffect, useState, useRef } from 'react'
import { Upload, FileText, Image, File, Trash2, Download, Paperclip } from 'lucide-react'
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

  useEffect(() => {
    loadAttachments()
  }, [projectId])

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
    if (mimeType.startsWith('image/')) return <Image size={20} className="text-green-500" />
    if (mimeType.startsWith('text/') || mimeType.includes('document')) return <FileText size={20} className="text-blue-500" />
    return <File size={20} className="text-gray-400" />
  }

  if (isLoading) {
    return <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500" /></div>
  }

  return (
    <div>
      {/* Upload bar */}
      {canUpload && (
        <div className="mb-6 flex items-center gap-4">
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

      {/* Attachment grid */}
      {attachments.length === 0 ? (
        <div className="card p-12 text-center">
          <Paperclip size={48} className="mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">暫無附件</h3>
          <p className="text-gray-500">上傳圖片或文件，方便項目成員下載使用</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {attachments.map((att) => (
            <div key={att.id} className="card p-4 hover:shadow-md transition-shadow group">
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
                  <a
                    href={`/api/attachments/${att.id}`}
                    download={att.filename}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="下載"
                  >
                    <Download size={16} />
                  </a>
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
          ))}
        </div>
      )}
    </div>
  )
}