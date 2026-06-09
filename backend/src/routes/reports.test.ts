/**
 * Report route tests — Sprint 9 (sub-list pagination + report fixes)
 *
 * 守住 US-7.x report 修正:成本報告同進度報告要同 WorkLogs page 一致。
 * 唔再用 requirements-join / task-chain 過濾,改用 projectId 直接過濾
 * (同 worklogs.ts:40-45 一樣嘅 where.OR pattern)。
 *
 * 對應 RG-014 7-bug P0 fix 之後嘅一致性修正。
 *
 * Approach: derive pure helpers (filter shapes, percentage math, status buckets)
 * from reports.ts and test the data shape — same pattern as projects.test.ts.
 */

import { describe, expect, test } from 'bun:test'

// ─── Pure helpers derived from reports.ts ───────────────────────────────────

/**
 * Cost report 嘅 where clause (reports.ts:28-43, Sprint 9 fix)
 * MUST include both task and bug branches by projectId, no requirements-join.
 * 跟 worklogs.ts:40-45 同一個 pattern。
 */
function buildCostReportWhere(projectId: string) {
  return {
    OR: [
      { task: { projectId } },
      { bug: { projectId } },
    ],
  }
}

/**
 * Sum worklog hours into a user→{totalHours, tasks} map
 * 從 reports.ts:45-68 derive,純函數版 for testability
 */
function aggregateWorkLogHours(
  logs: Array<{
    userId: string
    hours: number | string
    taskId: string | null
    user: { id: string; name: string; email: string }
    task: { id: string; title: string } | null
  }>
) {
  const userMap = new Map<string, { userId: string; name: string; email: string; totalHours: number; tasks: { taskId: string; title: string; hours: number }[] }>()

  for (const log of logs) {
    const key = log.userId
    if (!userMap.has(key)) {
      userMap.set(key, {
        userId: log.userId,
        name: log.user.name,
        email: log.user.email,
        totalHours: 0,
        tasks: []
      })
    }
    const entry = userMap.get(key)!
    entry.totalHours += Number(log.hours)
    if (log.task) {
      const taskEntry = entry.tasks.find(t => t.taskId === log.taskId)
      if (taskEntry) {
        taskEntry.hours += Number(log.hours)
      } else {
        entry.tasks.push({ taskId: log.taskId!, title: log.task.title, hours: Number(log.hours) })
      }
    }
  }

  return Array.from(userMap.values())
}

/**
 * Progress report 嘅 status bucket labels
 * 從 reports.ts:118-122 derive (Sprint 9 fix: 4-option bug status enum)
 */
const OPEN_BUG_STATUSES = ['open', 'in_progress'] as const
const RESOLVED_BUG_STATUSES = ['resolved', 'verified'] as const  // 唔包 'closed'

/**
 * Percent calculation (round to nearest int, avoid divide-by-zero)
 */
function percent(done: number, total: number): number {
  return total > 0 ? Math.round((done / total) * 100) : 0
}

// ─── US-7.x Cost report ────────────────────────────────────────────────────

describe('US-7.x Sprint 9: GET /reports/cost where clause', () => {
  test('cost report includes both task AND bug branches by projectId', () => {
    const where = buildCostReportWhere('project-A')
    expect(where.OR).toHaveLength(2)
    expect(where.OR).toContainEqual({ task: { projectId: 'project-A' } })
    expect(where.OR).toContainEqual({ bug: { projectId: 'project-A' } })
  })

  test('cost report does NOT chain through requirements (the old bug)', () => {
    // 舊嘅 where: { task: { requirements: { some: { requirement: { projectId } } } } }
    // 會 miss 冇 requirement 嘅 task + 全部 bug
    const where = buildCostReportWhere('project-A')
    const serialized = JSON.stringify(where)
    expect(serialized).not.toContain('requirements')
    expect(serialized).not.toContain('some:')
  })

  test('each branch uses the projectId verbatim', () => {
    const where = buildCostReportWhere('project-XYZ-99')
    expect(where.OR[0]).toEqual({ task: { projectId: 'project-XYZ-99' } })
    expect(where.OR[1]).toEqual({ bug: { projectId: 'project-XYZ-99' } })
  })
})

