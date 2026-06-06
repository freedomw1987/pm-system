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
})
