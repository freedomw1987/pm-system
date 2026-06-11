import { Elysia } from 'elysia'
import { prisma } from '../utils/prisma'
import { hasPermission } from '../middleware/permission'

const reportRoutes = new Elysia({ prefix: '/reports' })
  // Cost report by project
  .get('/cost', async ({ query, set, user }) => {
    // Use permission system: reports.view permission OR admin/pm role (backward compat)
    if (!user || (!hasPermission(user, 'reports.view') && user.role !== 'admin' && user.role !== 'pm')) {
      set.status = 403
      return { error: { code: 'FORBIDDEN', message: 'Only Admin or PM can view cost reports' } }
    }

    if (!query.projectId) {
      set.status = 400
      return { error: { code: 'VALIDATION_ERROR', message: 'projectId is required' } }
    }

    const project = await prisma.project.findUnique({
      where: { id: query.projectId }
    })

    if (!project) {
      set.status = 404
      return { error: { code: 'NOT_FOUND', message: 'Project not found' } }
    }

    const workLogs = await prisma.workLog.findMany({
      // Sprint 9 fix: use same where.OR pattern as worklogs.ts:40-45
      // so the cost report matches the WorkLogs page exactly.
      // Counts worklogs on tasks-with-requirements, tasks-without-requirements,
      // tasks-whose-requirement-is-in-another-project, and bugs.
      where: {
        OR: [
          { task: { projectId: query.projectId } },
          { bug: { projectId: query.projectId } },
        ],
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        task: { select: { id: true, title: true } }
      }
    })

    const userMap = new Map<string, { userId: string; name: string; email: string; totalHours: number; tasks: { taskId: string; title: string; hours: number }[] }>()

    for (const log of workLogs) {
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
          entry.tasks.push({ taskId: log.taskId, title: log.task.title, hours: Number(log.hours) })
        }
      }
    }

    const members = Array.from(userMap.values())
    const totalHours = members.reduce((sum, m) => sum + m.totalHours, 0)

    return {
      project: { id: project.id, name: project.name },
      totalHours,
      members
    }
  })
  // Progress report by project
  .get('/progress', async ({ query, set, user }) => {
    // Use permission system: reports.view permission OR admin/pm role (backward compat)
    if (!user || (!hasPermission(user, 'reports.view') && user.role !== 'admin' && user.role !== 'pm')) {
      set.status = 403
      return { error: { code: 'FORBIDDEN', message: 'Only Admin or PM can view progress reports' } }
    }

    if (!query.projectId) {
      set.status = 400
      return { error: { code: 'VALIDATION_ERROR', message: 'projectId is required' } }
    }

    const project = await prisma.project.findUnique({
      where: { id: query.projectId }
    })

    if (!project) {
      set.status = 404
      return { error: { code: 'NOT_FOUND', message: 'Project not found' } }
    }

    // Sprint 9 fix: query requirements / tasks / bugs directly by projectId
    // (previously: only counted tasks linked to a requirement, and only bugs
    // linked to those tasks). Now matches the same shape as the cost report
    // and the WorkLogs page.
    const [
      totalRequirements,
      completedRequirements,
      totalTasks,
      completedTasks,
      totalBugs,
      openBugs,
      resolvedBugs,
    ] = await Promise.all([
      prisma.requirement.count({ where: { projectId: query.projectId } }),
      prisma.requirement.count({ where: { projectId: query.projectId, status: 'completed' } }),
      prisma.task.count({ where: { projectId: query.projectId } }),
      prisma.task.count({ where: { projectId: query.projectId, status: 'completed' } }),
      prisma.bug.count({ where: { projectId: query.projectId } }),
      prisma.bug.count({ where: { projectId: query.projectId, status: { in: ['open', 'in_progress'] } } }),
      // Sprint 9 fix: bug status enum is 4 options (open/in_progress/resolved/verified)
      // — drop the legacy 'closed' value (Sprint 7 alignment).
      prisma.bug.count({ where: { projectId: query.projectId, status: { in: ['resolved', 'verified'] } } }),
    ])

    return {
      project: { id: project.id, name: project.name },
      totalRequirements,
      completedRequirements,
      requirementsProgress: totalRequirements > 0 ? Math.round((completedRequirements / totalRequirements) * 100) : 0,
      totalTasks,
      completedTasks,
      tasksProgress: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
      totalBugs,
      openBugs,
      resolvedBugs
    }
  })
  // Sprint 20 US-2: 部門視角報表
  // Aggregate across projects within a department over an optional date range
  .get('/by-department', async ({ query, set, user }) => {
    if (!user || (!hasPermission(user, 'reports.view') && user.role !== 'admin' && user.role !== 'pm')) {
      set.status = 403
      return { error: { code: 'FORBIDDEN', message: 'Only Admin or PM can view reports' } }
    }

    const startDate = query.startDate ? new Date(query.startDate as string) : null
    const endDate = query.endDate ? new Date(query.endDate as string) : null

    // 1. 列出所有部門(若指定 departmentId 則只列一個)
    const departments = await prisma.department.findMany({
      where: query.departmentId ? { id: query.departmentId as string } : undefined,
      orderBy: { name: 'asc' },
    })

    // 2. 對每個部門: 揾用戶 → 揾 workLogs(可加日期過濾) → 聚合
    const results: any[] = []
    for (const dept of departments) {
      const deptUsers = await prisma.user.findMany({
        where: { departmentId: dept.id },
        select: { id: true, name: true, email: true },
      })
      const userIds = deptUsers.map((u) => u.id)
      if (userIds.length === 0) {
        results.push({
          department: { id: dept.id, name: dept.name },
          totalHours: 0,
          projectBreakdown: [],
          userBreakdown: [],
          totalRequirements: 0,
          completedRequirements: 0,
          requirementsProgress: 0,
          totalTasks: 0,
          completedTasks: 0,
          tasksProgress: 0,
          openBugs: 0,
        })
        continue
      }

      const dateFilter = startDate || endDate
        ? {
            date: {
              ...(startDate ? { gte: startDate } : {}),
              ...(endDate ? { lte: endDate } : {}),
            },
          }
        : {}

      const workLogs = await prisma.workLog.findMany({
        where: { userId: { in: userIds }, ...dateFilter },
        include: {
          task: { select: { id: true, title: true, projectId: true, project: { select: { id: true, name: true } } } },
          bug: { select: { id: true, title: true, projectId: true, project: { select: { id: true, name: true } } } },
        },
      })

      // 用戶聚合
      const userMap = new Map<string, { userId: string; name: string; email: string; totalHours: number }>()
      // 項目聚合
      const projectMap = new Map<string, { projectId: string; name: string; totalHours: number }>()
      let totalHours = 0

      for (const log of workLogs) {
        const hours = Number(log.hours)
        totalHours += hours

        if (!userMap.has(log.userId)) {
          const u = deptUsers.find((x) => x.id === log.userId)
          userMap.set(log.userId, {
            userId: log.userId,
            name: u?.name || '?',
            email: u?.email || '',
            totalHours: 0,
          })
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

      // 進度指標:統計該部門用戶參與嘅項目 (限於 dateFilter 內有 workLog 嘅項目)
      const projectIds = Array.from(projectMap.keys())
      const [
        totalRequirements,
        completedRequirements,
        totalTasks,
        completedTasks,
        openBugs,
      ] = projectIds.length > 0
        ? await Promise.all([
            prisma.requirement.count({ where: { projectId: { in: projectIds } } }),
            prisma.requirement.count({ where: { projectId: { in: projectIds }, status: 'completed' } }),
            prisma.task.count({ where: { projectId: { in: projectIds } } }),
            prisma.task.count({ where: { projectId: { in: projectIds }, status: 'completed' } }),
            prisma.bug.count({ where: { projectId: { in: projectIds }, status: { in: ['open', 'in_progress'] } } }),
          ])
        : [0, 0, 0, 0, 0]

      results.push({
        department: { id: dept.id, name: dept.name },
        totalHours,
        userCount: deptUsers.length,
        projectBreakdown: Array.from(projectMap.values()).sort((a, b) => b.totalHours - a.totalHours),
        userBreakdown: Array.from(userMap.values()).sort((a, b) => b.totalHours - a.totalHours),
        totalRequirements,
        completedRequirements,
        requirementsProgress: totalRequirements > 0 ? Math.round((completedRequirements / totalRequirements) * 100) : 0,
        totalTasks,
        completedTasks,
        tasksProgress: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
        openBugs,
      })
    }

    return { departments: results }
  })
  // Sprint 20 US-2: 個人視角報表
  // Per-user breakdown over an optional date range with daily granularity
  .get('/by-user', async ({ query, set, user }) => {
    if (!user || (!hasPermission(user, 'reports.view') && user.role !== 'admin' && user.role !== 'pm')) {
      set.status = 403
      return { error: { code: 'FORBIDDEN', message: 'Only Admin or PM can view reports' } }
    }

    const userId = query.userId as string | undefined
    const startDate = query.startDate ? new Date(query.startDate as string) : null
    const endDate = query.endDate ? new Date(query.endDate as string) : null

    // 1. 列出用戶(若有 userId 則單一)
    const targetUsers = await prisma.user.findMany({
      where: { isAgent: false, ...(userId ? { id: userId } : {}) },
      include: { department: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    })

    const results: any[] = []
    for (const u of targetUsers) {
      const dateFilter = startDate || endDate
        ? {
            date: {
              ...(startDate ? { gte: startDate } : {}),
              ...(endDate ? { lte: endDate } : {}),
            },
          }
        : {}

      const workLogs = await prisma.workLog.findMany({
        where: { userId: u.id, ...dateFilter },
        orderBy: { date: 'asc' },
        include: {
          task: { select: { id: true, title: true, projectId: true, project: { select: { id: true, name: true } } } },
          bug: { select: { id: true, title: true, projectId: true, project: { select: { id: true, name: true } } } },
        },
      })

      // 項目 + 任務 + 每日小時聚合
      const projectMap = new Map<string, { projectId: string; name: string; totalHours: number }>()
      const taskMap = new Map<string, { taskId: string; title: string; hours: number; isBug: boolean }>()
      const dailyMap = new Map<string, number>()
      let totalHours = 0

      for (const log of workLogs) {
        const hours = Number(log.hours)
        totalHours += hours
        // .slice() 而唔用 .split('T')[0] 以避開 noUncheckedIndexedAccess
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

      // 補齊每日序列(start..end 之間冇 log 嘅日子填 0)
      const dailyHours: { date: string; hours: number }[] = []
      if (startDate && endDate) {
        const cursor = new Date(startDate)
        while (cursor <= endDate) {
          const k: string = cursor.toISOString().slice(0, 10)
          dailyHours.push({ date: k, hours: dailyMap.get(k) || 0 })
          cursor.setDate(cursor.getDate() + 1)
        }
      } else {
        for (const [k, v] of Array.from(dailyMap.entries()).sort()) {
          dailyHours.push({ date: k, hours: v })
        }
      }

      results.push({
        user: { id: u.id, name: u.name, email: u.email, department: u.department },
        totalHours,
        projectBreakdown: Array.from(projectMap.values()).sort((a, b) => b.totalHours - a.totalHours),
        taskBreakdown: Array.from(taskMap.values()).sort((a, b) => b.hours - a.hours),
        dailyHours,
        logCount: workLogs.length,
      })
    }

    return { users: results }
  })

export { reportRoutes }