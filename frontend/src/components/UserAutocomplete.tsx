/**
 * UserAutocomplete — Sprint 20 US-X: 人員選擇 type-ahead
 *
 * 仿 ProjectAutocomplete 嘅 type-ahead 模式,以下場景用:
 *   - WorkLogsPage 人員篩選(支援按部門預過濾)
 *   - Reports 個人視角的「選擇員工」
 *   - 其他任何需要選 user 但 user 數可能 >= 20 嘅地方
 *
 * Props 設計:
 *   - filterByDepartmentId 設咗 → 只列該部門成員
 *   - users 已經由 caller 載好,呢度唔重複 fetch(同 ProjectAutocomplete 模式)
 *
 * 鍵盤導航: ↑↓ Enter Esc 全部有;滑鼠 hover highlight。
 */
import { useEffect, useRef, useState } from 'react'
import { Search, ChevronDown, X, User as UserIcon } from 'lucide-react'

export interface UserOption {
  id: string
  name: string
  email?: string
  department?: { id?: string; name: string } | null
}

export interface UserAutocompleteProps {
  value: string
  onChange: (id: string) => void
  users: UserOption[]
  placeholder?: string
  required?: boolean
  disabled?: boolean
  className?: string
  ariaLabel?: string
  /** 設咗 → 只列 departmentId === 此值嘅成員(空字串 = 全部) */
  filterByDepartmentId?: string
}

export default function UserAutocomplete({
  value,
  onChange,
  users,
  placeholder = '搜尋人員...',
  required = false,
  disabled = false,
  className = '',
  ariaLabel = '選擇人員',
  filterByDepartmentId,
}: UserAutocompleteProps) {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  // 外部 value 同步顯示
  useEffect(() => {
    if (value) {
      const selected = users.find((u) => u.id === value)
      if (selected) {
        setQuery(selected.name)
        return
      }
    }
    if (!value) setQuery('')
  }, [value, users])

  // 點外面收合
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        const match = users.find((u) => u.name === query)
        if (!match && query !== '') {
          if (value) setQuery(users.find((u) => u.id === value)?.name || '')
          else setQuery('')
        }
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [users, query, value])

  // 過濾清單:先按部門預過濾,再按 name/email 搜尋
  const filtered = (() => {
    let pool = users
    if (filterByDepartmentId) {
      pool = pool.filter((u) => u.department?.id === filterByDepartmentId)
    }
    const q = query.trim().toLowerCase()
    if (!q) return pool
    return pool.filter((u) => {
      if (u.name.toLowerCase().includes(q)) return true
      if (u.email?.toLowerCase().includes(q)) return true
      if (u.department?.name?.toLowerCase().includes(q)) return true
      return false
    })
  })()

  useEffect(() => {
    setHighlight(0)
  }, [query, filterByDepartmentId])

  useEffect(() => {
    if (isOpen && listRef.current) {
      const item = listRef.current.children[highlight] as HTMLElement
      if (item) item.scrollIntoView({ block: 'nearest' })
    }
  }, [highlight, isOpen])

  const handleSelect = (user: UserOption) => {
    onChange(user.id)
    setQuery(user.name)
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

  const selected = users.find((u) => u.id === value)
  const showClear = value && !required
  const isEmpty = filtered.length === 0

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
            if (value) onChange('')
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          aria-label={ariaLabel}
          aria-autocomplete="list"
          aria-expanded={isOpen}
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
          role="listbox"
          className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg"
        >
          {isEmpty ? (
            <li className="px-3 py-6 text-center text-sm text-gray-500">
              <UserIcon size={24} className="mx-auto text-gray-300 mb-2" />
              {filterByDepartmentId
                ? '此部門暫無符合嘅成員'
                : `冇符合「${query}」嘅人員`}
            </li>
          ) : (
            filtered.map((u, idx) => {
              const isHighlighted = idx === highlight
              const isSelected = u.id === value
              return (
                <li
                  key={u.id}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setHighlight(idx)}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    handleSelect(u)
                  }}
                  className={`px-3 py-2 cursor-pointer ${
                    isHighlighted ? 'bg-primary-50' : 'hover:bg-gray-50'
                  } ${isSelected ? 'font-medium' : ''}`}
                >
                  <div className="text-sm text-gray-900 truncate">{u.name}</div>
                  {(u.department?.name || u.email) && (
                    <div className="text-xs text-gray-500 truncate">
                      {u.department?.name && <span>{u.department.name}</span>}
                      {u.department?.name && u.email && <span> · </span>}
                      {u.email && <span>{u.email}</span>}
                    </div>
                  )}
                </li>
              )
            })
          )}
        </ul>
      )}

      {required && <input type="hidden" value={value} />}
    </div>
  )
}
