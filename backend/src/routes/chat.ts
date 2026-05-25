import { Elysia, t } from 'elysia'
import { prisma } from '../utils/prisma'
import { loadRolePermissions } from '../index'

const MAX_HISTORY_MESSAGES = 20
const MAX_CONTEXT_CHARS = 20_000
const MAX_WIKI_PAGES = 5

type ChatRole = 'system' | 'user' | 'assistant' | 'tool'

type ChatCompletionMessage = {
  role: ChatRole
  content?: string
  name?: string
  tool_call_id?: string
  tool_calls?: any[]
}

type SSEEmitOptions = {
  id: string
  model: string
  content?: string
  finishReason?: string | null
}

function errorResponse(set: any, status: number, code: string, message: string) {
  set.status = status
  return { error: { code, message } }
}

function normalizeChatCompletionUrl(apiUrl: string) {
  const trimmed = apiUrl.trim().replace(/\/+$/, '')
  if (trimmed.endsWith('/chat/completions')) return trimmed
  return `${trimmed}/chat/completions`
}

function llmHeaders(apiKey?: string | null) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  return headers
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000)
}

function truncateText(text: string, maxLength: number) {
  if (!text || text.length <= maxLength) return text || ''
  return `${text.slice(0, maxLength)}\n...[已截斷 ${text.length - maxLength} 個字元]`
}

function normalizeSearchTerms(query: string) {
  return Array.from(new Set(
    query
      .toLowerCase()
      .replace(/[\p{P}\p{S}]/gu, ' ')
      .split(/\s+/)
      .map(term => term.trim())
      .filter(term => term.length >= 2)
  )).slice(0, 12)
}

function scoreWikiPage(page: { title: string; content: string; tags: string[] }, terms: string[]) {
  if (terms.length === 0) return 0
  const title = page.title.toLowerCase()
  const content = page.content.toLowerCase()
  const tags = (page.tags || []).join(' ').toLowerCase()

  return terms.reduce((score, term) => {
    let next = score
    if (title.includes(term)) next += 5
    if (tags.includes(term)) next += 3
    const matches = content.match(new RegExp(escapeRegExp(term), 'g'))
    if (matches) next += Math.min(matches.length, 8)
    return next
  }, 0)
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function sseChunk({ id, model, content, finishReason = null }: SSEEmitOptions) {
  return {
    id,
    object: 'chat.completion.chunk',
    created: nowSeconds(),
    model,
    choices: [
      {
        index: 0,
        delta: content ? { content } : {},
        finish_reason: finishReason
      }
    ]
  }
}

function encodeSSEData(data: unknown) {
  return `data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`
}

function extractDeltaContent(payload: any) {
  if (!payload) return ''
  if (typeof payload === 'string') return payload

  const choice = payload.choices?.[0]
  const deltaContent = choice?.delta?.content
  if (typeof deltaContent === 'string') return deltaContent
  if (Array.isArray(deltaContent)) {
    return deltaContent.map((part: any) => typeof part === 'string' ? part : part?.text || '').join('')
  }

  const messageContent = choice?.message?.content
  if (typeof messageContent === 'string') return messageContent

  if (typeof choice?.text === 'string') return choice.text
  if (typeof payload.delta === 'string') return payload.delta
  if (typeof payload.content === 'string') return payload.content
  if (typeof payload.text === 'string') return payload.text

  return ''
}

function extractToolCalls(payload: any) {
  const toolCalls = payload?.choices?.[0]?.delta?.tool_calls
  if (!toolCalls || !Array.isArray(toolCalls)) return null
  return toolCalls.map((tc: any) => ({
    index: tc.index,
    id: tc.id,
    type: tc.type || 'function',
    function: {
      name: tc.function?.name || '',
      arguments: tc.function?.arguments || ''
    }
  }))
}

async function assertProjectAccess(user: any, projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true }
  })

  if (!project) {
    return { ok: false as const, status: 404, code: 'NOT_FOUND', message: 'Project not found' }
  }

  if (user.role !== 'admin') {
    const membership = await prisma.projectMember.findFirst({
      where: { projectId, userId: user.id },
      select: { id: true }
    })
    if (!membership) {
      return { ok: false as const, status: 403, code: 'FORBIDDEN', message: 'Not a project member' }
    }
  }

  return { ok: true as const, project }
}

async function findOwnedSession(sessionId: string, userId: string) {
  return prisma.chatSession.findFirst({
    where: { id: sessionId, userId },
    include: {
      project: { select: { id: true, name: true, description: true, status: true } }
    }
  })
}

