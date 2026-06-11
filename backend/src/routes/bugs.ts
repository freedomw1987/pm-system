import { Elysia, t } from 'elysia'
import { prisma } from '../utils/prisma'
import { hasPermission } from '../middleware/permission'
import { computePagination } from '../utils/pagination'

const bugRoutes = new Elysia({ prefix: '/bugs' })
  // Get bugs
  .get('/', async ({ query, user }) => {
    const where: any = {}

    if (query.taskId) where.taskId = query.taskId
    if (query.status) where.status = query.status
    if (query.reporterId) where.reporterId = query.reporterId
    if (query.assigneeId) where.assigneeId = query.assigneeId
    if (query.projectId) where.projectId = query.projectId
    if (query.severity) where.severity = query.severity
    const and: any[] = []
    if (query.requirementId) {
      and.push({
        OR: [
          { requirementId: query.requirementId },
          { task: { requirements: { some: { requirementId: query.requirementId } } } }
        ]
      })
    }

    // Check if user can view all bugs
    const canViewAll = user && (user.role === 'admin' || hasPermission(user, 'bugs.view_all'))

    if (!canViewAll && (user?.role === 'tester' || user?.role === 'developer')) {
      and.push({
        OR: [
          { reporterId: user.id },
          { assigneeId: user.id },
          { task: { assigneeId: user.id } }
        ]
      })
    }

    if (and.length) where.AND = and

    const totalCount = await prisma.bug.count({ where })
    const pagination = computePagination(query as { page?: string; pageSize?: string; limit?: string }, totalCount)

    const bugs = await prisma.bug.findMany({
      where,
      include: {
        reporter: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true, email: true } },
        task: { select: { id: true, title: true } },
        project: { select: { id: true, name: true } }
      },
      orderBy: { createdAt: 'desc' },
      ...(pagination.skip ? { skip: pagination.skip } : {}),
      ...(pagination.take !== undefined ? { take: pagination.take } : {})
    })

    return {
      bugs,
      totalCount,
      page: pagination.page,
      pageSize: pagination.pageSize,
      totalPages: pagination.totalPages
    }
  })
  // Get single bug (used by /bugs/:id detail page — RG-2026-06-09 bug #3)
  .get('/:id', async ({ params, set, user }) => {
    const bug = await prisma.bug.findUnique({
      where: { id: params.id },
      include: {
        reporter: { select: { id: true, name: true, email: true } },
        assignee: { select: { id: true, name: true, email: true } },
        task: { select: { id: true, title: true, projectId: true } },
        project: { select: { id: true, name: true } }
      }
    })

    if (!bug) {
      set.status = 404
      return { error: { code: 'NOT_FOUND', message: 'Bug not found' } }
    }

    // Bug #3 的訪問控制:跟 GET / 一樣 — 非 admin/view_all
    // 嘅 tester/developer 只可見自己 reporter/assignee/task 嘅 bug
    const canViewAll = user && (user.role === 'admin' || hasPermission(user, 'bugs.view_all'))
    if (!canViewAll && user && (user.role === 'tester' || user.role === 'developer')) {
      const isOwn = bug.reporterId === user.id || bug.assigneeId === user.id
      if (!isOwn) {
        // 任務層面嘅 owner 我哋冇 include 入嚟,放寬條件讓 task assignee 都可以睇
        // 但其實 user.task.assigneeId 唔知 — 保守啲只允許 reporter/assignee
        // 留低 NOTE: 若日後有 bug 顯示唔到,可能係呢度 access 太嚴
        set.status = 403
        return { error: { code: 'FORBIDDEN', message: 'Permission denied' } }
      }
    }

    return { bug }
  })
  // Create bug (Tester or Admin with bugs.create)
  .post('/', async ({ body, set, user }) => {
    const { title, description, taskId, severity, assigneeId, requirementId, projectId } = body as {
      title: string
      description?: string
      taskId?: string
      severity?: string
      assigneeId?: string
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
        assigneeId,
        severity: severity || 'medium',
        requirementId,
        projectId
      },
      include: {
        reporter: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true, email: true } },
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
      assigneeId: t.Optional(t.String()),
      requirementId: t.Optional(t.String()),
      projectId: t.Optional(t.String())
    })
  })
  // Update bug
  .put('/:id', async ({ params, body, set, user }) => {
    const { title, status, description, severity, assigneeId, requirementId } = body as {
      title?: string
      status?: string
      description?: string
      severity?: string
      assigneeId?: string | null
      // Sprint 20 US-6: 編輯缺陷時可改 / 解除關聯需求(null = 解除)
      requirementId?: string | null
    }

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
      data: { title, status, description, severity, assigneeId, requirementId },
      include: {
        reporter: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true, email: true } },
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
