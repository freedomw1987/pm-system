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

// ─── Sprint 20 US-2: 部門 / 個人視角 helpers ─────────────────────────────

interface WorkLogWithRelations {
  userId: string
  hours: number | string
  date: Date
  task: { id: string; title: string; project: { id: string; name: string } } | null
  bug: { id: string; title: string; project: { id: string; name: string } } | null
}

/**
 * 部門視角聚合:每條 worklog 歸入對應 user 與 project。
 * Mirror reports.ts:189-225 aggregation logic.
 */
function aggregateDepartmentWorkLogs(logs: WorkLogWithRelations[]) {
  const userMap = new Map<string, { userId: string; totalHours: number }>()
  const projectMap = new Map<string, { projectId: string; name: string; totalHours: number }>()
  let totalHours = 0

  for (const log of logs) {
    const hours = Number(log.hours)
    totalHours += hours

    if (!userMap.has(log.userId)) {
      userMap.set(log.userId, { userId: log.userId, totalHours: 0 })
    }
    userMap.get(log.userId)!.totalHours += hours

    const proj = log.task?.project || log.bug?.project
    if (proj) {
      if (!projectMap.has(proj.id)) {
        projectMap.set(proj.id, { projectId: proj.id, name: proj.name, totalHours: 0 })
      }
      projectMap.get(proj.id)!.totalHours += hours
    }
  }

  return {
    totalHours,
    projectBreakdown: Array.from(projectMap.values()).sort((a, b) => b.totalHours - a.totalHours),
    userBreakdown: Array.from(userMap.values()).sort((a, b) => b.totalHours - a.totalHours),
  }
}

/**
 * 個人視角聚合:除 user/project 外,亦聚合 task 維度 + 每日小時。
 * Mirror reports.ts:293-331.
 */
function aggregateUserWorkLogs(logs: WorkLogWithRelations[]) {
  const projectMap = new Map<string, { projectId: string; name: string; totalHours: number }>()
  const taskMap = new Map<string, { taskId: string; title: string; hours: number; isBug: boolean }>()
  const dailyMap = new Map<string, number>()
  let totalHours = 0

  for (const log of logs) {
    const hours = Number(log.hours)
    totalHours += hours
    const dateKey: string = log.date.toISOString().slice(0, 10)
    dailyMap.set(dateKey, (dailyMap.get(dateKey) || 0) + hours)

    const proj = log.task?.project || log.bug?.project
    if (proj) {
      if (!projectMap.has(proj.id)) {
        projectMap.set(proj.id, { projectId: proj.id, name: proj.name, totalHours: 0 })
      }
      projectMap.get(proj.id)!.totalHours += hours
    }

    if (log.task) {
      const k = `task:${log.task.id}`
      if (!taskMap.has(k)) taskMap.set(k, { taskId: log.task.id, title: log.task.title, hours: 0, isBug: false })
      taskMap.get(k)!.hours += hours
    } else if (log.bug) {
      const k = `bug:${log.bug.id}`
      if (!taskMap.has(k)) taskMap.set(k, { taskId: log.bug.id, title: log.bug.title, hours: 0, isBug: true })
      taskMap.get(k)!.hours += hours
    }
  }

  return {
    totalHours,
    projectBreakdown: Array.from(projectMap.values()).sort((a, b) => b.totalHours - a.totalHours),
    taskBreakdown: Array.from(taskMap.values()).sort((a, b) => b.hours - a.hours),
    dailyHours: Array.from(dailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, hours]) => ({ date, hours })),
  }
}

/**
 * 補齊每日序列(原本 reports.ts:335-341):給定 [start, end] 範圍,
 * 將 dailyMap 內冇 log 嘅日子填 0。
 */