async function buildProjectContext(projectId?: string | null) {
  if (!projectId) return '未指定項目。'

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      members: {
        include: { user: { select: { id: true, name: true, email: true } } },
        take: 20
      },
      requirements: {
        select: { id: true, title: true, description: true, status: true, priority: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 12
      },
      tasks: {
        select: {
          id: true, title: true, description: true, status: true,
          assignee: { select: { id: true, name: true } },
          updatedAt: true
        },
        orderBy: { updatedAt: 'desc' },
        take: 20
      },
      bugs: {
        select: {
          id: true, title: true, description: true, status: true, severity: true,
          updatedAt: true
        },
        orderBy: { updatedAt: 'desc' },
        take: 12
      },
      _count: { select: { members: true, requirements: true, tasks: true, bugs: true, wikiPages: true } }
    }
  })

  if (!project) return '找不到指定項目。'

  const requirementSummary = project.requirements.map((item: any) =>
    `- [${item.status}/${item.priority}] ${item.title}${item.description ? `：${truncateText(item.description, 180)}` : ''}`
  ).join('\n') || '- 無需求資料'

  const taskSummary = project.tasks.map((item: any) =>
    `- [${item.status}] ${item.title}${item.assignee?.name ? `（負責人：${item.assignee.name}）` : ''}${item.description ? `：${truncateText(item.description, 140)}` : ''}`
  ).join('\n') || '- 無任務資料'

  const bugSummary = project.bugs.map((item: any) =>
    `- [${item.status}/${item.severity}] ${item.title}${item.description ? `：${truncateText(item.description, 140)}` : ''}`
  ).join('\n') || '- 無缺陷資料'

  const memberSummary = project.members.map((item: any) => `- ${item.user.name} <${item.user.email}>：${item.role}`).join('\n') || '- 無成員資料'

  return `## Project Data\n` +
    `項目：${project.name}\n` +
    `狀態：${project.status}\n` +
    `描述：${project.description || '無'}\n` +
    `負責人：${project.owner?.name || '未知'}\n` +
    `統計：成員 ${project._count.members}、需求 ${project._count.requirements}、任務 ${project._count.tasks}、缺陷 ${project._count.bugs}、Wiki ${project._count.wikiPages}\n\n` +
    `### 成員\n${memberSummary}\n\n` +
    `### 近期需求\n${requirementSummary}\n\n` +
    `### 近期任務\n${taskSummary}\n\n` +
    `### 近期缺陷\n${bugSummary}`
}

