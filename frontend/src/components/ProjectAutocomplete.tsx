/**
 * ProjectAutocomplete — Sprint 14 (US: projects dropdown 升級)
 *
 * Type-ahead 嘅項目選擇器,取代 native <select>。
 * - 載入後用 `projectApi.list({ limit: -1 })` 攞晒全部項目(Sprint 14 修)
 * - Type 即時 filter project name / department name
 * - 鍵盤導航(↑↓ Enter Esc)+ 滑鼠 hover
 * - 顯示 status badge 方便識別
 *
 * 用法:
 *   <ProjectAutocomplete
 *     value={selectedProjectId}
 *     onChange={(id) => setSelectedProjectId(id)}
 *     projects={projects}   // 由 parent 傳入,避免重複 fetch
 *     placeholder="搜尋項目..."
 *     required
 *   />
 *
 * 對比 native <select>:
 *   - ✅ 50+ 項目 type 即時搵到
 *   - ✅ 鍵盤導航完整(↑↓ Enter Esc)
 *   - ✅ 顯示 status / department context
 *   - ❌ 比 <select> 多 60 行 code
 */
import { useEffect, useRef, useState } from 'react'
import { Search, ChevronDown, X, FolderKanban } from 'lucide-react'

export interface ProjectOption {
  id: string
  name: string
  status?: string
  department?: { name: string } | null
}

export interface ProjectAutocompleteProps {
  value: string
  onChange: (id: string) => void
  projects: ProjectOption[]
  placeholder?: string
  required?: boolean
  disabled?: boolean
  className?: string
  ariaLabel?: string
}

const STATUS_LABEL: Record<string, string> = {
  active: '進行中',
  completed: '已完成',
  archived: '已歸檔',
  on_hold: '暫停',
}

const STATUS_COLOR: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  completed: 'bg-blue-100 text-blue-700',
  archived: 'bg-gray-100 text-gray-600',
  on_hold: 'bg-yellow-100 text-yellow-700',
}

export default function ProjectAutocomplete({
  value,
  onChange,
  projects,
  placeholder = '搜尋項目...',
  required = false,
  disabled = false,
  className = '',
  ariaLabel = '選擇項目',
}: ProjectAutocompleteProps) {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  // 同步外部 value 嘅顯示 label
  useEffect(() => {
    if (value) {
      const selected = projects.find((p) => p.id === value)
      if (selected) {
        setQuery(selected.name)
        return
      }
    }
    // 冇 value / projects 未含 → 清空(可能係 reset 之後)
    if (!value) setQuery('')
  }, [value, projects])

  // Click outside 收埋
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        // 收埋時,如果 query 唔 match 任何 project,reset value
        const match = projects.find((p) => p.name === query)
        if (!match && query !== '') {
          // user 輸入但冇 confirm → reset
          if (value) setQuery(projects.find((p) => p.id === value)?.name || '')
          else setQuery('')
        }
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [projects, query, value])

  // Filtered list
  const filtered = query.trim()
    ? projects.filter((p) => {
        const q = query.trim().toLowerCase()
        if (p.name.toLowerCase().includes(q)) return true
        if (p.department?.name?.toLowerCase().includes(q)) return true
        return false
      })
    : projects

  // 重置 highlight 喺 query 改時
  useEffect(() => {
    setHighlight(0)
  }, [query])

  // 滾動到 highlighted item
  useEffect(() => {
    if (isOpen && listRef.current) {
      const item = listRef.current.children[highlight] as HTMLElement
      if (item) item.scrollIntoView({ block: 'nearest' })
    }
  }, [highlight, isOpen])

  const handleSelect = (project: ProjectOption) => {
    onChange(project.id)
    setQuery(project.name)
    setIsOpen(false)
  }

  const handleClear = () => {
    onChange('')
    setQuery('')
    setIsOpen(false)
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!isOpen) setIsOpen(true)
      setHighlight((h) => Math.min(h + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (isOpen && filtered[highlight]) {
        handleSelect(filtered[highlight])
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false)
    }
  }

  const selected = projects.find((p) => p.id === value)
  const showClear = value && !required

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setIsOpen(true)
            // 編輯時清 value,等 user 揀過先 commit
            if (value) onChange('')
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          aria-label={ariaLabel}
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls="project-autocomplete-listbox"
          required={required}
          disabled={disabled}
          autoComplete="off"
          className="w-full pl-9 pr-16 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {showClear && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 text-gray-400 hover:text-gray-600 rounded"
              aria-label="清除選擇"
            >
              <X size={14} />
            </button>
          )}
          <ChevronDown
            size={14}
            className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </div>
      </div>

      {isOpen && (
        <ul
          ref={listRef}
          id="project-autocomplete-listbox"
          role="listbox"
          className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-gray-500">
              <FolderKanban size={24} className="mx-auto text-gray-300 mb-2" />
              冇符合「{query}」嘅項目
            </li>
          ) : (
            filtered.map((p, idx) => {
              const isHighlighted = idx === highlight
              const isSelected = p.id === value
              return (
                <li
                  key={p.id}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setHighlight(idx)}
                  onMouseDown={(e) => {
                    // 用 mousedown 避免 input blur 觸發 click outside
                    e.preventDefault()
                    handleSelect(p)
                  }}
                  className={`px-3 py-2 cursor-pointer flex items-center justify-between gap-2 ${
                    isHighlighted ? 'bg-primary-50' : 'hover:bg-gray-50'
                  } ${isSelected ? 'font-medium' : ''}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-900 truncate">{p.name}</div>
                    {p.department?.name && (
                      <div className="text-xs text-gray-500 truncate">
                        {p.department.name}
                      </div>
                    )}
                  </div>
                  {p.status && (
                    <span
                      className={`flex-shrink-0 px-2 py-0.5 rounded text-xs font-medium ${
                        STATUS_COLOR[p.status] || 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {STATUS_LABEL[p.status] || p.status}
                    </span>
                  )}
                </li>
              )
            })
          )}
        </ul>
      )}

      {/* Hidden input for form submission (when required) */}
      {required && <input type="hidden" value={value} />}
    </div>
  )
}
