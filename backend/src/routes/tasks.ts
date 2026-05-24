import { Elysia, t } from 'elysia'
import { prisma } from '../utils/prisma'
import { hasPermission } from '../middleware/permission'

const taskRoutes = new Elysia({ prefix: '/tasks' })
  // Get tasks (filtered by assignee for developers)
  .get('/', async ({ query, user }) => {
    const where: any = {}

    if (query.projectId) where.projectId = query.projectId
    if (query.status) where.status = query.status
    if (query.requirementId) where.requirements = { some: { requirementId: query.requirementId } }

    // Developers and testers can only see their own tasks
    if (user && (user.role === 'developer' || user.role === 'tester')) {
      where.assigneeId = user.id
    } else if (query.assigneeId) {
      where.assigneeId = query.assigneeId
    }

    const tasks = await prisma.task.findMany({
      where,
      include: {
        assignee: { select: { id: true, name: true } },
        requirements: {
          include: { requirement: { select: { id: true, title: true } } }
        },
        workLogs: {
          select: { id: true, hours: true, workDate: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    return { tasks }
  })
  // Create task (Tech Lead or Admin with tasks.create)
  .post('/', async ({ body, set, user }) => {
    const { title, description, assigneeId, requirementIds, estimatedHours, projectId } = body as {
      title: string
      description?: string
      assigneeId?: string
      requirementIds?: string[]
      estimatedHours?: number
      projectId?: string
    }

    // Permission check: tasks.create OR admin/tech_lead for backward compat
    if (!user || (!hasPermission(user, 'tasks.create') && user.role !== 'admin' && user.role !== 'tech_lead')) {
      set.status = 403
      return { error: { code: 'FORBIDDEN', message: "Permission denied: 'tasks.create' is required" } }
    }

    const task = await prisma.task.create({
      data: {
        title,
        description,
        assigneeId,
        estimatedHours,
        projectId,
        requirements: requirementIds ? {
          create: requirementIds.map(rid => ({ requirementId: rid }))
        } : undefined
      },
      include: {
        assignee: { select: { id: true, name: true } },
        requirements: {
          include: { requirement: { select: { id: true, title: true } } }
        }
      }
    })

    return { task }
  }, {
    body: t.Object({
      title: t.String(),
      description: t.Optional(t.String()),
      assigneeId: t.Optional(t.String()),
      requirementIds: t.Optional(t.Array(t.String())),
      estimatedHours: t.Optional(t.Number()),
      projectId: t.Optional(t.String())
    })
  })
  // Get task by ID
  .get('/:id', async ({ params, set }) => {
    const task = await prisma.task.findUnique({
      where: { id: params.id },
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        requirements: {
          include: { requirement: true }
        },
        bugs: {
          select: { id: true, title: true, status: true, severity: true }
        },
        workLogs: {
          include: { user: { select: { id: true, name: true } } }
        }
      }
    })

    if (!task) {
      set.status = 404
      return { error: { code: 'NOT_FOUND', message: 'Task not found' } }
    }

    return { task }
  })
  // Update task
  .put('/:id', async ({ params, body, set, user }) => {
    const { title, description, status, assigneeId, estimatedHours } = body as {
      title?: string
      description?: string
      status?: string
      assigneeId?: string
      estimatedHours?: number
    }

    const existing = await prisma.task.findUnique({ where: { id: params.id } })
    if (!existing) {
      set.status = 404
      return { error: { code: 'NOT_FOUND', message: 'Task not found' } }
    }

    // Check permission: tasks.edit OR admin/tech_lead for backward compat
    if (!user || (!hasPermission(user, 'tasks.edit') && user.role !== 'admin' && user.role !== 'tech_lead')) {
      // Developers can only update status
      if (user?.role === 'developer' && (title || description || assigneeId || estimatedHours)) {
        set.status = 403
        return { error: { code: 'FORBIDDEN', message: "Permission denied: 'tasks.edit' is required" } }
      }
    }

    const task = await prisma.task.update({
      where: { id: params.id },
      data: { title, description, status, assigneeId, estimatedHours },
      include: {
        assignee: { select: { id: true, name: true } },
        requirements: {
          include: { requirement: { select: { id: true, title: true } } }
        }
      }
    })

    return { task }
  })
  // Delete task
  .delete('/:id', async ({ params, set, user }) => {
    if (!user || (!hasPermission(user, 'tasks.delete') && user.role !== 'admin' && user.role !== 'tech_lead')) {
      set.status = 403
      return { error: { code: 'FORBIDDEN', message: "Permission denied: 'tasks.delete' is required" } }
    }

    await prisma.task.delete({ where: { id: params.id } })
    return { success: true }
  })

export { taskRoutes }