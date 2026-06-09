/**
 * RichTextEditor — Tiptap-based(2026-06-09 重寫,跟 RB-7 嘅 image-paste 需求)
 *
 * 對應 bug fix:
 *   - bug #6(US-5.1) 新建缺陷描述需要支援 image paste
 *   - 沿用舊版 props API(value / onChange / placeholder / rows / className),
 *     4 個現有 callers(ProjectsPage / ProjectDetailPage / RequirementDetailPage /
 *     MyRequirementsPage)唔使改 code
 *
 * 設計:
 *   - Tiptap StarterKit(bold/italic/heading/list/...)做基礎
 *   - Image extension + paste/drop handler:用家 paste / drop 圖片即時 insert
 *   - uploadEntity prop(可選):{ type, id } → 真正 upload 去 /api/attachments
 *     (edit mode,bug/task 已經有 ID 用呢個)
 *   - 冇 uploadEntity(create mode,bug 仲未 create):
 *     將 image 變 data URL 嵌入 HTML(較簡單,create 完個 description 已經有
 *     embedded image,將來用家可以人手 migrate 上 attachments)
 *
 * 對應紅線 12:呢個 component 有 bug 即時 surface 落 UI,E2E 守住。
 */
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { useEffect, useRef } from 'react'
import {
  Bold, Italic, Strikethrough, List, ListOrdered, Heading2, Quote,
  Link as LinkIcon, Undo, Redo, Image as ImageIcon
} from 'lucide-react'
import { attachmentApi } from '../utils/api'