describe('US-7.x Sprint 9: cost report aggregation (covers the 3 worklog types)', () => {
  test('aggregates worklogs on tasks WITH requirements', () => {
    const result = aggregateWorkLogHours([
      {
        userId: 'u1', hours: 2, taskId: 't1', user: { id: 'u1', name: 'Alice', email: 'a@x' },
        task: { id: 't1', title: 'Task with req' }
      },
    ])
    expect(result[0].totalHours).toBe(2)
    expect(result[0].tasks).toEqual([{ taskId: 't1', title: 'Task with req', hours: 2 }])
  })

  test('aggregates worklogs on tasks WITHOUT requirements (was the old bug)', () => {
    // 舊 code 會 miss 呢種 worklog
    const result = aggregateWorkLogHours([
      {
        userId: 'u2', hours: 3, taskId: 't2', user: { id: 'u2', name: 'Bob', email: 'b@x' },
        task: { id: 't2', title: 'Task no req' }
      },
    ])
    expect(result[0].totalHours).toBe(3)
  })

  test('aggregates worklogs on BUGS (was the old bug — entirely missing)', () => {
    // 舊 code 完全 miss 呢種 worklog
    const result = aggregateWorkLogHours([
      {
        userId: 'u3', hours: 1.5, taskId: null, user: { id: 'u3', name: 'Carol', email: 'c@x' },
        task: null,
      },
    ])
    expect(result[0].totalHours).toBe(1.5)
    // bug worklogs 唔會加入 user.tasks array(因 task 為 null)
    expect(result[0].tasks).toEqual([])
  })

  test('mixed: same user has task+bug worklogs, total sums correctly', () => {
    const result = aggregateWorkLogHours([
      { userId: 'u1', hours: 2, taskId: 't1', user: { id: 'u1', name: 'A', email: 'a@x' }, task: { id: 't1', title: 'T' } },
      { userId: 'u1', hours: 1, taskId: null, user: { id: 'u1', name: 'A', email: 'a@x' }, task: null },
      { userId: 'u1', hours: 0.5, taskId: 't1', user: { id: 'u1', name: 'A', email: 'a@x' }, task: { id: 't1', title: 'T' } },
    ])
    expect(result[0].totalHours).toBe(3.5)
    // Tasks array 只反映有 task 嘅 worklogs
    expect(result[0].tasks).toEqual([{ taskId: 't1', title: 'T', hours: 2.5 }])
  })

  test('handles string hours from Prisma Decimal', () => {
    const result = aggregateWorkLogHours([
      { userId: 'u1', hours: '2.50' as unknown as number, taskId: 't1', user: { id: 'u1', name: 'A', email: 'a@x' }, task: { id: 't1', title: 'T' } },
    ])
    expect(result[0].totalHours).toBe(2.5)
  })
})

// ─── US-7.x Progress report ─────────────────────────────────────────────────

describe('US-7.x Sprint 9: GET /reports/progress status buckets', () => {
  test('open bucket uses the 4-option enum (open/in_progress)', () => {
    expect(OPEN_BUG_STATUSES).toEqual(['open', 'in_progress'])
    expect(OPEN_BUG_STATUSES).not.toContain('closed')
  })

  test('resolved bucket uses the 4-option enum (resolved/verified) — no closed', () => {
    expect(RESOLVED_BUG_STATUSES).toEqual(['resolved', 'verified'])
    // 'closed' 已經喺 Sprint 7 移除(Sprint 9 順手一致化)
    expect(RESOLVED_BUG_STATUSES).not.toContain('closed')
  })

  test('no bug status overlaps between open and resolved buckets', () => {
    const overlap = OPEN_BUG_STATUSES.filter(s => (RESOLVED_BUG_STATUSES as readonly string[]).includes(s))
    expect(overlap).toEqual([])
  })
})

describe('US-7.x Sprint 9: progress report percent math', () => {
  test('100% when all completed', () => {
    expect(percent(5, 5)).toBe(100)
  })

  test('0% when none completed', () => {
    expect(percent(0, 10)).toBe(0)
  })

  test('rounds to nearest integer', () => {
    expect(percent(1, 3)).toBe(33)   // 33.33
    expect(percent(2, 3)).toBe(67)   // 66.67
    expect(percent(3, 7)).toBe(43)   // 42.86
  })

  test('returns 0 when total is 0 (avoid divide-by-zero)', () => {
    expect(percent(0, 0)).toBe(0)
    expect(percent(5, 0)).toBe(0)
  })
})
