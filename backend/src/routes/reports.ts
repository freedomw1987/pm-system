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
      where: {
        task: {
          requirements: {
            some: { requirement: { projectId: query.projectId } }
          }
        }
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
      where: { id: query.projectId },
      include: {
        requirements: {
          include: { tasks: true }
        }
      }
    })

    if (!project) {
      set.status = 404
      return { error: { code: 'NOT_FOUND', message: 'Project not found' } }
    }

    const totalRequirements = project.requirements.length
    const completedRequirements = project.requirements.filter(r => r.status === 'completed').length

    const allTasks = project.requirements.flatMap(r => r.tasks)
    const totalTasks = allTasks.length
    const completedTasks = allTasks.filter(t => t.status === 'completed').length

    const taskIds = allTasks.map(t => t.id).filter(Boolean)
    const bugs = taskIds.length > 0
      ? await prisma.bug.findMany({ where: { taskId: { in: taskIds } } })
      : []
    const openBugs = bugs.filter(b => b.status === 'open' || b.status === 'in_progress').length
    const resolvedBugs = bugs.filter(b => b.status === 'resolved' || b.status === 'closed').length

    return {
      project: { id: project.id, name: project.name },
      totalRequirements,
      completedRequirements,
      requirementsProgress: totalRequirements > 0 ? Math.round((completedRequirements / totalRequirements) * 100) : 0,
      totalTasks,
      completedTasks,
      tasksProgress: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
      totalBugs: bugs.length,
      openBugs,
      resolvedBugs
    }
  })

export { reportRoutes }