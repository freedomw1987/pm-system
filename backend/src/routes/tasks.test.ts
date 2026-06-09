import { describe, expect, test } from 'bun:test'
import { buildTaskListWhere, resolveTaskProjectId, canEditTaskFields } from './tasks'

describe('buildTaskListWhere', () => {
  test('includes participant tasks when filtering by assigneeId', () => {
    const where = buildTaskListWhere(
      { assigneeId: 'user-1' },
      { id: 'viewer-1', role: 'tech_lead', permissions: ['tasks.view_all'] }
    )

    expect(where.OR).toEqual([
      { assigneeId: 'user-1' },
      { participants: { some: { userId: 'user-1' } } },
    ])
  })

  // US-4.4: 需求↔任務 link — list 支援 requirementId filter
  test('US-4.4: filter by requirementId adds requirements.some(requirementId) to where', () => {
    const where = buildTaskListWhere(
      { requirementId: 'req-1' },
      { id: 'viewer-1', role: 'tech_lead', permissions: ['tasks.view_all'] }
    )
    expect(where.requirements).toEqual({ some: { requirementId: 'req-1' } })
  })

  test('US-4.4: requirementId filter 配合 projectId filter 可並存', () => {
    const where = buildTaskListWhere(
      { requirementId: 'req-1', projectId: 'project-1' },
      { id: 'viewer-1', role: 'tech_lead', permissions: ['tasks.view_all'] }
    )
    expect(where.projectId).toBe('project-1')
    expect(where.requirements).toEqual({ some: { requirementId: 'req-1' } })
  })

  test('US-4.4: 冇 requirementId → 唔加 requirements filter', () => {
    const where = buildTaskListWhere(
      { projectId: 'project-1' },
      { id: 'viewer-1', role: 'tech_lead', permissions: ['tasks.view_all'] }
    )
    expect(where.requirements).toBeUndefined()
  })
})

describe('resolveTaskProjectId', () => {
  test('uses the requirement project when creating a requirement task without projectId', () => {
    const result = resolveTaskProjectId(undefined, [
      { id: 'req-1', projectId: 'project-1' },
    ])

    expect(result).toEqual({ projectId: 'project-1' })
  })

  test('rejects tasks whose projectId differs from their linked requirement project', () => {
    const result = resolveTaskProjectId('project-2', [
      { id: 'req-1', projectId: 'project-1' },
    ])

    expect(result).toEqual({
      error: 'All linked requirements must belong to the task project',
    })
  })

  // US-4.4: 跨 project 報錯 — 唔可以 link 多個 project 嘅 requirement
  test('US-4.4: 多個 requirement 跨 project 會被拒絕', () => {
    const result = resolveTaskProjectId('project-1', [
      { id: 'req-1', projectId: 'project-1' },
      { id: 'req-2', projectId: 'project-2' },
    ])
    expect(result).toEqual({
      error: 'All linked requirements must belong to the same project',
    })
  })

  test('US-4.4: 多個 requirement 同一 project OK', () => {
    const result = resolveTaskProjectId('project-1', [
      { id: 'req-1', projectId: 'project-1' },
      { id: 'req-2', projectId: 'project-1' },
    ])
    expect(result).toEqual({ projectId: 'project-1' })
  })

  test('US-4.4: 冇 requirement 又冇 projectId → 返 undefined(projectId 由 caller 補)', () => {
    const result = resolveTaskProjectId(undefined, [])
    expect(result).toEqual({ projectId: undefined })
  })
})

// 2026-06-10 RG-015: Developer 即使有 `tasks.edit` perm 都只可改 status。
// 改 title / description / assignee / parentTaskId / estimatedHours 一定要
// admin / tech_lead / 額外 perm `tasks.edit_fields`。
//
// 守住 invariant:developer role + tasks.edit perm → 唔可以改 fields(只可改 status)。
// 原本 RBAC 結構有 fall-through bug — 個 outer if 條件 false 跳過 inner if,
// developer PUT title 越權成功(200 instead of 403)。Unit test 守住
// canEditTaskFields 嘅所有 boundary case。
describe('canEditTaskFields (RG-015: developer cannot edit fields)', () => {
  test('admin role → true (full edit access)', () => {
    expect(canEditTaskFields({ role: 'admin' })).toBe(true)
    expect(canEditTaskFields({ role: 'admin', permissions: [] })).toBe(true)
  })

  test('tech_lead role → true (full edit access)', () => {
    expect(canEditTaskFields({ role: 'tech_lead' })).toBe(true)
    expect(canEditTaskFields({ role: 'tech_lead', permissions: [] })).toBe(true)
  })

  test('RG-015 critical: developer role + tasks.edit perm → false (was fall-through bug)', () => {
    // Developer 嘅 default permissions 已經有 `tasks.edit`,但呢個 perm
    // 嘅語義只覆蓋 status update(同 Kanban drag-drop 對齊)。
    // 改 fields 一定要額外 `tasks.edit_fields` perm 或者 admin/tech_lead role。
    expect(canEditTaskFields({ role: 'developer', permissions: ['tasks.view', 'tasks.create', 'tasks.edit', 'bugs.view', 'bugs.create', 'bugs.edit', 'worklogs.view', 'worklogs.create'] })).toBe(false)
  })

  test('developer role + tasks.edit_fields perm → true (opt-in for full edit)', () => {
    expect(canEditTaskFields({ role: 'developer', permissions: ['tasks.edit', 'tasks.edit_fields'] })).toBe(true)
  })

  test('tester role (no tasks.edit_fields) → false', () => {
    expect(canEditTaskFields({ role: 'tester', permissions: ['tasks.view', 'tasks.create', 'tasks.edit', 'bugs.view', 'bugs.create', 'bugs.edit'] })).toBe(false)
  })

  test('pm role (legacy) → false (pm does NOT auto-have tech_lead-equivalent edit; canEditTaskFields 是 field-level gate)', () => {
    // pm 通常 manage requirements 而非 tasks 嘅 field edit,如果佢想 edit task fields,
    // 應該有 `tasks.edit_fields` perm。否則 fallback false。
    // 註:pm 喺舊 code 有 `tasks.create` (CREATE) 但 PUT 嘅 field edit 唔應該 fallback 畀 pm。
    expect(canEditTaskFields({ role: 'pm', permissions: ['tasks.view', 'tasks.create'] })).toBe(false)
  })

  test('pm role + tasks.edit_fields perm → true', () => {
    expect(canEditTaskFields({ role: 'pm', permissions: ['tasks.edit_fields'] })).toBe(true)
  })

  test('null user → false (no edit access)', () => {
    expect(canEditTaskFields(null)).toBe(false)
    expect(canEditTaskFields(undefined)).toBe(false)
  })

  test('user with empty role + tasks.edit_fields perm → true (perm-only override works)', () => {
    // 將來可能有 custom role 唔屬於 admin/tech_lead 但透過 perm 攞到 field edit 權限
    expect(canEditTaskFields({ role: 'custom_role', permissions: ['tasks.edit_fields'] })).toBe(true)
  })
})
