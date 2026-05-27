import { Elysia, t } from 'elysia'
import { prisma } from '../utils/prisma'
import { hasPermission } from '../middleware/permission'

const workLogRoutes = new Elysia({ prefix: '/worklogs' })
  // Get work logs
  .get('/', async ({ query, user }) => {
    const where: any = {}

    if (query.userId) where.userId = query.userId
    if (query.taskId) where.taskId = query.taskId
    if (query.bugId) where.bugId = query.bugId

    // Non-admins see only their own logs (data filtering, not permission denial)
    if (!user || (user.role !== 'admin')) {
      where.userId = user?.id
    }

    // Filter by project access (admins see all)
    if (!user || (user.role !== 'admin')) {
      const accessibleProjectIds = await prisma.projectMember.findMany({
        where: { userId: user?.id },
        select: { projectId: true }
      }).then(r => r.map(m => m.projectId))

      where.task = { projectId: { in: accessibleProjectIds } }
    }

    // Filter by project
    if (query.projectId) {
      where.OR = [
        { task: { projectId: query.projectId } },
        { bug: { projectId: query.projectId } }
      ]
    }

    const dateFilter: any = {}
    if (query.startDate) dateFilter.gte = new Date(query.startDate)
    if (query.endDate) dateFilter.lte = new Date(query.endDate)
    if (Object.keys(dateFilter).length > 0) {
      where.date = dateFilter
    }

    const workLogs = await prisma.workLog.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, department: { select: { id: true, name: true } } } },
        task: { select: { id: true, title: true, project: { select: { id: true, name: true } } } },
        bug: { select: { id: true, title: true, project: { select: { id: true, name: true } } } }
      },
      orderBy: { date: 'desc' }
    })

    return { workLogs: workLogs.map(w => ({ ...w, workDate: w.date })) }
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

    return { workLog: { ...workLog, workDate: workLog.date } }
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

    // Permission check: worklogs.edit OR admin/owner
    if (!hasPermission(user, 'worklogs.edit') && user.role !== 'admin' && existing.userId !== user.id) {
      set.status = 403
      return { error: { code: 'FORBIDDEN', message: "Permission denied: 'worklogs.edit' is required" } }
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

    return { workLog: { ...workLog, workDate: workLog.date } }
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

    if (!hasPermission(user, 'worklogs.delete') && user.role !== 'admin' && existing.userId !== user.id) {
      set.status = 403
      return { error: { code: 'FORBIDDEN', message: "Permission denied: 'worklogs.delete' is required" } }
    }

    await prisma.workLog.delete({ where: { id: params.id } })
    return { success: true, workLog: { ...existing, workDate: existing.date } }
  })

export { workLogRoutes }