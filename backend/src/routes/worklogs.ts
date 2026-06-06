import { Elysia, t } from 'elysia'
import { prisma } from '../utils/prisma'
import { hasPermission } from '../middleware/permission'

const serializeWorkLog = (workLog: any) => ({
  ...workLog,
  workDate: workLog.date,
  note: workLog.description
})

const formatDateKey = (date: Date) => date.toISOString().slice(0, 10)

const getWeekKey = (date: Date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

const workLogRoutes = new Elysia({ prefix: '/worklogs' })
  // Get work logs with filtering and grouping
  .get('/', async ({ query, user }) => {
    const where: any = {}

    if (query.userId) where.userId = query.userId

    // Check permissions for viewing all logs
    // Admin or users with worklogs.view_all can see all logs
    // Others can only see their own logs (basic worklogs.view allows viewing own)
    const canViewAll = user && (user.role === 'admin' || hasPermission(user, 'worklogs.view_all'))

    if (!canViewAll) {
      // Non-admin users see only their own logs
      where.userId = user?.id
    }

    // Filter by project
    if (query.projectId) {
      where.OR = [
        { task: { projectId: query.projectId } },
        { bug: { projectId: query.projectId } }
      ]
    }

    // Date range filter (support both date and workDate)
    const dateFilter: any = {}
    if (query.startDate) dateFilter.gte = new Date(query.startDate)
    if (query.endDate) {
      const endDate = new Date(query.endDate)
      endDate.setHours(23, 59, 59, 999)
      dateFilter.lte = endDate
    }
    if (Object.keys(dateFilter).length > 0) {
      where.date = dateFilter
    }

    // Filter by department (only if user has permission or admin)
    if (query.departmentId && canViewAll) {
      where.user = { departmentId: query.departmentId }
    }

    // Group by feature
    if (query.groupBy) {
      const groupBy = query.groupBy as string

      // Get raw work logs with all needed relations
      const workLogs = await prisma.workLog.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              department: { select: { id: true, name: true } }
            }
          },
          task: {
            select: {
              id: true,
              title: true,
              project: { select: { id: true, name: true } }
            }
          },
          bug: {
            select: {
              id: true,
              title: true,
              project: { select: { id: true, name: true } }
            }
          }
        },
        orderBy: { date: 'desc' }
      })

      // Group the results
      let groupedData: any[] = []
      let groupKey = groupBy

      if (groupBy === 'user') {
        const grouped = new Map<string, { user: any; totalHours: number; count: number }>()
        for (const log of workLogs) {
          const key = log.user?.id || 'unknown'
          if (!grouped.has(key)) {
            grouped.set(key, {
              user: log.user,
              totalHours: 0,
              count: 0
            })
          }
          const entry = grouped.get(key)!
          entry.totalHours += Number(log.hours)
          entry.count += 1
        }
        groupedData = Array.from(grouped.values()).map(g => ({
          name: g.user?.name || '未知人員',
          department: g.user?.department?.name || '-',
          totalHours: Math.round(g.totalHours * 100) / 100,
          count: g.count
        }))
        groupKey = '人員'
      } else if (groupBy === 'department') {
        const grouped = new Map<string, { departmentId: string; departmentName: string; totalHours: number; count: number }>()
        for (const log of workLogs) {
          const deptId = log.user?.department?.id || log.user?.departmentId || 'unknown'
          const deptName = log.user?.department?.name || '未分組'
          if (!grouped.has(deptId)) {
            grouped.set(deptId, {
              departmentId: deptId,
              departmentName: deptName,
              totalHours: 0,
              count: 0
            })
          }
          const entry = grouped.get(deptId)!
          entry.totalHours += Number(log.hours)
          entry.count += 1
        }
        groupedData = Array.from(grouped.values()).map(g => ({
          name: g.departmentName,
          totalHours: Math.round(g.totalHours * 100) / 100,
          count: g.count
        }))
        groupKey = '部門'
      } else if (groupBy === 'project') {
        const grouped = new Map<string, { projectId: string; projectName: string; totalHours: number; count: number }>()
        for (const log of workLogs) {
          const projectId = log.task?.project?.id || log.bug?.project?.id || 'unknown'
          const projectName = log.task?.project?.name || log.bug?.project?.name || '未知項目'
          if (!grouped.has(projectId)) {
            grouped.set(projectId, {
              projectId,
              projectName,
              totalHours: 0,
              count: 0
            })
          }
          const entry = grouped.get(projectId)!
          entry.totalHours += Number(log.hours)
          entry.count += 1
        }
        groupedData = Array.from(grouped.values()).map(g => ({
          name: g.projectName,
          totalHours: Math.round(g.totalHours * 100) / 100,
          count: g.count
        }))
        groupKey = '項目'
      } else if (groupBy === 'day' || groupBy === 'time') {
        const grouped = new Map<string, { name: string; totalHours: number; count: number }>()
        for (const log of workLogs) {
          const key = formatDateKey(log.date)
          if (!grouped.has(key)) {
            grouped.set(key, {
              name: key,
              totalHours: 0,
              count: 0
            })
          }
          const entry = grouped.get(key)!
          entry.totalHours += Number(log.hours)
          entry.count += 1
        }
        groupedData = Array.from(grouped.values()).map(g => ({
          name: g.name,
          totalHours: Math.round(g.totalHours * 100) / 100,
          count: g.count
        }))
        groupKey = '日期'
      } else if (groupBy === 'week') {
        const grouped = new Map<string, { name: string; totalHours: number; count: number }>()
        for (const log of workLogs) {
          const key = getWeekKey(log.date)
          if (!grouped.has(key)) {
            grouped.set(key, {
              name: key,
              totalHours: 0,
              count: 0
            })
          }
          const entry = grouped.get(key)!
          entry.totalHours += Number(log.hours)
          entry.count += 1
        }
        groupedData = Array.from(grouped.values()).map(g => ({
          name: g.name,
          totalHours: Math.round(g.totalHours * 100) / 100,
          count: g.count
        }))
        groupKey = '週期'
      } else if (groupBy === 'month') {
        const grouped = new Map<string, { name: string; totalHours: number; count: number }>()
        for (const log of workLogs) {
          const key = log.date.toISOString().slice(0, 7)
          if (!grouped.has(key)) {
            grouped.set(key, {
              name: key,
              totalHours: 0,
              count: 0
            })
          }
          const entry = grouped.get(key)!
          entry.totalHours += Number(log.hours)
          entry.count += 1
        }
        groupedData = Array.from(grouped.values()).map(g => ({
          name: g.name,
          totalHours: Math.round(g.totalHours * 100) / 100,
          count: g.count
        }))
        groupKey = '月份'
      }

      // Calculate grand total
      const grandTotal = groupedData.reduce((sum, g) => sum + g.totalHours, 0)

      return {
        groupedData,
        groupBy,
        groupKey,
        grandTotal: Math.round(grandTotal * 100) / 100,
        totalCount: groupedData.length,
        totalRecords: workLogs.length
      }
    }

    // Regular list mode
    const workLogs = await prisma.workLog.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, department: { select: { id: true, name: true } } } },
        task: { select: { id: true, title: true, project: { select: { id: true, name: true } } } },
        bug: { select: { id: true, title: true, project: { select: { id: true, name: true } } } }
      },
      orderBy: { date: 'desc' }
    })

    return { workLogs: workLogs.map(serializeWorkLog) }
  })
  // Create work log
  .post('/', async ({ body, set, user }) => {
    const { taskId, bugId, hours, workDate, note } = body as {
      taskId?: string
      bugId?: string
      hours: number
      workDate: string
      note?: string
    }

    if (!user) {
      set.status = 401
      return { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }
    }

    // Permission check: worklogs.create
    if (!hasPermission(user, 'worklogs.create')) {
      set.status = 403
      return { error: { code: 'FORBIDDEN', message: "Permission denied: 'worklogs.create' is required" } }
    }

    if (!taskId && !bugId) {
      set.status = 400
      return { error: { code: 'VALIDATION_ERROR', message: 'Either taskId or bugId is required' } }
    }

    if (hours <= 0 || hours > 24) {
      set.status = 400
      return { error: { code: 'VALIDATION_ERROR', message: 'Hours must be between 0.01 and 24' } }
    }

    const workLog = await prisma.workLog.create({
      data: {
        userId: user.id,
        taskId,
        bugId,
        hours,
        date: new Date(workDate),
        description: note
      },
      include: {
        user: { select: { id: true, name: true, department: { select: { id: true, name: true } } } },
        task: { select: { id: true, title: true, project: { select: { id: true, name: true } } } },
        bug: { select: { id: true, title: true, project: { select: { id: true, name: true } } } }
      }
    })

    return { workLog: serializeWorkLog(workLog) }
  }, {
    body: t.Object({
      taskId: t.Optional(t.String()),
      bugId: t.Optional(t.String()),
      hours: t.Number(),
      workDate: t.String(),
      note: t.Optional(t.String())
    })
  })
  // Update work log
  .put('/:id', async ({ params, body, set, user }) => {
    if (!user) {
      set.status = 401
      return { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }
    }

    const existing = await prisma.workLog.findUnique({ where: { id: params.id } })
    if (!existing) {
      set.status = 404
      return { error: { code: 'NOT_FOUND', message: 'Work log not found' } }
    }

    // Admin can edit any log
    // Users with worklogs.edit_all permission can edit any log (bypass time check)
    // Users with worklogs.edit permission can only edit their own logs
    const canEditAll = user.role === 'admin' || hasPermission(user, 'worklogs.edit_all')
    const canEditOwn = hasPermission(user, 'worklogs.edit')

    if (existing.userId !== user.id) {
      if (!canEditAll) {
        set.status = 403
        return { error: { code: 'FORBIDDEN', message: '您沒有編輯他人工時的權限' } }
      }
    }

    // Non-admin and non-edit_all users cannot edit logs from previous months
    if (!canEditAll) {
      const now = new Date()
      const currentMonth = now.getMonth()
      const currentYear = now.getFullYear()
      const cutoffDate = new Date(currentYear, currentMonth, 5) // 5th of current month

      const logDate = new Date(existing.date)
      if (logDate < cutoffDate) {
        set.status = 403
        return { error: { code: 'FORBIDDEN', message: '無法修改上個月的工時記錄（如有需要，請聯繫管理員）' } }
      }
    }

    const { hours, workDate, note } = body as {
      hours?: number
      workDate?: string
      note?: string
    }

    const workLog = await prisma.workLog.update({
      where: { id: params.id },
      data: {
        hours,
        date: workDate ? new Date(workDate) : undefined,
        description: note
      },
      include: {
        user: { select: { id: true, name: true, department: { select: { id: true, name: true } } } },
        task: { select: { id: true, title: true, project: { select: { id: true, name: true } } } },
        bug: { select: { id: true, title: true, project: { select: { id: true, name: true } } } }
      }
    })

    return { workLog: serializeWorkLog(workLog) }
  })
  // Delete work log
  .delete('/:id', async ({ params, set, user }) => {
    if (!user) {
      set.status = 401
      return { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }
    }

    const existing = await prisma.workLog.findUnique({ where: { id: params.id } })
    if (!existing) {
      set.status = 404
      return { error: { code: 'NOT_FOUND', message: 'Work log not found' } }
    }

    // Admin can delete any log
    // Users with worklogs.delete_all permission can delete any log (bypass time check)
    // Users with worklogs.delete permission can only delete their own logs
    const canDeleteAll = user.role === 'admin' || hasPermission(user, 'worklogs.delete_all')
    const canDeleteOwn = hasPermission(user, 'worklogs.delete')

    if (existing.userId !== user.id) {
      if (!canDeleteAll) {
        set.status = 403
        return { error: { code: 'FORBIDDEN', message: '您沒有刪除他人工時的權限' } }
      }
    }

    // Non-admin and non-delete_all users cannot delete logs from previous months
    if (!canDeleteAll) {
      const now = new Date()
      const currentMonth = now.getMonth()
      const currentYear = now.getFullYear()
      const cutoffDate = new Date(currentYear, currentMonth, 5) // 5th of current month

      const logDate = new Date(existing.date)
      if (logDate < cutoffDate) {
        set.status = 403
        return { error: { code: 'FORBIDDEN', message: '無法刪除上個月的工時記錄（如有需要，請聯繫管理員）' } }
      }
    }

    await prisma.workLog.delete({ where: { id: params.id } })
    return { success: true, workLog: serializeWorkLog(existing) }
  })

export { workLogRoutes }
