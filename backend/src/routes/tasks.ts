import { Elysia, t } from 'elysia'
import { prisma } from '../utils/prisma'
import { hasPermission } from '../middleware/permission'
import { findBestAgent, getAgentsSkillOverview } from '../agent/skill-matcher'
import { broadcastToAgents, getConnectedAgents } from '../agent/runtime'
import { executeTask } from '../agent/task-executor'
import { computePagination } from '../utils/pagination'

const userSelect = { id: true, name: true, email: true, isAgent: true }

const taskInclude = {
  assignee: { select: userSelect },
  participants: {
    include: { user: { select: userSelect } }
  },
  parentTask: { select: { id: true, title: true, status: true } },
  subtasks: {
    select: {
      id: true,
      title: true,
      status: true,
      assignee: { select: { id: true, name: true } }
    }
  },
  requirements: {
    include: { requirement: { select: { id: true, title: true } } }
  },
  workLogs: {
    select: { id: true, hours: true, date: true }
  }
}

const normalizeParticipantIds = (assigneeId?: string | null, participantIds?: string[], assigneeIds?: string[]) => {
  const ids = new Set<string>()
  if (assigneeId) ids.add(assigneeId)
  for (const id of participantIds || []) {
    if (id) ids.add(id)
  }
  for (const id of assigneeIds || []) {
    if (id) ids.add(id)
  }
  return Array.from(ids)
}

const userTaskMembershipWhere = (userId: string) => [
  { assigneeId: userId },
  { participants: { some: { userId } } }
]

export const resolveTaskProjectId = (
  projectId: string | undefined,
  requirements: Array<{ id: string; projectId: string }>
) => {
  const requirementProjectIds = Array.from(new Set(requirements.map(requirement => requirement.projectId)))

  if (requirementProjectIds.length > 1) {
    return { error: 'All linked requirements must belong to the same project' }
  }

  const requirementProjectId = requirementProjectIds[0]
  if (requirementProjectId && projectId && projectId !== requirementProjectId) {
    return { error: 'All linked requirements must belong to the task project' }
  }

  return { projectId: projectId || requirementProjectId }
}

export const buildTaskListWhere = (query: any, user: any) => {
  const where: any = {}

  if (query.projectId) where.projectId = query.projectId
  if (query.status) where.status = query.status
  if (query.requirementId) where.requirements = { some: { requirementId: query.requirementId } }

  const canViewAll = user && (user.role === 'admin' || hasPermission(user, 'tasks.view_all'))

  if (!canViewAll && (user?.role === 'developer' || user?.role === 'tester')) {
    where.OR = userTaskMembershipWhere(user.id)
  } else if (query.assigneeId) {
    where.OR = userTaskMembershipWhere(query.assigneeId)
  }

  return where
}

