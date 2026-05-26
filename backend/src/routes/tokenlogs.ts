import { Elysia, t } from 'elysia'
import { prisma } from '../utils/prisma'
import { hasPermission } from '../middleware/permission'

const tokenLogRoutes = new Elysia({ prefix: '/token-logs' })
  // List token logs (filtered by agent, task, project)
  .get('/', async ({ query, user }) => {
    if (!user || (!hasPermission(user, 'tokenlogs.view') && user.role !== 'admin')) {
      return { error: { code: 'FORBIDDEN', message: 'Permission denied' } }
    }

    const where: any = {}

    // Filter by agent
    if (query.userId) {
      where.userId = query.userId
    }

    // Filter by task
    if (query.taskId) {
      where.taskId = query.taskId
    }

    // Filter by date range
    if (query.startDate || query.endDate) {
      where.date = {}
      if (query.startDate) {
        where.date.gte = new Date(query.startDate as string)
      }
      if (query.endDate) {
        where.date.lte = new Date(query.endDate as string)
      }
    }

    // Get agents only if filtering by agents
    if (query.agentsOnly === 'true') {
      where.user = { isAgent: true }
    }

    const tokenLogs = await prisma.tokenLog.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, isAgent: true } },
        task: { select: { id: true, title: true, projectId: true } }
      },
      orderBy: { date: 'desc' },
      take: query.limit ? parseInt(query.limit as string) : 100
    })

    // Calculate summary
    const summary = await prisma.tokenLog.aggregate({
      where,
      _sum: { tokensUsed: true, inputTokens: true, outputTokens: true },
      _count: true
    })

    return {
      tokenLogs,
      summary: {
        totalTokens: summary._sum.tokensUsed || 0,
        totalInputTokens: summary._sum.inputTokens || 0,
        totalOutputTokens: summary._sum.outputTokens || 0,
        count: summary._count
      }
    }
  })
  // Create token log (agent or system)
  .post('/', async ({ body, set, user }) => {
    if (!user || (!hasPermission(user, 'tokenlogs.create') && user.role !== 'admin')) {
      set.status = 403
      return { error: { code: 'FORBIDDEN', message: 'Permission denied' } }
    }

    const { taskId, tokensUsed, inputTokens, outputTokens, model, costUSD, description, date } = body as {
      taskId?: string
      tokensUsed: number
      inputTokens?: number
      outputTokens?: number
      model: string
      costUSD?: number
      description?: string
      date?: string
    }

    // Verify task exists if provided
    if (taskId) {
      const task = await prisma.task.findUnique({ where: { id: taskId } })
      if (!task) {
        set.status = 404
        return { error: { code: 'NOT_FOUND', message: 'Task not found' } }
      }
    }

    const tokenLog = await prisma.tokenLog.create({
      data: {
        userId: user.id,
        taskId,
        tokensUsed,
        inputTokens,
        outputTokens,
        model,
        costUSD,
        description,
        date: date ? new Date(date) : new Date()
      },
      include: {
        user: { select: { id: true, name: true, isAgent: true } },
        task: { select: { id: true, title: true } }
      }
    })

    return { tokenLog }
  }, {
    body: t.Object({
      taskId: t.Optional(t.String()),
      tokensUsed: t.Number(),
      inputTokens: t.Optional(t.Number()),
      outputTokens: t.Optional(t.Number()),
      model: t.String(),
      costUSD: t.Optional(t.Number()),
      description: t.Optional(t.String()),
      date: t.Optional(t.String())
    })
  })
  // Delete token log (admin only)
  .delete('/:id', async ({ params, set, user }) => {
    if (!user || user.role !== 'admin') {
      set.status = 403
      return { error: { code: 'FORBIDDEN', message: 'Admin permission required' } }
    }

    const existing = await prisma.tokenLog.findUnique({ where: { id: params.id } })
    if (!existing) {
      set.status = 404
      return { error: { code: 'NOT_FOUND', message: 'Token log not found' } }
    }

    await prisma.tokenLog.delete({ where: { id: params.id } })
    return { success: true }
  })
  // Get token stats by model
  .get('/stats/by-model', async ({ query, user }) => {
    if (!user || (!hasPermission(user, 'tokenlogs.view') && user.role !== 'admin')) {
      return { error: { code: 'FORBIDDEN', message: 'Permission denied' } }
    }

    const where: any = {}
    if (query.userId) {
      where.userId = query.userId
    }
    if (query.startDate || query.endDate) {
      where.date = {}
      if (query.startDate) where.date.gte = new Date(query.startDate as string)
      if (query.endDate) where.date.lte = new Date(query.endDate as string)
    }

    const stats = await prisma.tokenLog.groupBy({
      by: ['model'],
      where,
      _sum: { tokensUsed: true, inputTokens: true, outputTokens: true },
      _count: true
    })

    return {
      stats: stats.map(s => ({
        model: s.model,
        totalTokens: s._sum.tokensUsed || 0,
        totalInputTokens: s._sum.inputTokens || 0,
        totalOutputTokens: s._sum.outputTokens || 0,
        count: s._count
      }))
    }
  })
  // Get token stats by agent
  .get('/stats/by-agent', async ({ query, user }) => {
    if (!user || (!hasPermission(user, 'tokenlogs.view') && user.role !== 'admin')) {
      return { error: { code: 'FORBIDDEN', message: 'Permission denied' } }
    }

    const where: any = { user: { isAgent: true } }
    if (query.startDate || query.endDate) {
      where.date = {}
      if (query.startDate) where.date.gte = new Date(query.startDate as string)
      if (query.endDate) where.date.lte = new Date(query.endDate as string)
    }

    const stats = await prisma.tokenLog.groupBy({
      by: ['userId'],
      where,
      _sum: { tokensUsed: true },
      _count: true
    })

    // Get user details
    const userIds = stats.map(s => s.userId)
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true }
    })

    return {
      stats: stats.map(s => ({
        userId: s.userId,
        user: users.find(u => u.id === s.userId),
        totalTokens: s._sum.tokensUsed || 0,
        count: s._count
      }))
    }
  })

export { tokenLogRoutes }