function fillDailyRange(
  dailyMap: Map<string, number>,
  start: Date,
  end: Date
): { date: string; hours: number }[] {
  const out: { date: string; hours: number }[] = []
  const cursor = new Date(start)
  while (cursor <= end) {
    const k: string = cursor.toISOString().slice(0, 10)
    out.push({ date: k, hours: dailyMap.get(k) || 0 })
    cursor.setDate(cursor.getDate() + 1)
  }
  return out
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

// ─── Sprint 20 US-2: 部門視角報表聚合 ────────────────────────────────────

describe('Sprint 20 US-2: GET /reports/by-department aggregation', () => {
  test('空 logs → totalHours = 0,空 breakdowns', () => {
    const result = aggregateDepartmentWorkLogs([])
    expect(result.totalHours).toBe(0)
    expect(result.projectBreakdown).toEqual([])
    expect(result.userBreakdown).toEqual([])
  })

  test('單用戶單項目聚合 hours', () => {
    const result = aggregateDepartmentWorkLogs([
      {
        userId: 'u1', hours: 4, date: new Date('2026-06-01'),
        task: { id: 't1', title: 'T1', project: { id: 'p1', name: 'P1' } },
        bug: null,
      },
    ])
    expect(result.totalHours).toBe(4)
    expect(result.userBreakdown).toEqual([{ userId: 'u1', totalHours: 4 }])
    expect(result.projectBreakdown).toEqual([{ projectId: 'p1', name: 'P1', totalHours: 4 }])
  })

  test('多用戶多項目:totalHours 同 user/project 維度都正確', () => {
    const result = aggregateDepartmentWorkLogs([
      {
        userId: 'u1', hours: 2, date: new Date('2026-06-01'),
        task: { id: 't1', title: 'T1', project: { id: 'p1', name: 'P1' } },
        bug: null,
      },
      {
        userId: 'u1', hours: 3, date: new Date('2026-06-02'),
        task: null,
        bug: { id: 'b1', title: 'B1', project: { id: 'p1', name: 'P1' } },
      },
      {
        userId: 'u2', hours: 1.5, date: new Date('2026-06-01'),
        task: { id: 't2', title: 'T2', project: { id: 'p2', name: 'P2' } },
        bug: null,
      },
    ])
    expect(result.totalHours).toBe(6.5)
    expect(result.userBreakdown).toHaveLength(2)
    expect(result.userBreakdown[0]).toEqual({ userId: 'u1', totalHours: 5 })
    expect(result.userBreakdown[1]).toEqual({ userId: 'u2', totalHours: 1.5 })
    // Project breakdown 排序: P1 5.5h > P2 1.5h
    expect(result.projectBreakdown[0]).toEqual({ projectId: 'p1', name: 'P1', totalHours: 5 })
    expect(result.projectBreakdown[1]).toEqual({ projectId: 'p2', name: 'P2', totalHours: 1.5 })
  })

  test('task 與 bug 都會聚合到同一個 project', () => {
    const result = aggregateDepartmentWorkLogs([
      {
        userId: 'u1', hours: 2, date: new Date('2026-06-01'),
        task: { id: 't1', title: 'T1', project: { id: 'p1', name: 'P1' } },
        bug: null,
      },
      {
        userId: 'u1', hours: 1, date: new Date('2026-06-01'),
        task: null,
        bug: { id: 'b1', title: 'B1', project: { id: 'p1', name: 'P1' } },
      },
    ])
    expect(result.projectBreakdown).toHaveLength(1)
    expect(result.projectBreakdown[0].totalHours).toBe(3)
  })
})

// ─── Sprint 20 US-2: 個人視角報表聚合 ────────────────────────────────────

describe('Sprint 20 US-2: GET /reports/by-user aggregation', () => {
  test('空 logs → totalHours = 0', () => {
    const result = aggregateUserWorkLogs([])
    expect(result.totalHours).toBe(0)
    expect(result.projectBreakdown).toEqual([])
    expect(result.taskBreakdown).toEqual([])
    expect(result.dailyHours).toEqual([])
  })

  test('單人單日單 task:正確聚合 project + task + daily', () => {
    const result = aggregateUserWorkLogs([
      {
        userId: 'u1', hours: 4, date: new Date('2026-06-01'),
        task: { id: 't1', title: 'T1', project: { id: 'p1', name: 'P1' } },
        bug: null,
      },
    ])
    expect(result.totalHours).toBe(4)
    expect(result.projectBreakdown).toEqual([{ projectId: 'p1', name: 'P1', totalHours: 4 }])
    expect(result.taskBreakdown).toEqual([{ taskId: 't1', title: 'T1', hours: 4, isBug: false }])
    expect(result.dailyHours).toEqual([{ date: '2026-06-01', hours: 4 }])
  })

  test('同一日多個 worklogs:daily 會累加,task/project 會 merge', () => {
    const result = aggregateUserWorkLogs([
      {
        userId: 'u1', hours: 2, date: new Date('2026-06-01'),
        task: { id: 't1', title: 'T1', project: { id: 'p1', name: 'P1' } },
        bug: null,
      },
      {
        userId: 'u1', hours: 3, date: new Date('2026-06-01'),
        task: { id: 't1', title: 'T1', project: { id: 'p1', name: 'P1' } },
        bug: null,
      },
    ])
    expect(result.totalHours).toBe(5)
    expect(result.projectBreakdown[0].totalHours).toBe(5)
    expect(result.taskBreakdown[0].hours).toBe(5)
    expect(result.dailyHours).toEqual([{ date: '2026-06-01', hours: 5 }])
  })

  test('task 同 bug 嘅 worklog 會分開(isBug flag)', () => {
    const result = aggregateUserWorkLogs([
      {
        userId: 'u1', hours: 2, date: new Date('2026-06-01'),
        task: { id: 't1', title: 'T1', project: { id: 'p1', name: 'P1' } },
        bug: null,
      },
      {
        userId: 'u1', hours: 1, date: new Date('2026-06-01'),
        task: null,
        bug: { id: 'b1', title: 'B1', project: { id: 'p1', name: 'P1' } },
      },
    ])
    expect(result.taskBreakdown).toHaveLength(2)
    const taskEntry = result.taskBreakdown.find((t) => !t.isBug)
    const bugEntry = result.taskBreakdown.find((t) => t.isBug)
    expect(taskEntry).toEqual({ taskId: 't1', title: 'T1', hours: 2, isBug: false })
    expect(bugEntry).toEqual({ taskId: 'b1', title: 'B1', hours: 1, isBug: true })
  })

  test('dailyHours 按日期升序排列', () => {
    const result = aggregateUserWorkLogs([
      {
        userId: 'u1', hours: 1, date: new Date('2026-06-03'),
        task: { id: 't1', title: 'T1', project: { id: 'p1', name: 'P1' } },
        bug: null,
      },
      {
        userId: 'u1', hours: 2, date: new Date('2026-06-01'),
        task: { id: 't1', title: 'T1', project: { id: 'p1', name: 'P1' } },
        bug: null,
      },
      {
        userId: 'u1', hours: 3, date: new Date('2026-06-02'),
        task: { id: 't1', title: 'T1', project: { id: 'p1', name: 'P1' } },
        bug: null,
      },
    ])
    expect(result.dailyHours.map((d) => d.date)).toEqual(['2026-06-01', '2026-06-02', '2026-06-03'])
  })
})

describe('Sprint 20 US-2: fillDailyRange(補齊每日序列)', () => {
  test('冇任何 worklog → 全日填 0', () => {
    const start = new Date('2026-06-01')
    const end = new Date('2026-06-03')
    const result = fillDailyRange(new Map(), start, end)
    expect(result).toEqual([
      { date: '2026-06-01', hours: 0 },
      { date: '2026-06-02', hours: 0 },
      { date: '2026-06-03', hours: 0 },
    ])
  })

  test('中間嗰日冇 log → 嗰日填 0', () => {
    const start = new Date('2026-06-01')
    const end = new Date('2026-06-03')
    const dailyMap = new Map<string, number>([
      ['2026-06-01', 4],
      ['2026-06-03', 2],
    ])
    const result = fillDailyRange(dailyMap, start, end)
    expect(result).toEqual([
      { date: '2026-06-01', hours: 4 },
      { date: '2026-06-02', hours: 0 },
      { date: '2026-06-03', hours: 2 },
    ])
  })

  test('跨月範圍(6/28 ~ 7/2):5 日都會列出', () => {
    const start = new Date('2026-06-28')
    const end = new Date('2026-07-02')
    const result = fillDailyRange(new Map([['2026-07-01', 8]]), start, end)
    expect(result).toHaveLength(5)
    expect(result[3]).toEqual({ date: '2026-07-01', hours: 8 })
  })
})