const taskRoutes = new Elysia({ prefix: '/tasks' })
  // Get tasks (filtered by assignee for developers)
  .get('/', async ({ query, user }) => {
    const where = buildTaskListWhere(query, user)

    const totalCount = await prisma.task.count({ where })
    const pagination = computePagination(query as { page?: string; pageSize?: string; limit?: string }, totalCount)

    const tasks = await prisma.task.findMany({
      where,
      include: taskInclude,
      orderBy: { createdAt: 'desc' },
      ...(pagination.skip ? { skip: pagination.skip } : {}),
      ...(pagination.take !== undefined ? { take: pagination.take } : {})
    })

    return {
      tasks,
      totalCount,
      page: pagination.page,
      pageSize: pagination.pageSize,
      totalPages: pagination.totalPages
    }
  })
  // Create task (Tech Lead or Admin with tasks.create)
  .post('/', async ({ body, set, user }) => {
    const { title, description, assigneeId, assigneeIds, participantIds, parentTaskId, requirementIds, estimatedHours, projectId } = body as {
      title: string
      description?: string
      assigneeId?: string | null
      assigneeIds?: string[]
      participantIds?: string[]
      parentTaskId?: string | null
      requirementIds?: string[]
      estimatedHours?: number
      projectId?: string
    }

    // Permission check: tasks.create OR admin/tech_lead for backward compat
    if (!user || (!hasPermission(user, 'tasks.create') && user.role !== 'admin' && user.role !== 'tech_lead')) {
      set.status = 403
      return { error: { code: 'FORBIDDEN', message: "Permission denied: 'tasks.create' is required" } }
    }

    const uniqueRequirementIds = Array.from(new Set((requirementIds || []).filter(Boolean)))
    const linkedRequirements = uniqueRequirementIds.length
      ? await prisma.requirement.findMany({
          where: { id: { in: uniqueRequirementIds } },
          select: { id: true, projectId: true }
        })
      : []

    if (linkedRequirements.length !== uniqueRequirementIds.length) {
      set.status = 400
      return { error: { code: 'VALIDATION_ERROR', message: 'Linked requirement not found' } }
    }

    const projectResolution = resolveTaskProjectId(projectId, linkedRequirements)
    if (projectResolution.error) {
      set.status = 400
      return { error: { code: 'VALIDATION_ERROR', message: projectResolution.error } }
    }

    const taskProjectId = projectResolution.projectId
    if (!taskProjectId) {
      set.status = 400
      return { error: { code: 'VALIDATION_ERROR', message: 'projectId is required' } }
    }

    if (parentTaskId) {
      const parentTask = await prisma.task.findUnique({
        where: { id: parentTaskId },
        select: { projectId: true }
      })
      if (!parentTask || parentTask.projectId !== taskProjectId) {
        set.status = 400
        return { error: { code: 'VALIDATION_ERROR', message: 'Parent task must belong to the same project' } }
      }
    }

    const normalizedParticipantIds = normalizeParticipantIds(assigneeId, participantIds, assigneeIds)

    const task = await prisma.task.create({
      data: {
        title,
        description,
        assigneeId: assigneeId || undefined,
        parentTaskId: parentTaskId || undefined,
        estimatedHours,
        projectId: taskProjectId,
        participants: normalizedParticipantIds.length ? {
          create: normalizedParticipantIds.map(userId => ({ userId }))
        } : undefined,
        requirements: uniqueRequirementIds.length ? {
          create: uniqueRequirementIds.map(rid => ({ requirementId: rid }))
        } : undefined
      },
      include: {
        ...taskInclude,
        project: { select: { id: true, name: true } }
      }
    })

    // Notify connected agents about new task
    const connectedAgentIds = getConnectedAgents()
    if (connectedAgentIds.length > 0 && !assigneeId) {
      // Only broadcast if task is unassigned
      broadcastToAgents({
        type: 'new_task',
        payload: {
          task: {
            id: task.id,
            title: task.title,
            description: task.description,
            projectId: task.projectId,
            projectName: task.project?.name
          }
        }
      })
    }

    return { task }
  }, {
    body: t.Object({
      title: t.String(),
      description: t.Optional(t.String()),
      assigneeId: t.Optional(t.String()),
      assigneeIds: t.Optional(t.Array(t.String())),
      participantIds: t.Optional(t.Array(t.String())),
      parentTaskId: t.Optional(t.Nullable(t.String())),
      requirementIds: t.Optional(t.Array(t.String())),
      estimatedHours: t.Optional(t.Number()),
      projectId: t.Optional(t.String())
    })
  })
  // Get task by ID
  .get('/:id', async ({ params, set, user }) => {
    // Require authentication
    if (!user) {
      set.status = 401
      return { error: { code: 'UNAUTHORIZED', message: 'Login required' } }
    }

    const task = await prisma.task.findUnique({
      where: { id: params.id },
      include: {
        ...taskInclude,
        bugs: {
          select: { id: true, title: true, status: true, severity: true }
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
    const { title, description, status, assigneeId, assigneeIds, participantIds, parentTaskId, estimatedHours } = body as {
      title?: string
      description?: string
      status?: string
      assigneeId?: string | null
      assigneeIds?: string[]
      participantIds?: string[]
      parentTaskId?: string | null
      estimatedHours?: number
    }

    const existing = await prisma.task.findUnique({ where: { id: params.id } })
    if (!existing) {
      set.status = 404
      return { error: { code: 'NOT_FOUND', message: 'Task not found' } }
    }

    if (parentTaskId === params.id) {
      set.status = 400
      return { error: { code: 'VALIDATION_ERROR', message: 'A task cannot be its own parent' } }
    }

    if (parentTaskId) {
      const parentTask = await prisma.task.findUnique({
        where: { id: parentTaskId },
        select: { projectId: true }
      })
      if (!parentTask || parentTask.projectId !== existing.projectId) {
        set.status = 400
        return { error: { code: 'VALIDATION_ERROR', message: 'Parent task must belong to the same project' } }
      }
    }

    // Check permission: tasks.edit OR admin/tech_lead for backward compat
    if (!user || (!hasPermission(user, 'tasks.edit') && user.role !== 'admin' && user.role !== 'tech_lead')) {
      // Developers can only update status
      if (user?.role === 'developer' && (title || description || assigneeId || assigneeIds || participantIds || parentTaskId || estimatedHours)) {
        set.status = 403
        return { error: { code: 'FORBIDDEN', message: "Permission denied: 'tasks.edit' is required" } }
      }
    }

    const shouldReplaceParticipants = Array.isArray(participantIds) || Array.isArray(assigneeIds) || assigneeId !== undefined
    const normalizedParticipantIds = shouldReplaceParticipants
      ? normalizeParticipantIds(assigneeId, participantIds, assigneeIds)
      : []

    const task = await prisma.task.update({
      where: { id: params.id },
      data: {
        title,
        description,
        status,
        assigneeId,
        parentTaskId,
        estimatedHours,
        participants: shouldReplaceParticipants ? {
          deleteMany: {},
          create: normalizedParticipantIds.map(userId => ({ userId }))
        } : undefined
      },
      include: taskInclude
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
  // Recommend agent for a task (智能分配)
  .get('/:id/recommend-agent', async ({ params, user }) => {
    if (!user) {
      return { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }
    }

    const task = await prisma.task.findUnique({
      where: { id: params.id },
      include: {
        project: { select: { id: true, name: true } },
        requirements: {
          include: { requirement: { select: { id: true, title: true } } }
        }
      }
    })

    if (!task) {
      return { error: { code: 'NOT_FOUND', message: 'Task not found' } }
    }

    const recommendation = await findBestAgent(params.id)

    return {
      taskId: params.id,
      taskTitle: task.title,
      recommendation
    }
  })
  // Get all agents skill overview (for task assignment UI)
  .get('/agents/overview', async ({ user }) => {
    if (!user) {
      return { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }
    }

    const overview = await getAgentsSkillOverview()
    return overview
  })
  // Auto-assign task to best matching agent
  .post('/:id/auto-assign', async ({ params, set, user }) => {
    if (!user || (user.role !== 'admin' && user.role !== 'tech_lead' && !hasPermission(user, 'tasks.assign'))) {
      set.status = 403
      return { error: { code: 'FORBIDDEN', message: 'Permission denied' } }
    }

    const task = await prisma.task.findUnique({ where: { id: params.id } })
    if (!task) {
      set.status = 404
      return { error: { code: 'NOT_FOUND', message: 'Task not found' } }
    }

    // For in_progress tasks with agent, don't allow reassignment
    if (task.assigneeId && task.status === 'in_progress') {
      set.status = 400
      return { error: { code: 'BAD_REQUEST', message: '任務正在進行中，請先在 Agent 監控中中止任務' } }
    }

    const recommendation = await findBestAgent(params.id)
    if (!recommendation) {
      set.status = 400
      return { error: { code: 'BAD_REQUEST', message: '找不到擅長此任務的 Agent' } }
    }

    // Assign task to the recommended agent
    const updatedTask = await prisma.task.update({
      where: { id: params.id },
      data: {
        assigneeId: recommendation.agent.id,
        status: 'in_progress'
      },
      include: {
        assignee: { select: { id: true, name: true, isAgent: true } },
        project: { select: { id: true, name: true } }
      }
    })

    // Execute task automatically (non-blocking)
    executeTask(params.id).then(result => {
      if (result.success) {
        console.log(`Task ${params.id} completed automatically`)
      } else {
        console.error(`Task ${params.id} execution failed:`, result.error)
      }
    }).catch(err => {
      console.error(`Task ${params.id} execution error:`, err)
    })

    return {
      task: updatedTask,
      recommendation,
      message: '任務已分配，AI 正在處理中...'
    }
  })

export { taskRoutes }
