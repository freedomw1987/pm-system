import { Elysia, t } from 'elysia'
import { prisma } from '../utils/prisma'
import { hasPermission } from '../middleware/permission'

const bugRoutes = new Elysia({ prefix: '/bugs' })
  // Get bugs
  .get('/', async ({ query, user }) => {
    const where: any = {}

    if (query.taskId) where.taskId = query.taskId
    if (query.status) where.status = query.status
    if (query.reporterId) where.reporterId = query.reporterId
    if (query.requirementId) where.requirementId = query.requirementId
    if (query.projectId) where.projectId = query.projectId

    // Testers and developers see only relevant bugs (data filtering, not permission denial)
    if (user && (user.role === 'tester' || user.role === 'developer')) {
      where.OR = [
        { reporterId: user.id },
        { task: { assigneeId: user.id } }
      ]
    }

    const bugs = await prisma.bug.findMany({
      where,
      include: {
        reporter: { select: { id: true, name: true } },
        task: { select: { id: true, title: true } }
      },
      orderBy: { createdAt: 'desc' }
    })

    return { bugs }
  })
  // Create bug (Tester or Admin with bugs.create)
  .post('/', async ({ body, set, user }) => {
    const { title, description, taskId, severity, requirementId, projectId } = body as {
      title: string
      description?: string
      taskId?: string
      severity?: string
      requirementId?: string
      projectId?: string
    }

    // Permission check: bugs.create OR admin/tester for backward compat
    if (!user || (!hasPermission(user, 'bugs.create') && user.role !== 'admin' && user.role !== 'tester')) {
      set.status = 403
      return { error: { code: 'FORBIDDEN', message: "Permission denied: 'bugs.create' is required" } }
    }

    const bug = await prisma.bug.create({
      data: {
        title,
        description,
        taskId,
        reporterId: user.id,
        severity: severity || 'medium',
        requirementId,
        projectId
      },
      include: {
        reporter: { select: { id: true, name: true } },
        task: { select: { id: true, title: true } }
      }
    })

    return { bug }
  }, {
    body: t.Object({
      title: t.String(),
      description: t.Optional(t.String()),
      taskId: t.Optional(t.String()),
      severity: t.Optional(t.String()),
      requirementId: t.Optional(t.String()),
      projectId: t.Optional(t.String())
    })
  })
  // Update bug
  .put('/:id', async ({ params, body, set, user }) => {
    const { status, description } = body as { status?: string; description?: string }

    const existing = await prisma.bug.findUnique({ where: { id: params.id } })
    if (!existing) {
      set.status = 404
      return { error: { code: 'NOT_FOUND', message: 'Bug not found' } }
    }

    // Check permission: bugs.edit OR admin/dev/tl/reporter for backward compat
    if (!user || (!hasPermission(user, 'bugs.edit') &&
        user.role !== 'admin' &&
        user.role !== 'developer' &&
        user.role !== 'tech_lead' &&
        existing.reporterId !== user.id)) {
      set.status = 403
      return { error: { code: 'FORBIDDEN', message: "Permission denied: 'bugs.edit' is required" } }
    }

    const bug = await prisma.bug.update({
      where: { id: params.id },
      data: { status, description },
      include: {
        reporter: { select: { id: true, name: true } },
        task: { select: { id: true, title: true } }
      }
    })

    return { bug }
  })
  // Delete bug
  .delete('/:id', async ({ params, set, user }) => {
    if (!user || (!hasPermission(user, 'bugs.delete') && user.role !== 'admin')) {
      set.status = 403
      return { error: { code: 'FORBIDDEN', message: "Permission denied: 'bugs.delete' is required" } }
    }

    await prisma.bug.delete({ where: { id: params.id } })
    return { success: true }
  })

export { bugRoutes }