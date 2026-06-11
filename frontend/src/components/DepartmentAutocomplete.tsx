/**
 * DepartmentAutocomplete — Sprint 20 US-X: 部門 type-ahead
 *
 * 仿 ProjectAutocomplete / UserAutocomplete 結構。
 * 部門通常 < 30 個,但 type-ahead 體驗仍比 native select 好(尤其鍵盤操作)。
 */
import { useEffect, useRef, useState } from 'react'
import { Search, ChevronDown, X, Building2 } from 'lucide-react'

export interface DepartmentOption {
  id: string
  name: string
}

export interface DepartmentAutocompleteProps {
  value: string
  onChange: (id: string) => void
  departments: DepartmentOption[]
  placeholder?: string
  required?: boolean
  disabled?: boolean
  className?: string
  ariaLabel?: string
}

export default function DepartmentAutocomplete({
  value,
  onChange,
  departments,
  placeholder = '搜尋部門...',
  required = false,
  disabled = false,
  className = '',
  ariaLabel = '選擇部門',
}: DepartmentAutocompleteProps) {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    if (value) {
      const sel = departments.find((d) => d.id === value)
      if (sel) {
        setQuery(sel.name)
        return
      }
    }
    if (!value) setQuery('')
  }, [value, departments])

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        const match = departments.find((d) => d.name === query)
        if (!match && query !== '') {
          if (value) setQuery(departments.find((d) => d.id === value)?.name || '')
          else setQuery('')
        }
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [departments, query, value])

  const filtered = (() => {
    const q = query.trim().toLowerCase()
    if (!q) return departments
    return departments.filter((d) => d.name.toLowerCase().includes(q))
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

  const handleSelect = (d: DepartmentOption) => {
    onChange(d.id)
    setQuery(d.name)
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
      if (isOpen && filtered[highlight]) handleSelect(filtered[highlight])
    } else if (e.key === 'Escape') {
      setIsOpen(false)
    }
  }

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
              <Building2 size={24} className="mx-auto text-gray-300 mb-2" />
              冇符合「{query}」嘅部門
            </li>
          ) : (
            filtered.map((d, idx) => {
              const isHighlighted = idx === highlight
              const isSelected = d.id === value
              return (
                <li
                  key={d.id}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setHighlight(idx)}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    handleSelect(d)
                  }}
                  className={`px-3 py-2 cursor-pointer text-sm ${
                    isHighlighted ? 'bg-primary-50' : 'hover:bg-gray-50'
                  } ${isSelected ? 'font-medium text-primary-700' : 'text-gray-900'}`}
                >
                  {d.name}
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
