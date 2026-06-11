/**
 * Frontend Tests — UserAutocomplete 純邏輯 (Sprint 20)
 *
 * 對應 US-1(WorkLogs 人員選擇改 Autocomplete)。
 * 沿用既有純 helper 測試模式(WorkLogsFrontend.test.tsx),
 * 只測核心過濾/匹配邏輯,唔做 DOM render。
 */
import { describe, expect, test } from 'vitest'

interface UserOption {
  id: string
  name: string
  email?: string
  department?: { id?: string; name: string } | null
}

/**
 * UserAutocomplete 內部嘅 filter 邏輯抽出嚟做單元測試。
 * 同真實 component 行為一致:先按 filterByDepartmentId 預過濾,再按 query 搜尋 name/email/department。
 */
function filterUsers(
  users: UserOption[],
  query: string,
  filterByDepartmentId?: string,
): UserOption[] {
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
}

// ─── US-1.1: Department filter 連動 ────────────────────────────────

describe('US-1.1: UserAutocomplete department filter', () => {
  const users: UserOption[] = [
    { id: 'u1', name: '王小明', email: 'wang@example.com', department: { id: 'd1', name: '研發部' } },
    { id: 'u2', name: '李小華', email: 'lee@example.com', department: { id: 'd1', name: '研發部' } },
    { id: 'u3', name: '張三', email: 'zhang@example.com', department: { id: 'd2', name: '產品部' } },
    { id: 'u4', name: '陳四', email: 'chen@example.com', department: { id: 'd2', name: '產品部' } },
    { id: 'u5', name: '林五', email: 'lin@example.com', department: null },
  ]

  test('未選部門 → 列全部人', () => {
    expect(filterUsers(users, '')).toHaveLength(5)
    expect(filterUsers(users, '王')).toHaveLength(1)
  })

  test('選研發部 → 只列研發部成員', () => {
    const filtered = filterUsers(users, '', 'd1')
    expect(filtered).toHaveLength(2)
    expect(filtered.map((u) => u.id).sort()).toEqual(['u1', 'u2'])
  })

  test('選產品部 + 搜尋"張" → 列產品部嘅張三', () => {
    const filtered = filterUsers(users, '張', 'd2')
    expect(filtered).toHaveLength(1)
    expect(filtered[0].id).toBe('u3')
  })

  test('選研發部 + 搜尋產品部成員名 → 結果空(部內唔含)', () => {
    // 模擬 user 揀咗研發部,但 query 輸入 "張" → 唔應該見到張三
    const filtered = filterUsers(users, '張', 'd1')
    expect(filtered).toHaveLength(0)
  })

  test('選無部門成員不屬於任何部門', () => {
    // 揀咗 d99 (不存在嘅部門) → 應該返空 array
    expect(filterUsers(users, '', 'd99')).toHaveLength(0)
  })

  test('email 搜尋', () => {
    const filtered = filterUsers(users, 'zhang@')
    expect(filtered).toHaveLength(1)
    expect(filtered[0].id).toBe('u3')
  })
})

// ─── US-1.2: 邊界 case ─────────────────────────────────────────────

describe('US-1.2: UserAutocomplete edge cases', () => {
  test('空 list 返空 array', () => {
    expect(filterUsers([], '')).toEqual([])
    expect(filterUsers([], '王', 'd1')).toEqual([])
  })

  test('query 空白字元被 trim', () => {
    const users: UserOption[] = [
      { id: 'u1', name: '王小明', department: { id: 'd1', name: '研發部' } },
    ]
    expect(filterUsers(users, '   ')).toHaveLength(1)
    expect(filterUsers(users, '  王  ')).toHaveLength(1)
  })

  test('case-insensitive 搜尋', () => {
    const users: UserOption[] = [
      { id: 'u1', name: 'Alice Wong', department: { id: 'd1', name: 'RD' } },
      { id: 'u2', name: 'Bob Lee', department: { id: 'd1', name: 'RD' } },
    ]
    expect(filterUsers(users, 'alice')).toHaveLength(1)
    expect(filterUsers(users, 'ALICE')).toHaveLength(1)
    expect(filterUsers(users, 'Rd')).toHaveLength(2) // 部門名也匹配
  })
})
