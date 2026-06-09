import { describe, expect, test } from 'bun:test'
import { buildTaskListWhere, resolveTaskProjectId } from './tasks'

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
