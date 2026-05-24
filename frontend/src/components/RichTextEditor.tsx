import { useRef, useEffect } from 'react'

interface RichTextEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
  className?: string
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder = '輸入內容...',
  rows = 4,
  className = ''
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value
    }
  }, [value])

  const handleInput = () => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML)
    }
  }

  const execCommand = (command: string, value: string | undefined = undefined) => {
    document.execCommand(command, false, value)
    editorRef.current?.focus()
    handleInput()
  }

  return (
    <div className={`border border-gray-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-primary-500 ${className}`}>
      {/* Toolbar */}
      <div className="flex items-center gap-1 p-2 border-b border-gray-200 bg-gray-50 flex-wrap">
        <button
          type="button"
          onClick={() => execCommand('bold')}
          className="p-1.5 rounded hover:bg-gray-200 font-bold text-sm w-8 h-8 flex items-center justify-center"
          title="粗體"
        >
          B
        </button>
        <button
          type="button"
          onClick={() => execCommand('italic')}
          className="p-1.5 rounded hover:bg-gray-200 italic text-sm w-8 h-8 flex items-center justify-center"
          title="斜體"
        >
          I
        </button>
        <button
          type="button"
          onClick={() => execCommand('underline')}
          className="p-1.5 rounded hover:bg-gray-200 underline text-sm w-8 h-8 flex items-center justify-center"
          title="底線"
        >
          U
        </button>
        <div className="w-px h-5 bg-gray-300 mx-1" />
        <button
          type="button"
          onClick={() => execCommand('insertUnorderedList')}
          className="p-1.5 rounded hover:bg-gray-200 text-sm w-8 h-8 flex items-center justify-center"
          title="項目符號"
        >
          •
        </button>
        <button
          type="button"
          onClick={() => execCommand('insertOrderedList')}
          className="p-1.5 rounded hover:bg-gray-200 text-sm w-8 h-8 flex items-center justify-center"
          title="編號"
        >
          1.
        </button>
        <div className="w-px h-5 bg-gray-300 mx-1" />
        <button
          type="button"
          onClick={() => execCommand('formatBlock', 'h3')}
          className="p-1.5 rounded hover:bg-gray-200 text-sm w-8 h-8 flex items-center justify-center"
          title="標題"
        >
          H
        </button>
        <button
          type="button"
          onClick={() => execCommand('formatBlock', 'p')}
          className="p-1.5 rounded hover:bg-gray-200 text-sm w-8 h-8 flex items-center justify-center"
          title="段落"
        >
          P
        </button>
        <div className="w-px h-5 bg-gray-300 mx-1" />
        <button
          type="button"
          onClick={() => execCommand('createLink', prompt('輸入連結 URL：') || 'https://')}
          className="p-1.5 rounded hover:bg-gray-200 text-sm w-8 h-8 flex items-center justify-center"
          title="連結"
        >
          🔗
        </button>
        <button
          type="button"
          onClick={() => execCommand('removeFormat')}
          className="p-1.5 rounded hover:bg-gray-200 text-sm w-8 h-8 flex items-center justify-center"
          title="清除格式"
        >
          ⌫
        </button>
      </div>
      {/* Editor */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        data-placeholder={placeholder}
        className="w-full px-3 py-2.5 focus:outline-none"
        style={{ minHeight: `${rows * 24}px` }}
      />
      <style>{`
        [contenteditable]:empty:before {
          content: attr(data-placeholder);
          color: #9ca3af;
        }
      `}</style>
    </div>
  )
}