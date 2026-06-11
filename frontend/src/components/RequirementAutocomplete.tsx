/**
 * RequirementAutocomplete — Sprint 20 US-X: 需求 type-ahead 選擇
 *
 * 設計目標:
 *   - 在 AddTaskModal / AddBugModal 嘅 extraFields slot 內使用
 *   - 顯示 status badge 方便識別
 *   - 支援單選(multi=false,Bug 用)同多選(multi=true,Task 用,後端吃 string[])
 *   - 鍵盤導航(↑↓ Enter Esc)+ 點外面收合
 *
 * 注意:多選模式內部以陣列管理 state,但 onChange 只返新增嘅 id 給 caller
 * 處理;caller 自己維護 array state(沿用 controlled component 慣例)。
 */
import { useEffect, useRef, useState } from 'react'
import { Search, ChevronDown, X, FileText, Check } from 'lucide-react'

export interface RequirementOption {
  id: string
  title: string
  status?: 'pending' | 'in_progress' | 'completed' | string
}

export interface RequirementAutocompleteProps {
  value: string | string[]
  onChange: (v: string | string[]) => void
  requirements: RequirementOption[]
  placeholder?: string
  required?: boolean
  disabled?: boolean
  className?: string
  ariaLabel?: string
  /** true = 陣列多選,後端吃 string[];false = 單選,後端吃 string */
  multi?: boolean
}

const STATUS_LABEL: Record<string, string> = {
  pending: '待處理',
  in_progress: '進行中',
  completed: '已完成',
}

const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600',
  in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
}

export default function RequirementAutocomplete({
  value,
  onChange,
  requirements,
  placeholder = '搜尋需求...',
  required = false,
  disabled = false,
  className = '',
  ariaLabel = '選擇需求',
  multi = false,
}: RequirementAutocompleteProps) {
  const selectedIds = multi
    ? (Array.isArray(value) ? value : [])
    : (typeof value === 'string' && value ? [value] : [])

  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  // 顯示已選名稱(單選 mode)
  useEffect(() => {
    if (!multi && typeof value === 'string' && value) {
      const sel = requirements.find((r) => r.id === value)
      if (sel) setQuery(sel.title)
    }
    if (!multi && !value) setQuery('')
  }, [value, requirements, multi])

  // 點外面收合
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        if (!multi) {
          const match = requirements.find((r) => r.title === query)
          if (!match && query !== '') {
            if (value) setQuery(requirements.find((r) => r.id === value)?.title || '')
            else setQuery('')
          }
        }
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [requirements, query, value, multi])

  // 過濾:多選模式隱藏已選
  const filtered = (() => {
    const q = query.trim().toLowerCase()
    let pool = requirements
    if (multi) {
      pool = pool.filter((r) => !selectedIds.includes(r.id))
    }
    if (!q) return pool
    return pool.filter((r) => r.title.toLowerCase().includes(q))
  })()

  useEffect(() => {
    setHighlight(0)
  }, [query])

  useEffect(() => {
    if (isOpen && listRef.current) {
      const item = listRef.current.children[highlight] as HTMLElement
      if (item) item.scrollIntoView({ block: 'nearest' })
    }
  }, [highlight, isOpen])

  const handleSelect = (req: RequirementOption) => {
    if (multi) {
      const next = [...selectedIds, req.id]
      onChange(next)
    } else {
      onChange(req.id)
      setQuery(req.title)
      setIsOpen(false)
    }
  }

  const handleRemove = (id: string) => {
    if (multi) {
      onChange(selectedIds.filter((x) => x !== id))
    } else {
      onChange('')
      setQuery('')
      inputRef.current?.focus()
    }
  }

  const handleClearAll = () => {
    if (multi) onChange([])
    else onChange('')
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
    } else if (e.key === 'Backspace' && multi && query === '' && selectedIds.length > 0) {
      // 多選 mode 退刪最後一個 chip
      onChange(selectedIds.slice(0, -1))
    }
  }

  const isEmpty = filtered.length === 0

  // 顯示 chips(多選) / 純字(單選)
  const showChips = multi && selectedIds.length > 0

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {showChips && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {selectedIds.map((id) => {
            const r = requirements.find((x) => x.id === id)
            if (!r) return null
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-50 text-primary-700 text-xs rounded"
              >
                <FileText size={10} />
                {r.title}
                <button
                  type="button"
                  onClick={() => handleRemove(id)}
                  className="hover:text-primary-900"
                  aria-label={`移除 ${r.title}`}
                >
                  <X size={12} />
                </button>
              </span>
            )
          })}
        </div>
      )}
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
            if (!multi && value) onChange('')
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          aria-label={ariaLabel}
          aria-autocomplete="list"
          aria-expanded={isOpen}
          required={required && !showChips}
          disabled={disabled}
          autoComplete="off"
          className="w-full pl-9 pr-16 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {selectedIds.length > 0 && !required && (
            <button
              type="button"
              onClick={handleClearAll}
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
          role="listbox"
          className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg"
        >
          {isEmpty ? (
            <li className="px-3 py-6 text-center text-sm text-gray-500">
              <FileText size={24} className="mx-auto text-gray-300 mb-2" />
              {multi && selectedIds.length > 0
                ? '已選晒所有需求'
                : `冇符合「${query}」嘅需求`}
            </li>
          ) : (
            filtered.map((r, idx) => {
              const isHighlighted = idx === highlight
              const isSelected = selectedIds.includes(r.id)
              return (
                <li
                  key={r.id}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setHighlight(idx)}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    handleSelect(r)
                  }}
                  className={`px-3 py-2 cursor-pointer flex items-center justify-between gap-2 ${
                    isHighlighted ? 'bg-primary-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="text-sm text-gray-900 truncate flex-1 min-w-0">
                    {r.title}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {isSelected && <Check size={14} className="text-primary-600" />}
                    {r.status && (
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          STATUS_COLOR[r.status] || 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {STATUS_LABEL[r.status] || r.status}
                      </span>
                    )}
                  </div>
                </li>
              )
            })
          )}
        </ul>
      )}

      {required && !showChips && <input type="hidden" value={multi ? '' : (value as string)} />}
    </div>
  )
}