async function buildWikiContext(projectId: string | null | undefined, query: string) {
  if (!projectId) return '## Wiki Knowledge\n未指定項目，沒有 Wiki context。'

  const terms = normalizeSearchTerms(query)
  let pages: Array<{ id: string; title: string; content: string; tags: string[]; updatedAt: Date }> = []

  if (terms.length > 0) {
    pages = await prisma.wikiPage.findMany({
      where: {
        projectId,
        OR: terms.flatMap(term => [
          { title: { contains: term, mode: 'insensitive' as const } },
          { content: { contains: term, mode: 'insensitive' as const } },
          { tags: { has: term } }
        ])
      } as any,
      select: { id: true, title: true, content: true, tags: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 30
    })
  }

  if (pages.length === 0) {
    pages = await prisma.wikiPage.findMany({
      where: { projectId },
      select: { id: true, title: true, content: true, tags: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: MAX_WIKI_PAGES
    })
  }

  const ranked = pages
    .map(page => ({ page, score: scoreWikiPage(page, terms) }))
    .sort((a, b) => b.score - a.score || b.page.updatedAt.getTime() - a.page.updatedAt.getTime())
    .slice(0, MAX_WIKI_PAGES)
    .map(({ page }) => page)

  if (ranked.length === 0) return '## Wiki Knowledge\n此項目尚無 Wiki 內容。'

  let usedChars = 0
  const sections: string[] = []
  for (const page of ranked) {
    const remaining = Math.max(0, MAX_CONTEXT_CHARS - usedChars)
    if (remaining <= 0) break
    const pageText = `### ${page.title}\nTags: ${(page.tags || []).join(', ') || '無'}\n${truncateText(page.content, Math.min(4_000, remaining))}`
    sections.push(pageText)
    usedChars += pageText.length
  }

  return `## Wiki Knowledge\n${sections.join('\n\n')}`
}

// ─── System Prompt Builder ───────────────────────────────────────────────────
async function buildSystemPrompt(projectId: string | null, userContent: string) {
  const [projectCtx, wikiCtx] = await Promise.all([
    buildProjectContext(projectId),
    buildWikiContext(projectId, userContent)
  ])

  return `你是這個項目管理系統的 AI 助理助手。你可以通過工具 CRUD（建立、讀取、更新、刪除）項目的：需求（Requirements）、任務（Tasks）、缺陷（Bugs）。

以下是可用工具的描述，你必須根據用戶的需求調用正確的工具：
${TOOL_DEFINITIONS.map(t => `- ${t.function.name}: ${t.function.description}`).join('\n')}

重要原則：
- 用戶說「建立」「新增」「創建」= create_* 工具
- 用戶說「查看」「列表」「列出」= list_* 或 get_* 工具
- 用戶說「更新」「修改」「編輯」= update_* 工具
- 用戶說「刪除」「移除」= delete_* 工具
- 只有在明確知道 ID 時才能 get/update/delete，否則先 list
- 所有操作結果要即時總結給用戶

${projectCtx}

${wikiCtx}`
}

// ─── Tool Definitions ─────────────────────────────────────────────────────────
const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'list_requirements',
      description: '列出項目中的所有需求（Requirements）',
      parameters: {
        type: 'object',
        properties: {
          projectId: { type: 'string', description: '項目 ID（可選，若未提供則使用對話中的項目）' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_requirement',
      description: '取得特定需求的詳細資料',
      parameters: {
        type: 'object',
        properties: {
          requirementId: { type: 'string', description: '需求 ID' }
        },
        required: ['requirementId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_requirement',
      description: '在指定項目中建立一個新需求',
      parameters: {
        type: 'object',
        properties: {
          projectId: { type: 'string', description: '項目 ID（可選，若未提供則使用對話中的項目）' },
          title: { type: 'string', description: '需求標題' },
          description: { type: 'string', description: '需求描述（可選）' },
          priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], description: '優先級（預設 medium）' }
        },
        required: ['title']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_requirement',
      description: '更新一個現有需求的資料',
      parameters: {
        type: 'object',
        properties: {
          requirementId: { type: 'string', description: '需求 ID' },
          title: { type: 'string', description: '新標題（可選）' },
          description: { type: 'string', description: '新描述（可選）' },
          status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'cancelled'], description: '新狀態（可選）' },
          priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], description: '新優先級（可選）' }
        },
        required: ['requirementId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_requirement',
      description: '刪除一個需求',
      parameters: {
        type: 'object',
        properties: {
          requirementId: { type: 'string', description: '需求 ID' }
        },
        required: ['requirementId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_tasks',
      description: '列出項目中的所有任務（Tasks）',
      parameters: {
        type: 'object',
        properties: {
          projectId: { type: 'string', description: '項目 ID（可選，若未提供則使用對話中的項目）' },
          status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'cancelled'], description: '按狀態過濾（可選）' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_task',
      description: '取得特定任務的詳細資料',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: '任務 ID' }
        },
        required: ['taskId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_task',
      description: '在指定項目中建立一個新任務',
      parameters: {
        type: 'object',
        properties: {
          projectId: { type: 'string', description: '項目 ID（可選，若未提供則使用對話中的項目）' },
          title: { type: 'string', description: '任務標題' },
          description: { type: 'string', description: '任務描述（可選）' },
          assigneeId: { type: 'string', description: '負責人用戶 ID（可選）' },
          requirementIds: { type: 'array', items: { type: 'string' }, description: '關聯的需求 ID 列表（可選）' },
          estimatedHours: { type: 'number', description: '預計工時（小時）（可選）' }
        },
        required: ['title']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_task',
      description: '更新一個現有任務的資料',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: '任務 ID' },
          title: { type: 'string', description: '新標題（可選）' },
          description: { type: 'string', description: '新描述（可選）' },
          status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'cancelled'], description: '新狀態（可選）' },
          assigneeId: { type: 'string', description: '負責人用戶 ID（可選）' },
          estimatedHours: { type: 'number', description: '預計工時（小時）（可選）' }
        },
        required: ['taskId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_task',
      description: '刪除一個任務',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: '任務 ID' }
        },
        required: ['taskId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_bugs',
      description: '列出項目中的所有缺陷（Bugs）',
      parameters: {
        type: 'object',
        properties: {
          projectId: { type: 'string', description: '項目 ID（可選，若未提供則使用對話中的項目）' },
          status: { type: 'string', enum: ['open', 'in_progress', 'resolved', 'closed'], description: '按狀態過濾（可選）' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_bug',
      description: '取得特定缺陷的詳細資料',
      parameters: {
        type: 'object',
        properties: {
          bugId: { type: 'string', description: '缺陷 ID' }
        },
        required: ['bugId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_bug',
      description: '在指定項目中建立一個新缺陷報告',
      parameters: {
        type: 'object',
        properties: {
          projectId: { type: 'string', description: '項目 ID（可選，若未提供則使用對話中的項目）' },
          title: { type: 'string', description: '缺陷標題' },
          description: { type: 'string', description: '缺陷描述（可選）' },
          severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], description: '嚴重程度（預設 medium）' },
          taskId: { type: 'string', description: '關聯的任務 ID（可選）' },
          requirementId: { type: 'string', description: '關聯的需求 ID（可選）' }
        },
        required: ['title']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_bug',
      description: '更新一個現有缺陷的資料',
      parameters: {
        type: 'object',
        properties: {
          bugId: { type: 'string', description: '缺陷 ID' },
          status: { type: 'string', enum: ['open', 'in_progress', 'resolved', 'closed'], description: '新狀態（可選）' },
          description: { type: 'string', description: '新描述（用選）' }
        },
        required: ['bugId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_bug',
      description: '刪除一個缺陷',
      parameters: {
        type: 'object',
        properties: {
          bugId: { type: 'string', description: '缺陷 ID' }
        },
        required: ['bugId']
      }
    }
  }
]

// ─── Tool Executor ─────────────────────────────────────────────────────────────
type ToolContext = {
  userId: string
  userRole: string
  userPermissions: string[]
  projectId?: string | null
}

async function executeTool(toolName: string, args: Record<string, any>, ctx: ToolContext) {
  try {
    switch (toolName) {
      // ── Requirements ──
      case 'list_requirements': {
        const { projectId } = args
        const effectiveProjectId = projectId || ctx.projectId
        if (!effectiveProjectId) return { error: 'projectId is required — 請先選擇一個項目或在對話中指定項目 ID' }
        const access = await assertProjectAccess({ id: ctx.userId, role: ctx.userRole }, effectiveProjectId)
        if (!access.ok) return { error: access.message }

        const requirements = await prisma.requirement.findMany({
          where: { projectId },
          include: {
            createdBy: { select: { id: true, name: true } },
            _count: { select: { tasks: true } }
          },
          orderBy: { createdAt: 'desc' }
        })
        return { requirements }
      }

      case 'get_requirement': {
        const { requirementId } = args
        const req = await prisma.requirement.findUnique({
          where: { id: requirementId },
          include: {
            project: { select: { id: true, name: true } },
            createdBy: { select: { id: true, name: true } },
            _count: { select: { tasks: true } }
          }
        })
        if (!req) return { error: 'Requirement not found' }
        return { requirement: req }
      }

      case 'create_requirement': {
        const { projectId, title, description, priority } = args
        const effectiveProjectId = projectId || ctx.projectId
        if (!effectiveProjectId || !title) return { error: 'projectId and title are required — 請先選擇一個項目或在對話中指定項目 ID' }
        const access = await assertProjectAccess({ id: ctx.userId, role: ctx.userRole }, effectiveProjectId)
        if (!access.ok) return { error: access.message }

        const canCreate = ctx.userPermissions.includes('requirements.create') ||
          ctx.userRole === 'admin' || ctx.userRole === 'pm'
        if (!canCreate) return { error: "Permission denied: 'requirements.create' required" }

        const requirement = await prisma.requirement.create({
          data: {
            projectId: effectiveProjectId, title, description,
            priority: priority || 'medium',
            createdById: ctx.userId
          },
          include: { createdBy: { select: { id: true, name: true } } }
        })
        return { requirement, message: `需求「${title}」已建立` }
      }

      case 'update_requirement': {
        const { requirementId, ...updates } = args
        if (!requirementId) return { error: 'requirementId is required' }
        const existing = await prisma.requirement.findUnique({ where: { id: requirementId } })
        if (!existing) return { error: 'Requirement not found' }

        const access = await assertProjectAccess({ id: ctx.userId, role: ctx.userRole }, existing.projectId)
        if (!access.ok) return { error: access.message }

        const canEdit = ctx.userPermissions.includes('requirements.edit') ||
          ctx.userRole === 'admin' || ctx.userRole === 'pm'
        if (!canEdit) return { error: "Permission denied: 'requirements.edit' required" }

        const allowed = ['title', 'description', 'status', 'priority']
        const data: any = {}
        allowed.forEach(k => { if (updates[k] !== undefined) data[k] = updates[k] })

        const requirement = await prisma.requirement.update({
          where: { id: requirementId },
          data,
          include: { createdBy: { select: { id: true, name: true } } }
        })
        return { requirement, message: `需求「${requirement.title}」已更新` }
      }

      case 'delete_requirement': {
        const { requirementId } = args
        if (!requirementId) return { error: 'requirementId is required' }
        const existing = await prisma.requirement.findUnique({ where: { id: requirementId } })
        if (!existing) return { error: 'Requirement not found' }

        const access = await assertProjectAccess({ id: ctx.userId, role: ctx.userRole }, existing.projectId)
        if (!access.ok) return { error: access.message }

        const canDelete = ctx.userPermissions.includes('requirements.delete') ||
          ctx.userRole === 'admin' || ctx.userRole === 'pm'
        if (!canDelete) return { error: "Permission denied: 'requirements.delete' required" }

        await prisma.requirement.delete({ where: { id: requirementId } })
        return { success: true, message: `需求已刪除` }
      }

      // ── Tasks ──
      case 'list_tasks': {
        const { projectId, status } = args
        const effectiveProjectId = projectId || ctx.projectId
        if (!effectiveProjectId) return { error: 'projectId is required — 請先選擇一個項目或在對話中指定項目 ID' }
        const access = await assertProjectAccess({ id: ctx.userId, role: ctx.userRole }, effectiveProjectId)
        if (!access.ok) return { error: access.message }

        const where: any = { projectId: effectiveProjectId }
        if (status) where.status = status

        const tasks = await prisma.task.findMany({
          where,
          include: {
            assignee: { select: { id: true, name: true } },
            requirements: { include: { requirement: { select: { id: true, title: true } } } }
          },
          orderBy: { createdAt: 'desc' }
        })
        return { tasks }
      }

      case 'get_task': {
        const { taskId } = args
        const task = await prisma.task.findUnique({
          where: { id: taskId },
          include: {
            assignee: { select: { id: true, name: true } },
            requirements: { include: { requirement: { select: { id: true, title: true } } } },
            bugs: { select: { id: true, title: true, status: true, severity: true } },
            workLogs: { include: { user: { select: { id: true, name: true } } } }
          }
        })
        if (!task) return { error: 'Task not found' }
        return { task }
      }

      case 'create_task': {
        const { projectId, title, description, assigneeId, requirementIds, estimatedHours } = args
        const effectiveProjectId = projectId || ctx.projectId
        if (!effectiveProjectId || !title) return { error: 'projectId and title are required — 請先選擇一個項目或在對話中指定項目 ID' }
        const access = await assertProjectAccess({ id: ctx.userId, role: ctx.userRole }, effectiveProjectId)
        if (!access.ok) return { error: access.message }

        const canCreate = ctx.userPermissions.includes('tasks.create') ||
          ctx.userRole === 'admin' || ctx.userRole === 'tech_lead'
        if (!canCreate) return { error: "Permission denied: 'tasks.create' required" }

        const task = await prisma.task.create({
          data: {
            projectId: effectiveProjectId, title, description, assigneeId, estimatedHours,
            requirements: requirementIds ? {
              create: requirementIds.map(rid => ({ requirementId: rid }))
            } : undefined
          },
          include: {
            assignee: { select: { id: true, name: true } },
            requirements: { include: { requirement: { select: { id: true, title: true } } } }
          }
        })
        return { task, message: `任務「${title}」已建立` }
      }

      case 'update_task': {
        const { taskId, ...updates } = args
        if (!taskId) return { error: 'taskId is required' }
        const existing = await prisma.task.findUnique({ where: { id: taskId } })
        if (!existing) return { error: 'Task not found' }

        const access = await assertProjectAccess({ id: ctx.userId, role: ctx.userRole }, existing.projectId)
        if (!access.ok) return { error: access.message }

        const canEdit = ctx.userPermissions.includes('tasks.edit') ||
          ctx.userRole === 'admin' || ctx.userRole === 'tech_lead'
        if (!canEdit) return { error: "Permission denied: 'tasks.edit' required" }

        const allowed = ['title', 'description', 'status', 'assigneeId', 'estimatedHours']
        const data: any = {}
        allowed.forEach(k => { if (updates[k] !== undefined) data[k] = updates[k] })

        const task = await prisma.task.update({
          where: { id: taskId },
          data,
          include: {
            assignee: { select: { id: true, name: true } },
            requirements: { include: { requirement: { select: { id: true, title: true } } } }
          }
        })
        return { task, message: `任務「${task.title}」已更新` }
      }

      case 'delete_task': {
        const { taskId } = args
        if (!taskId) return { error: 'taskId is required' }
        const existing = await prisma.task.findUnique({ where: { id: taskId } })
        if (!existing) return { error: 'Task not found' }

        const access = await assertProjectAccess({ id: ctx.userId, role: ctx.userRole }, existing.projectId)
        if (!access.ok) return { error: access.message }

        const canDelete = ctx.userPermissions.includes('tasks.delete') ||
          ctx.userRole === 'admin' || ctx.userRole === 'tech_lead'
        if (!canDelete) return { error: "Permission denied: 'tasks.delete' required" }

        await prisma.task.delete({ where: { id: taskId } })
        return { success: true, message: `任務已刪除` }
      }

      // ── Bugs ──
      case 'list_bugs': {
        const { projectId, status } = args
        const effectiveProjectId = projectId || ctx.projectId
        if (!effectiveProjectId) return { error: 'projectId is required — 請先選擇一個項目或在對話中指定項目 ID' }
        const access = await assertProjectAccess({ id: ctx.userId, role: ctx.userRole }, effectiveProjectId)
        if (!access.ok) return { error: access.message }

        const where: any = { projectId: effectiveProjectId }
        if (status) where.status = status

        const bugs = await prisma.bug.findMany({
          where,
          include: {
            reporter: { select: { id: true, name: true } },
            task: { select: { id: true, title: true } }
          },
          orderBy: { createdAt: 'desc' }
        })
        return { bugs }
      }

      case 'get_bug': {
        const { bugId } = args
        const bug = await prisma.bug.findUnique({
          where: { id: bugId },
          include: {
            reporter: { select: { id: true, name: true } },
            task: { select: { id: true, title: true } },
            requirement: { select: { id: true, title: true } }
          }
        })
        if (!bug) return { error: 'Bug not found' }
        return { bug }
      }

      case 'create_bug': {
        const { projectId, title, description, severity, taskId, requirementId } = args
        const effectiveProjectId = projectId || ctx.projectId
        if (!effectiveProjectId || !title) return { error: 'projectId and title are required — 請先選擇一個項目或在對話中指定項目 ID' }
        const access = await assertProjectAccess({ id: ctx.userId, role: ctx.userRole }, effectiveProjectId)
        if (!access.ok) return { error: access.message }

        const canCreate = ctx.userPermissions.includes('bugs.create') ||
          ctx.userRole === 'admin' || ctx.userRole === 'tester'
        if (!canCreate) return { error: "Permission denied: 'bugs.create' required" }

        const bug = await prisma.bug.create({
          data: {
            projectId: effectiveProjectId, title, description, severity: severity || 'medium',
            taskId, requirementId, reporterId: ctx.userId
          },
          include: {
            reporter: { select: { id: true, name: true } },
            task: { select: { id: true, title: true } }
          }
        })
        return { bug, message: `缺陷「${title}」已建立` }
      }

      case 'update_bug': {
        const { bugId, ...updates } = args
        if (!bugId) return { error: 'bugId is required' }
        const existing = await prisma.bug.findUnique({ where: { id: bugId } })
        if (!existing) return { error: 'Bug not found' }

        const access = await assertProjectAccess({ id: ctx.userId, role: ctx.userRole }, existing.projectId)
        if (!access.ok) return { error: access.message }

        const canEdit = ctx.userPermissions.includes('bugs.edit') ||
          ctx.userRole === 'admin' || ctx.userRole === 'developer' ||
          ctx.userRole === 'tech_lead' || existing.reporterId === ctx.userId
        if (!canEdit) return { error: "Permission denied: 'bugs.edit' required" }

        const allowed = ['status', 'description']
        const data: any = {}
        allowed.forEach(k => { if (updates[k] !== undefined) data[k] = updates[k] })

        const bug = await prisma.bug.update({
          where: { id: bugId },
          data,
          include: {
            reporter: { select: { id: true, name: true } },
            task: { select: { id: true, title: true } }
          }
        })
        return { bug, message: `缺陷「${bug.title}」已更新` }
      }

      case 'delete_bug': {
        const { bugId } = args
        if (!bugId) return { error: 'bugId is required' }
        const existing = await prisma.bug.findUnique({ where: { id: bugId } })
        if (!existing) return { error: 'Bug not found' }

        const access = await assertProjectAccess({ id: ctx.userId, role: ctx.userRole }, existing.projectId)
        if (!access.ok) return { error: access.message }

        const canDelete = ctx.userPermissions.includes('bugs.delete') || ctx.userRole === 'admin'
        if (!canDelete) return { error: "Permission denied: 'bugs.delete' required" }

        await prisma.bug.delete({ where: { id: bugId } })
        return { success: true, message: `缺陷已刪除` }
      }

      default:
        return { error: `Unknown tool: ${toolName}` }
    }
  } catch (err: any) {
    return { error: err.message || 'Tool execution failed' }
  }
}

// ─── LLM Call with Tool Support ───────────────────────────────────────────────
async function callLLMWithTools(options: {
  messages: ChatCompletionMessage[]
  config: { apiUrl: string; apiKey: string; model: string }
  signal?: AbortSignal
}) {
  const { messages, config, signal } = options

  const response = await fetch(normalizeChatCompletionUrl(config.apiUrl), {
    method: 'POST',
    headers: llmHeaders(config.apiKey),
    signal,
    body: JSON.stringify({
      model: config.model,
      stream: false,
      temperature: 0.3,
      messages,
      tools: TOOL_DEFINITIONS,
      tool_choice: 'auto'
    })
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`LLM request failed (${response.status}): ${text || response.statusText}`)
  }

  return response.json()
}

async function streamLLMResponse(options: {
  sessionId: string
  userId: string
  userRole: string
  userPermissions: string[]
  projectId?: string | null
  messages: ChatCompletionMessage[]
  config: { apiUrl: string; apiKey: string; model: string }
  signal?: AbortSignal
}) {
  const { sessionId, userId, userRole, userPermissions, projectId, messages, config, signal } = options
  const encoder = new TextEncoder()
  const streamId = `chatcmpl-${crypto.randomUUID()}`
  let assistantContent = ''

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: string) => controller.enqueue(encoder.encode(payload))
      const sendData = (payload: unknown) => send(encodeSSEData(payload))
      const sendChunk = (text: string) => {
        assistantContent += text
        sendData(sseChunk({ id: streamId, model: config.model, content: text }))
      }

      try {
        // ── Step 1: Initial LLM call with tools ───────────────────────────────
        const initialResponse = await callLLMWithTools({ messages, config, signal })
        const initialContent = initialResponse?.choices?.[0]?.message?.content || ''
        const toolCalls = initialResponse?.choices?.[0]?.message?.tool_calls || []

        console.log('[Chat] Initial response - hasContent:', !!initialContent, 'toolCalls:', toolCalls?.length || 0)

        if (initialContent) {
          sendChunk(initialContent)
        }

        // ── Step 2: Execute tool calls if any ──────────────────────────────────
        const toolResults: Array<{ tool_call_id: string; name: string; content: string }> = []

        if (toolCalls && toolCalls.length > 0) {
          // Send thinking indicator
          sendData(sseChunk({ id: streamId, model: config.model, content: '\n\n🛠️ 正在執行操作...' }))
          const toolCallStart = assistantContent.length

          for (const tc of toolCalls) {
            const toolName = tc.function.name
            let args: Record<string, any> = {}
            try {
              args = JSON.parse(tc.function.arguments || '{}')
            } catch {
              args = {}
            }

            console.log('[Chat] Executing tool:', toolName, 'args:', JSON.stringify(args))

            const ctx: ToolContext = { userId, userRole, userPermissions, projectId }
            const result = await executeTool(toolName, args, ctx)

            console.log('[Chat] Tool result:', JSON.stringify(result).slice(0, 200))

            toolResults.push({
              tool_call_id: tc.id,
              name: toolName,
              content: JSON.stringify(result, null, 2)
            })
          }

          // ── Step 3: Follow-up LLM call with tool results ─────────────────────
          const toolMessages: ChatCompletionMessage[] = [
            ...messages,
            { role: 'assistant', content: initialContent || null, tool_calls: toolCalls },
            ...toolResults.map(tr => ({
              role: 'tool' as ChatRole,
              tool_call_id: tr.tool_call_id,
              name: tr.name,
              content: tr.content
            }))
          ]

          // Remove null content from assistant message
          const cleanMessages = toolMessages.map(m => {
            if (m.role === 'assistant' && m.content === null) {
              const { content, ...rest } = m
              return rest
            }
            return m
          })

          console.log('[Chat] Calling follow-up LLM with', cleanMessages.length, 'messages')

          const followUpResponse = await callLLMWithTools({ messages: cleanMessages, config, signal })
          const followUpContent = followUpResponse?.choices?.[0]?.message?.content || ''

          // DEBUG: log tool execution result
          console.log('[Chat] Tool executed, results:', toolResults.length, 'followUpContent length:', followUpContent.length)

          if (followUpContent) {
            sendChunk(followUpContent)
          } else if (toolResults.length > 0) {
            // Tool ran but LLM gave no follow-up text — surface tool errors directly to user
            const firstError = toolResults.find(r => r.content.includes('"error"'))
            if (firstError) {
              // Extract error message from JSON
              try {
                const parsed = JSON.parse(firstError.content)
                const msg = parsed?.error || firstError.content
                sendData(sseChunk({ id: streamId, model: config.model, content: `\n\n❌ 操作失敗：${msg}` }))
              } catch {
                sendData(sseChunk({ id: streamId, model: config.model, content: '\n\n❌ 操作失敗，請稍後重試' }))
              }
            }
          }
        }

        // ── Step 4: Finalize ───────────────────────────────────────────────────
        if (!assistantContent.trim()) {
          sendData(sseChunk({ id: streamId, model: config.model, finishReason: 'stop' }))
        } else {
          sendData(sseChunk({ id: streamId, model: config.model, finishReason: 'stop' }))
        }

        if (assistantContent.trim()) {
          await prisma.chatMessage.create({
            data: { sessionId, role: 'assistant', content: assistantContent }
          })
          await prisma.chatSession.update({
            where: { id: sessionId },
            data: { updatedAt: new Date() }
          })
        }

        sendData('[DONE]')
        controller.close()
      } catch (error) {
        const message = error instanceof Error ? error.message : 'LLM streaming failed'
        try {
          sendData({ error: { code: 'STREAM_ERROR', message } })
          sendData('[DONE]')
          controller.close()
        } catch {
          controller.error(error)
        }
      }
    }
  })
}

// ─── Routes ───────────────────────────────────────────────────────────────────
const chatRoutes = new Elysia({ prefix: '/chat' })
  .get('/sessions', async ({ set, user }) => {
    if (!user) {
      return errorResponse(set, 401, 'UNAUTHORIZED', 'Authentication required')
    }

    const sessions = await prisma.chatSession.findMany({
      where: { userId: user.id },
      include: {
        project: { select: { id: true, name: true, status: true } },
        _count: { select: { messages: true } }
      },
      orderBy: { updatedAt: 'desc' }
    })

    return { sessions }
  })
  .post('/sessions', async ({ body, set, user }) => {
    if (!user) {
      return errorResponse(set, 401, 'UNAUTHORIZED', 'Authentication required')
    }

    const { projectId, title } = body as { projectId?: string; title?: string }
    if (projectId) {
      const access = await assertProjectAccess(user, projectId)
      if (!access.ok) {
        return errorResponse(set, access.status, access.code, access.message)
      }
    }

    // Verify user exists in DB
    const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { id: true } })
    if (!dbUser) {
      return errorResponse(set, 401, 'INVALID_USER', 'User not found in database — please re-login')
    }

    const session = await prisma.chatSession.create({
      data: {
        userId: user.id,
        projectId: projectId || null,
        title: title?.trim() || '新聊天'
      },
      include: {
        project: { select: { id: true, name: true, status: true } },
        _count: { select: { messages: true } }
      }
    })

    return { session }
  }, {
    body: t.Object({
      projectId: t.Optional(t.String()),
      title: t.Optional(t.String())
    })
  })
  .get('/sessions/:id/messages', async ({ params, set, user }) => {
    if (!user) {
      return errorResponse(set, 401, 'UNAUTHORIZED', 'Authentication required')
    }

    const session = await findOwnedSession(params.id, user.id)
    if (!session) {
      return errorResponse(set, 404, 'NOT_FOUND', 'Chat session not found')
    }

    const messages = await prisma.chatMessage.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: 'asc' }
    })

    return { session, messages }
  })
  .post('/sessions/:id/messages', async ({ params, body, set, user, request }) => {
    if (!user) {
      return errorResponse(set, 401, 'UNAUTHORIZED', 'Authentication required')
    }

    const { content, message } = body as { content?: string; message?: string }
    const userContent = (content || message || '').trim()
    if (!userContent) {
      return errorResponse(set, 400, 'VALIDATION_ERROR', 'content is required')
    }

    const session = await findOwnedSession(params.id, user.id)
    if (!session) {
      return errorResponse(set, 404, 'NOT_FOUND', 'Chat session not found')
    }

    const config = await prisma.lLMConfig.findFirst()
    if (!config) {
      return errorResponse(set, 404, 'LLM_CONFIG_NOT_FOUND', 'LLM config not set. Please configure /api/llm-config first.')
    }

    // Save user message
    await prisma.chatMessage.create({
      data: { sessionId: session.id, role: 'user', content: userContent }
    })

    const updates: any = { updatedAt: new Date() }
    if ((!session.title || session.title === '新聊天') && userContent) {
      updates.title = userContent.slice(0, 40)
    }
    await prisma.chatSession.update({ where: { id: session.id }, data: updates })

    const history = await prisma.chatMessage.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: 'asc' },
      take: 200
    })

    const systemPrompt = await buildSystemPrompt(session.projectId, userContent)
    const messages: ChatCompletionMessage[] = [
      { role: 'system', content: systemPrompt },
      ...history.map(m => ({ role: m.role as ChatRole, content: m.content }))
    ]

    const stream = await streamLLMResponse({
      sessionId: session.id,
      userId: user.id,
      userRole: user.role,
      userPermissions: user.permissions || [],
      projectId: session.projectId,
      messages,
      config,
      signal: request.signal
    })

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    })
  }, {
    body: t.Object({
      content: t.Optional(t.String()),
      message: t.Optional(t.String())
    })
  })
  .delete('/sessions/:id', async ({ params, set, user }) => {
    if (!user) {
      return errorResponse(set, 401, 'UNAUTHORIZED', 'Authentication required')
    }

    const session = await findOwnedSession(params.id, user.id)
    if (!session) {
      return errorResponse(set, 404, 'NOT_FOUND', 'Chat session not found')
    }

    await prisma.chatSession.delete({ where: { id: session.id } })
    return { success: true }
  })

export { chatRoutes }
export default chatRoutes