interface RichTextEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
  className?: string
  /** 可選:提供時,paste image 會真正 upload 去 /api/attachments */
  uploadEntity?: { type: 'requirement' | 'task' | 'project' | 'wiki' | 'bug'; id: string }
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder = '輸入內容...',
  rows = 4,
  className = '',
  uploadEntity,
}: RichTextEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // 唔使 hard-code,讓 StarterKit 預設
      }),
      Image.configure({
        HTMLAttributes: {
          class: 'max-w-full h-auto rounded-lg my-2',
        },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-primary-600 hover:underline',
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    content: value,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML()
      // Tiptap 空白 editor 會出 '<p></p>',視為空 string
      const normalized = html === '<p></p>' ? '' : html
      onChange(normalized)
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose max-w-none focus:outline-none px-3 py-2.5 min-h-[80px]',
        style: `min-height: ${Math.max(rows * 24, 80)}px`,
      },
      handlePaste: (view, event) => {
        const items = event.clipboardData?.items
        if (!items) return false
        for (const item of items) {
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile()
            if (file) {
              event.preventDefault()
              handleImageFile(file)
              return true
            }
          }
        }
        return false
      },
      handleDrop: (view, event) => {
        const files = (event as DragEvent).dataTransfer?.files
        if (!files || files.length === 0) return false
        for (const file of Array.from(files)) {
          if (file.type.startsWith('image/')) {
            event.preventDefault()
            handleImageFile(file)
            return true
          }
        }
        return false
      },
    },
  })

  /**
   * Paste / drop / 上傳 image 嘅 core 處理:
   *   - 有 uploadEntity → 上傳去 /api/attachments,insert URL
   *   - 冇 uploadEntity → 變 data URL 直接嵌入
   */
  const handleImageFile = async (file: File) => {
    if (!editor) return
    if (uploadEntity) {
      try {
        const res = await attachmentApi.upload(file, uploadEntity.type, uploadEntity.id)
        const url = (res.data as any).attachment?.url ?? `/api/attachments/${(res.data as any).attachment.id}`
        editor.chain().focus().setImage({ src: url, alt: file.name }).run()
      } catch (err) {
        console.error('[RichTextEditor] image upload failed:', err)
        // Fallback to data URL
        const reader = new FileReader()
        reader.onload = (e) => {
          const dataUrl = e.target?.result as string
          editor.chain().focus().setImage({ src: dataUrl, alt: file.name }).run()
        }
        reader.readAsDataURL(file)
      }
    } else {
      // 冇 entity(create mode) — 用 data URL,將來有 ID 再 migrate
      const reader = new FileReader()
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string
        editor.chain().focus().setImage({ src: dataUrl, alt: file.name }).run()
      }
      reader.readAsDataURL(file)
    }
  }

  // 外部 value 變化時(例如載入 bug 詳情)sync 入 editor
  useEffect(() => {
    if (!editor) return
    const currentHtml = editor.getHTML()
    const incoming = value || ''
    const currentNorm = currentHtml === '<p></p>' ? '' : currentHtml
    if (currentNorm !== incoming) {
      editor.commands.setContent(incoming || '', false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor])

  if (!editor) {
    return (
      <div className={`border border-gray-300 rounded-lg p-3 text-sm text-gray-400 ${className}`}>
        載入編輯器...
      </div>
    )
  }

  return (
    <div className={`border border-gray-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-primary-500 ${className}`}>
      {/* Toolbar */}
      <div className="flex items-center gap-1 p-2 border-b border-gray-200 bg-gray-50 flex-wrap">
        <ToolbarButton
          editor={editor}
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive('bold')}
          title="粗體"
        >
          <Bold size={14} />
        </ToolbarButton>
        <ToolbarButton
          editor={editor}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive('italic')}
          title="斜體"
        >
          <Italic size={14} />
        </ToolbarButton>
        <ToolbarButton
          editor={editor}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          isActive={editor.isActive('strike')}
          title="刪除線"
        >
          <Strikethrough size={14} />
        </ToolbarButton>
        <div className="w-px h-5 bg-gray-300 mx-1" />
        <ToolbarButton
          editor={editor}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          isActive={editor.isActive('heading', { level: 2 })}
          title="標題"
        >
          <Heading2 size={14} />
        </ToolbarButton>
        <ToolbarButton
          editor={editor}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive('bulletList')}
          title="項目符號"
        >
          <List size={14} />
        </ToolbarButton>
        <ToolbarButton
          editor={editor}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          isActive={editor.isActive('orderedList')}
          title="編號"
        >
          <ListOrdered size={14} />
        </ToolbarButton>
        <ToolbarButton
          editor={editor}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          isActive={editor.isActive('blockquote')}
          title="引言"
        >
          <Quote size={14} />
        </ToolbarButton>
        <div className="w-px h-5 bg-gray-300 mx-1" />
        <ToolbarButton
          editor={editor}
          onClick={() => {
            const url = window.prompt('輸入連結 URL:')
            if (url) editor.chain().focus().setLink({ href: url }).run()
          }}
          isActive={editor.isActive('link')}
          title="連結"
        >
          <LinkIcon size={14} />
        </ToolbarButton>
        <ToolbarButton
          editor={editor}
          onClick={() => fileInputRef.current?.click()}
          title="插入圖片"
        >
          <ImageIcon size={14} />
        </ToolbarButton>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleImageFile(file)
            e.target.value = '' // reset for re-upload same file
          }}
        />
        <div className="w-px h-5 bg-gray-300 mx-1" />
        <ToolbarButton
          editor={editor}
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title="復原"
        >
          <Undo size={14} />
        </ToolbarButton>
        <ToolbarButton
          editor={editor}
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title="重做"
        >
          <Redo size={14} />
        </ToolbarButton>
      </div>
      {/* Editor */}
      <EditorContent editor={editor} />
    </div>
  )
}

function ToolbarButton({
  editor,
  onClick,
  isActive,
  disabled,
  title,
  children,
}: {
  editor: Editor
  onClick: () => void
  isActive?: boolean
  disabled?: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded text-sm w-8 h-8 flex items-center justify-center transition-colors ${
        isActive
          ? 'bg-primary-100 text-primary-700'
          : 'text-gray-600 hover:bg-gray-200'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
    >
      {children}
    </button>
  )
}
