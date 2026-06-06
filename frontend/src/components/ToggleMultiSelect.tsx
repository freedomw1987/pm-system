interface ToggleMultiSelectOption {
  id: string
  name: string
}

interface ToggleMultiSelectProps {
  options: ToggleMultiSelectOption[]
  value: string[]
  onChange: (value: string[]) => void
  emptyText?: string
  className?: string
}

export default function ToggleMultiSelect({
  options,
  value,
  onChange,
  emptyText = '暫無可選人員',
  className = ''
}: ToggleMultiSelectProps) {
  const selectedIds = new Set(value)

  const toggle = (id: string) => {
    if (selectedIds.has(id)) {
      onChange(value.filter(selectedId => selectedId !== id))
      return
    }

    onChange([...value, id])
  }

  return (
    <div
      role="listbox"
      aria-multiselectable="true"
      className={`input-field min-h-[96px] max-h-32 overflow-y-auto p-1 ${className}`}
    >
      {options.length === 0 ? (
        <div className="px-3 py-2 text-sm text-gray-400">{emptyText}</div>
      ) : (
        <div className="space-y-1">
          {options.map(option => {
            const selected = selectedIds.has(option.id)

            return (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => toggle(option.id)}
                className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors ${
                  selected
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <span
                  className={`h-3.5 w-3.5 rounded-sm border ${
                    selected ? 'border-white bg-white' : 'border-gray-300 bg-white'
                  }`}
                  aria-hidden="true"
                >
                  <span className={`block h-full w-full scale-50 rounded-sm ${selected ? 'bg-blue-600' : ''}`} />
                </span>
                <span className="min-w-0 flex-1 truncate">{option.name}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
