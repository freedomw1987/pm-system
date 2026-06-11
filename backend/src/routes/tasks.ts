import { Elysia, t } from 'elysia'
import { prisma } from '../utils/prisma'
import { hasPermission } from '../middleware/permission'
import { findBestAgent, getAgentsSkillOverview } from '../agent/skill-matcher'
import { broadcastToAgents, getConnectedAgents } from '../agent/runtime'
import { executeTask } from '../agent/task-executor'
import { computePagination } from '../utils/pagination'

const userSelect = { id: true, name: true, email: true, isAgent: true }

/**
 * 2026-06-10 RG-015: developer 即使有 `tasks.edit` perm 都只可改 status。
 * 改 title / description / assignee / parentTaskId / estimatedHours 一定要
 * admin / tech_lead / 通過其他 role override / 有額外 perm `tasks.edit_fields`。
 *
 * 純 function,test 喺 `tasks.test.ts` `canEditTaskFields` describe 入面。
 *   - admin → true
 *   - tech_lead → true
 *   - 其他有 `tasks.edit_fields` perm → true
 *   - 任何其他 role(包括 developer) → false
 *
 * 注:developer 嘅 default permissions 已經有 `tasks.edit`(permissive perm name),
 * 但呢個 perm 嘅語義只覆蓋 status update(同 Kanban drag-drop 對齊),
 * 唔覆蓋 fields edit。如果想 future 畀 developer 改 fields,加 `tasks.edit_fields` perm
 * 入 developer role 嘅 default permission list(可逆 operation)。
 */
export function canEditTaskFields(user: { role?: string; permissions?: string[] } | null | undefined): boolean {
  if (!user) return false
  if (user.role === 'admin' || user.role === 'tech_lead') return true
  if (user.permissions?.includes('tasks.edit_fields')) return true
  return false
}

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
    const { title, description, status, assigneeId, assigneeIds, participantIds, parentTaskId, estimatedHours, requirementIds } = body as {
      title?: string
      description?: string
      status?: string
      assigneeId?: string | null
      assigneeIds?: string[]
      participantIds?: string[]
      parentTaskId?: string | null
      estimatedHours?: number
      // Sprint 20 US-6: 編輯任務時可一齊 patch 需求關聯
      requirementIds?: string[]
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
    // 2026-06-10 RG-015: 改用 field-level gate — developer 即使有 tasks.edit perm
    // 都只可改 status,其他 field(title / description / assignee / ...) 一定要
    // admin / tech_lead / has tasks.edit_fields perm
    //
    // 原本嘅 condition 有 fall-through bug:
    //   if (!user || (!hasPermission(user, 'tasks.edit') && ...))
    //     if (user?.role === 'developer' && (title || ...)) return 403
    //
    // 當 developer 有 tasks.edit perm(seed 入面 developer permissions 包括
    // "tasks.edit"),個 outer if 條件 false → 唔入 inner if → 落到
    // prisma.task.update 改 title/description 成功,變越權。
    //
    // Fix:explicit 拎出 canEditTaskFields 純 function + 嚴格 fall-through 結構。
    // 任何「有 field 但 developer」一律 return 403。
    const hasEditFields = canEditTaskFields(user)
    if (!hasEditFields) {
      if (
        user?.role === 'developer' &&
        (title || description || assigneeId !== undefined || assigneeIds || participantIds || parentTaskId !== undefined || estimatedHours !== undefined || requirementIds !== undefined)
      ) {
        set.status = 403
        return { error: { code: 'FORBIDDEN', message: "Permission denied: developer can only update status" } }
      }
    }

    const shouldReplaceParticipants = Array.isArray(participantIds) || Array.isArray(assigneeIds) || assigneeId !== undefined
    const normalizedParticipantIds = shouldReplaceParticipants
      ? normalizeParticipantIds(assigneeId, participantIds, assigneeIds)
      : []

    // Sprint 20 US-6: 編輯任務時可一齊 patch 需求關聯(整個替換)
    // 與 participants 邏輯一致:傳入 array = 替換,冇傳 = 唔郁
    const shouldReplaceRequirements = Array.isArray(requirementIds)
    const uniqueRequirementIds = shouldReplaceRequirements
      ? Array.from(new Set((requirementIds || []).filter(Boolean)))
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
        } : undefined,
        // Sprint 20 US-6: task_requirements join table 同步(整個替換)
        requirements: shouldReplaceRequirements ? {
          deleteMany: {},
          create: uniqueRequirementIds.map(rid => ({ requirementId: rid }))
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
