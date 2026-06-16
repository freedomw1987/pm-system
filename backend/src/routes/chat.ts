import { Elysia, t } from 'elysia'
import { prisma } from '../utils/prisma'
import { loadRolePermissions } from '../index'

const MAX_HISTORY_MESSAGES = 20
const MAX_CONTEXT_CHARS = 20_000
// Sprint 21 US-21.4: bumped from 5 → 10 so the LLM has more wiki context
// when answering questions. Tool-call results are still capped at
// MAX_WIKI_TOOL_RESULTS (10) so the user-facing limit is unchanged.
const MAX_WIKI_PAGES = 10
const MAX_WIKI_TOOL_RESULTS = 10
const DEFAULT_WIKI_TOOL_RESULTS = 5

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

export function normalizeChatCompletionUrl(apiUrl: string) {
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
  // Remove punctuation and split by whitespace
  const parts = query
    .replace(/[\p{P}\p{S}]/gu, ' ')
    .split(/\s+/)
    .map(term => term.trim())
    .filter(term => term.length >= 2)

  const terms: string[] = []
  for (const part of parts) {
    // For Chinese text (contains CJK characters), extract individual characters and bigrams
    if (/[一-鿿]/.test(part)) {
      // Single characters (length >= 2 already ensures we have at least 2 chars)
      for (let i = 0; i < part.length; i++) {
        terms.push(part[i])
      }
      // Bigrams for better matching
      for (let i = 0; i < part.length - 1; i++) {
        terms.push(part.slice(i, i + 2))
      }
    } else {
      // For non-Chinese, use the whole part
      terms.push(part.toLowerCase())
    }
  }

  return Array.from(new Set(terms)).slice(0, 12)
}

function scoreWikiPage(page: { title: string; content: string; tags: string[] }, terms: string[]) {
  if (terms.length === 0) return 0
  const title = page.title
  const content = page.content
  const tags = (page.tags || []).join(' ')

  return terms.reduce((score, term) => {
    let next = score
    // For Chinese, match directly (no case conversion needed)
    // For non-Chinese (ASCII), use lowercase for case-insensitive match
    const isChinese = /[一-鿿]/.test(term)
    const searchTerm = isChinese ? term : term.toLowerCase()

    const titleForMatch = isChinese ? title : title.toLowerCase()
    const contentForMatch = isChinese ? content : content.toLowerCase()
    const tagsForMatch = isChinese ? tags : tags.toLowerCase()

    if (titleForMatch.includes(searchTerm)) next += 5
    if (tagsForMatch.includes(searchTerm)) next += 3
    const regex = new RegExp(escapeRegExp(searchTerm), isChinese ? '' : 'i')
    const matches = contentForMatch.match(regex)
    if (matches) next += Math.min(matches.length, 8)
    return next
  }, 0)
}

type WikiSearchResult = {
  id: string
  projectId: string
  title: string
  content: string
  tags: string[]
  updatedAt: Date
  score: number
  snippet: string
}

// Sprint 21 US-21.4: search results now carry metadata so the LLM (and the
// user-facing UI banner) can tell when more results were available than we
// returned. Tool description & system prompt updated to surface this.
type WikiSearchResponse = {
  results: WikiSearchResult[]
  requested: number      // user-requested limit (post-clamp)
  matched: number        // total candidates that scored > 0 (BEFORE limit)
  returned: number       // results.length (after limit)
  totalAvailable: number // all pages in the project matching the WHERE
  hasMore: boolean       // matched > returned
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function clampLimit(value: unknown, fallback: number, max: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(1, Math.min(max, Math.floor(parsed)))
}

function buildWikiSnippet(content: string, terms: string[], maxLength = 700) {
  const normalizedContent = content || ''
  if (!normalizedContent) return ''

  const lowerContent = normalizedContent.toLowerCase()
  const matchedIndex = terms
    .map(term => lowerContent.indexOf(term.toLowerCase()))
    .filter(index => index >= 0)
    .sort((a, b) => a - b)[0]

  if (matchedIndex === undefined) {
    return truncateText(normalizedContent, maxLength)
  }

  const halfWindow = Math.floor(maxLength / 2)
  const start = Math.max(0, matchedIndex - halfWindow)
  const end = Math.min(normalizedContent.length, start + maxLength)
  const prefix = start > 0 ? '...' : ''
  const suffix = end < normalizedContent.length ? '\n...' : ''

  return `${prefix}${normalizedContent.slice(start, end)}${suffix}`
}

async function searchWikiPages(
  projectId: string,
  query: string,
  limit = DEFAULT_WIKI_TOOL_RESULTS
): Promise<WikiSearchResponse> {
  const terms = normalizeSearchTerms(query)
  const take = clampLimit(limit, DEFAULT_WIKI_TOOL_RESULTS, MAX_WIKI_TOOL_RESULTS)

  if (terms.length === 0) {
    return {
      results: [],
      requested: take,
      matched: 0,
      returned: 0,
      totalAvailable: 0,
      hasMore: false
    }
  }

  // Sprint 21 US-21.4: fetch all candidates (no take here) so we can report
  // `matched` and `totalAvailable` honestly. Cap at 500 to prevent OOM on
  // pathological projects.
  const allCandidates = await prisma.wikiPage.findMany({
    where: {
      projectId,
      OR: terms.flatMap(term => [
        { title: { contains: term, mode: 'insensitive' as const } },
        { content: { contains: term, mode: 'insensitive' as const } },
        { tags: { has: term } }
      ])
    } as any,
    select: { id: true, projectId: true, title: true, content: true, tags: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
    take: 500
  })

  const totalAvailable = allCandidates.length

  const scored = allCandidates
    .map(page => ({
      ...page,
      score: scoreWikiPage(page, terms),
      snippet: buildWikiSnippet(page.content, terms)
    }))

  const matched = scored.filter(p => p.score > 0).length

  const results = scored
    .filter(p => p.score > 0)
    .sort((a, b) => b.score - a.score || b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, take)

  return {
    results,
    requested: take,
    matched,
    returned: results.length,
    totalAvailable,
    hasMore: matched > results.length
  }
}

export function sseChunk({ id, model, content, finishReason = null }: SSEEmitOptions) {
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

export function toolActivityEvent(options: {
  id: string
  model: string
  status: 'started' | 'completed' | 'failed'
  toolName: string
  toolCallId?: string
  args?: Record<string, any>
  result?: any
}) {
  const { id, model, status, toolName, toolCallId, args = {}, result } = options
  const query = typeof args.query === 'string' ? args.query : undefined
  const resultCount = typeof result?.count === 'number'
    ? result.count
    : Array.isArray(result?.results)
      ? result.results.length
      : undefined

  const labels: Record<string, string> = {
    search_wiki: query ? `搜尋 Wiki：${query}` : '搜尋 Wiki',
    list_requirements: '讀取需求列表',
    get_requirement: '讀取需求詳情',
    create_requirement: '建立需求',
    update_requirement: '更新需求',
    delete_requirement: '刪除需求',
    list_tasks: '讀取任務列表',
    get_task: '讀取任務詳情',
    create_task: '建立任務',
    update_task: '更新任務',
    delete_task: '刪除任務',
    list_bugs: '讀取缺陷列表',
    get_bug: '讀取缺陷詳情',
    create_bug: '建立缺陷',
    update_bug: '更新缺陷',
    delete_bug: '刪除缺陷'
  }

  return {
    id,
    object: 'chat.tool_activity',
    created: nowSeconds(),
    model,
    tool_activity: {
      id: toolCallId || `${toolName}-${nowSeconds()}`,
      status,
      toolName,
      label: labels[toolName] || `執行工具：${toolName}`,
      query,
      resultCount,
      error: result?.error
    }
  }
}

export function encodeSSEData(data: unknown) {
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

  return `你是這個項目管理系統的 AI 助理助手。你可以通過工具搜尋項目 Wiki，並 CRUD（建立、讀取、更新、刪除）項目的：需求（Requirements）、任務（Tasks）、缺陷（Bugs）。

以下是可用工具的描述，你必須根據用戶的需求調用正確的工具：
${TOOL_DEFINITIONS.map(t => `- ${t.function.name}: ${t.function.description}`).join('\n')}

重要原則：
- 用戶問「Wiki」「文件」「知識庫」「查找」「搜尋」「search」某個關鍵字或主題 = search_wiki 工具
- 用戶說「建立」「新增」「創建」= create_* 工具
- 用戶說「查看」「列表」「列出」= list_* 或 get_* 工具
- 用戶說「更新」「修改」「編輯」= update_* 工具
- 用戶說「刪除」「移除」= delete_* 工具
- 用戶說「統計」「圖表」「Chart」「分析進度」= get_project_stats 工具
- 只有在明確知道 ID 時才能 get/update/delete，否則先 list
- 所有操作結果要即時總結給用戶，Wiki 搜尋結果需列出標題、相關片段與更新時間

圖表功能：當用戶要求圖表或統計時，先調用 get_project_stats 工具，然後用 Chart.js 生成圖表 HTML。

重要：HTML 標籤不要使用 HTML entities，直接用原始字元！

## 圖表輸出格式（必須嚴格遵守）

請用以下格式輸出，這樣可以確保正確渲染：

「html
<canvas id="taskChart" data-config='{"type":"bar","data":{"labels":["完成","進行中","待處理"],"datasets":[{"label":"任務狀態","data":[3,5,2],"backgroundColor":["#22c55e","#f59e0b","#94a3b8"]}]},"options":{"responsive":true,"plugins":{"legend":{"position":"top"}}}}'></canvas>
」

或者更完整的格式（包含多個圖表）：

「html
<canvas id="reqChart" data-config='{"type":"doughnut","data":{"labels":["待處理","進行中","已完成"],"datasets":[{"data":[5,3,10],"backgroundColor":["#94a3b8","#f59e0b","#22c55e"]}]},"options":{"responsive":true}}'></canvas>
<canvas id="taskChart" data-config='{"type":"bar","data":{"labels":["待處理","進行中","已完成"],"datasets":[{"label":"任務","data":[8,5,15]}]},"options":{"responsive":true}}'></canvas>
」

⚠️ 注意：
- data-config 屬性的值必須是單引號包住的完整 JSON
- JSON 內部字串用雙引號（標準 JSON）
- 如果要放多個圖表，每個 canvas 都要有不同的 id
- 不要在 HTML 區塊中包含外部 script 標籤（CDN 會自動載入）

${projectCtx}

${wikiCtx}`
}

// ─── Tool Definitions ─────────────────────────────────────────────────────────
const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'get_project_stats',
      description: '取得項目的統計數據，用於生成圖表。當用戶詢問「統計」「圖表」「Chart」「分析」「進度報告」時使用。',
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
      name: 'search_wiki',
      description: '使用關鍵字搜尋當前項目的 Wiki 知識庫，回傳最相關的頁面標題、標籤、內容片段與更新時間。當用戶詢問 Wiki、文件、知識庫、search、查找某主題時使用。回傳包含 metadata.{requested, matched, returned, totalAvailable, hasMore}，當 hasMore=true 時應主動告知用戶「共 X 篇可查,已返回 M 篇」並建議縮小關鍵字。',
      parameters: {
        type: 'object',
        properties: {
          projectId: { type: 'string', description: '項目 ID（可選，若未提供則使用對話中的項目）' },
          query: { type: 'string', description: '搜尋關鍵字或問題，例如：部署、API、登入流程' },
          limit: { type: 'number', description: `最多回傳幾筆結果，預設 ${DEFAULT_WIKI_TOOL_RESULTS}，最多 ${MAX_WIKI_TOOL_RESULTS}` }
        },
        required: ['query']
      }
    }
  },
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
      // ── Project Stats ──
      case 'get_project_stats': {
        const { projectId } = args
        const effectiveProjectId = projectId || ctx.projectId
        if (!effectiveProjectId) return { error: 'projectId is required — 請先選擇一個項目或在對話中指定項目 ID' }

        const access = await assertProjectAccess({ id: ctx.userId, role: ctx.userRole }, effectiveProjectId)
        if (!access.ok) return { error: access.message }

        // Get all stats
        const [requirements, tasks, bugs, wikiPages, members] = await Promise.all([
          prisma.requirement.findMany({ where: { projectId: effectiveProjectId } }),
          prisma.task.findMany({ where: { projectId: effectiveProjectId } }),
          prisma.bug.findMany({ where: { projectId: effectiveProjectId } }),
          prisma.wikiPage.findMany({ where: { projectId: effectiveProjectId }, select: { id: true, tags: true } }),
          prisma.projectMember.findMany({ where: { projectId: effectiveProjectId } })
        ])

        // Count by status
        const reqByStatus = { pending: 0, in_progress: 0, completed: 0 }
        const taskByStatus = { pending: 0, in_progress: 0, completed: 0 }
        const bugByStatus = { open: 0, in_progress: 0, resolved: 0, verified: 0 }

        requirements.forEach(r => { if (r.status in reqByStatus) reqByStatus[r.status as keyof typeof reqByStatus]++ })
        tasks.forEach(t => { if (t.status in taskByStatus) taskByStatus[t.status as keyof typeof taskByStatus]++ })
        bugs.forEach(b => { if (b.status in bugByStatus) bugByStatus[b.status as keyof typeof bugByStatus]++ })

        // Calculate completion rates
        const reqTotal = requirements.length
        const reqDone = reqByStatus.completed
        const taskTotal = tasks.length
        const taskDone = taskByStatus.completed
        const bugTotal = bugs.length
        const bugResolved = bugByStatus.resolved + bugByStatus.verified

        return {
          project: access.project,
          requirements: { total: reqTotal, ...reqByStatus, completionRate: reqTotal ? Math.round(reqDone / reqTotal * 100) : 0 },
          tasks: { total: taskTotal, ...taskByStatus, completionRate: taskTotal ? Math.round(taskDone / taskTotal * 100) : 0 },
          bugs: { total: bugTotal, ...bugByStatus, resolutionRate: bugTotal ? Math.round(bugResolved / bugTotal * 100) : 0 },
          wikiPages: wikiPages.length,
          members: members.length,
          message: `項目統計：${reqTotal} 個需求，${taskTotal} 個任務，${bugTotal} 個缺陷`
        }
      }

      // ── Wiki ──
      case 'search_wiki': {
        const { projectId, query, limit } = args
        const effectiveProjectId = projectId || ctx.projectId
        const trimmedQuery = typeof query === 'string' ? query.trim() : ''

        if (!trimmedQuery) return { error: 'query is required — 請提供要搜尋的 Wiki 關鍵字' }

        // Sprint 21 US-21.5: cross-project query. If no project context
        // is given, search across all projects the user is a member of
        // (admin → all projects). Merge results, sort by score, and cap
        // at `take` total. If user has memberships, prefer current
        // project first; admin gets all.
        let searchProjectIds: string[] = []
        if (effectiveProjectId) {
          searchProjectIds = [effectiveProjectId]
        } else if (ctx.userRole === 'admin') {
          // admin: search all projects
          const allProjects = await prisma.project.findMany({ select: { id: true } })
          searchProjectIds = allProjects.map(p => p.id)
        } else {
          // non-admin: search all member projects
          const memberships = await prisma.projectMember.findMany({
            where: { userId: ctx.userId },
            select: { projectId: true }
          })
          searchProjectIds = memberships.map(m => m.projectId)
        }

        if (searchProjectIds.length === 0) {
          return {
            error: '你尚未加入任何項目,無法搜尋 Wiki。請聯絡項目管理員加入項目,或直接選擇一個項目。',
            query: trimmedQuery,
            results: [],
            metadata: { requested: 0, matched: 0, returned: 0, totalAvailable: 0, hasMore: false }
          }
        }

        // Run search for each project in parallel, then merge by score.
        const perProjectResponses = await Promise.all(
          searchProjectIds.map(pid => searchWikiPages(pid, trimmedQuery, limit))
        )

        // Merge: flatten results, sort by score, take top `limit`.
        const allResults = perProjectResponses.flatMap(r => r.results)
        const totalMatched = perProjectResponses.reduce((sum, r) => sum + r.matched, 0)
        const totalAvailable = perProjectResponses.reduce((sum, r) => sum + r.totalAvailable, 0)
        const requested = clampLimit(limit, DEFAULT_WIKI_TOOL_RESULTS, MAX_WIKI_TOOL_RESULTS)

        const merged = allResults
          .sort((a, b) => b.score - a.score || b.updatedAt.getTime() - a.updatedAt.getTime())
          .slice(0, requested)

        // Look up project name for each result
        const projectNames = new Map<string, string>()
        if (searchProjectIds.length > 1) {
          const projects = await prisma.project.findMany({
            where: { id: { in: searchProjectIds } },
            select: { id: true, name: true }
          })
          for (const p of projects) projectNames.set(p.id, p.name)
        }

        const isCrossProject = searchProjectIds.length > 1
        const response = {
          query: trimmedQuery,
          results: merged.map(page => ({
            id: page.id,
            title: page.title,
            tags: page.tags || [],
            score: page.score,
            snippet: page.snippet,
            updatedAt: page.updatedAt,
            projectId: (page as any).projectId,
            projectName: projectNames.get((page as any).projectId) || null
          })),
          metadata: {
            requested,
            matched: totalMatched,
            returned: merged.length,
            totalAvailable,
            hasMore: totalMatched > merged.length,
            crossProject: isCrossProject,
            searchedProjects: searchProjectIds.length
          },
          message: isCrossProject
            ? `跨項目搜尋了 ${searchProjectIds.length} 個項目,${totalMatched > merged.length ? `找到 ${totalMatched} 篇,已返回 ${merged.length} 篇(共 ${totalAvailable} 篇可查)` : `找到 ${merged.length} 篇相關 Wiki 頁面`}`
            : totalMatched > merged.length
            ? `找到 ${totalMatched} 篇相關 Wiki 頁面,已返回 ${merged.length} 篇(共 ${totalAvailable} 篇可查)。如需其他結果請縮小搜尋範圍。`
            : merged.length > 0
            ? `找到 ${merged.length} 篇相關 Wiki 頁面`
            : `找不到包含「${trimmedQuery}」的 Wiki 頁面`
        }

        return response
      }

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
const LLM_TIMEOUT_MS = 120_000 // 2 minutes for LLM calls
const LLM_MAX_RETRIES = 2
const LLM_RETRY_DELAY_MS = 2000

class LLMTimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LLMTimeoutError'
  }
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function callLLMWithTools(options: {
  messages: ChatCompletionMessage[]
  config: { apiUrl: string; apiKey: string; model: string }
  signal?: AbortSignal
  timeout?: number
  retryCount?: number
}) {
  const { messages, config, signal, timeout = LLM_TIMEOUT_MS, retryCount = 0 } = options

  // Create a timeout controller
  const timeoutController = new AbortController()
  const timeoutId = setTimeout(() => {
    timeoutController.abort()
  }, timeout)

  try {
    // Combine external signal with timeout
    const combinedSignal = signal
      ? AbortSignal.any([signal, timeoutController.signal])
      : timeoutController.signal

    const url = normalizeChatCompletionUrl(config.apiUrl)
    console.log('[Chat] LLM request to:', url, 'with', messages.length, 'messages')

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        ...(config.apiKey ? { 'Authorization': `Bearer ${config.apiKey}` } : {})
      },
      signal: combinedSignal,
      body: JSON.stringify({
        model: config.model,
        stream: true,
        temperature: 0.3,
        messages,
        tools: TOOL_DEFINITIONS,
        tool_choice: 'auto'
      })
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      console.log('[Chat] LLM error response:', response.status, text)
      throw new Error(`LLM request failed (${response.status}): ${text || response.statusText}`)
    }

    if (!response.body) {
      // Some providers return non-streaming response even with stream: true
      const text = await response.text().catch(() => '')
      console.log('[Chat] Non-streaming response received')
      return JSON.parse(text)
    }

    return response.json()
  } catch (error: any) {
    clearTimeout(timeoutId)

    // Log more details about the error
    console.log('[Chat] LLM error details:', {
      name: error.name,
      message: error.message,
      status: error.response?.status,
      retryCount
    })

    // Check if it's a retryable error
    const isNetworkError = error.name === 'TypeError' ||
      error.name === 'FetchError' ||
      error.message?.includes('connection') ||
      error.message?.includes('network') ||
      error.message?.includes('fetch') ||
      error.message?.includes('closed') ||
      error.message?.includes('aborted')

    const shouldRetry = (error instanceof LLMTimeoutError || isNetworkError) && retryCount < LLM_MAX_RETRIES

    if (shouldRetry) {
      console.log(`[Chat] Retrying LLM call (${retryCount + 1}/${LLM_MAX_RETRIES})...`)
      await sleep(LLM_RETRY_DELAY_MS * (retryCount + 1))
      return callLLMWithTools({ messages, config, signal, timeout, retryCount: retryCount + 1 })
    }

    if (error.name === 'AbortError' && timeoutController.signal.aborted) {
      throw new LLMTimeoutError(`LLM request timed out after ${timeout}ms`)
    }
    throw error
  }
}

export async function streamLLMResponse(options: {
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
  let toolActivitiesSent = 0 // Track how many tool activities we've sent

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: string) => controller.enqueue(encoder.encode(payload))
      const sendData = (payload: unknown) => send(encodeSSEData(payload))
      const sendChunk = (text: string) => {
        assistantContent += text
        sendData(sseChunk({ id: streamId, model: config.model, content: text }))
      }

      try {
        // ── Step 1: Stream initial LLM call with tools ────────────────────────
        const url = normalizeChatCompletionUrl(config.apiUrl)
        console.log('[Chat] Streaming LLM request to:', url, 'with', messages.length, 'messages')

        // Create timeout
        const timeoutController = new AbortController()
        const timeoutId = setTimeout(() => timeoutController.abort(), LLM_TIMEOUT_MS)
        // Use signal directly - timeout will be handled by the timeout check below
        const fetchSignal = signal || timeoutController.signal

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream',
            ...(config.apiKey ? { 'Authorization': `Bearer ${config.apiKey}` } : {})
          },
          signal: fetchSignal,
          body: JSON.stringify({
            model: config.model,
            stream: true,
            temperature: 0.3,
            messages,
            // Qwen 3.7+ reasoning models 預設會 emit reasoning_content 唔 emit content,
            // 對一般 chat UX 嚟講係噪音(成段 "Thinking Process: ..." 文字)。
            // 設 false 強制熄 thinking mode,output 落返 content field。
            // DashScope-native 一定 support;third-party proxy (e.g. uniin.cn) 視乎
            // implementation,通常 pass-through 或 silently ignore。
            enable_thinking: false,
            tools: TOOL_DEFINITIONS,
            tool_choice: 'auto'
          })
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          const text = await response.text().catch(() => '')
          console.log('[Chat] LLM error response:', response.status, text)
          throw new Error(`LLM request failed (${response.status}): ${text || response.statusText}`)
        }

        // Check if body exists for streaming
        if (!response.body) {
          throw new Error('LLM response has no body (non-streaming response)')
        }

        // Process streaming response
        const reader = response.body!.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let initialContent = ''
        let toolCalls: any[] = []

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const rawLine of lines) {
            // 相容兩種 SSE prefix:標準 OpenAI "data: {...}" (with space)
            // 同 DashScope 風格 "data:{...}" (no space)。後者係 Qwen 系 proxy
            // (e.g. openai.uniin.cn) 嘅預設格式, 唔處理就成個 stream 變 0 chunk。
            const line = rawLine.trim()
            if (!line.startsWith('data:')) continue
            const data = line.startsWith('data: ') ? line.slice(6) : line.slice(5)
            if (data === '[DONE]' || data === '') continue

            try {
              const parsed = JSON.parse(data)

              // Only extract actual content, not reasoning (which shows model's thinking)
              const delta = parsed?.choices?.[0]?.delta
              const contentDelta = delta?.content
              if (typeof contentDelta === 'string' && contentDelta) {
                initialContent += contentDelta
                sendChunk(contentDelta)
              }

              // Extract tool calls
              const deltaToolCalls = parsed?.choices?.[0]?.delta?.tool_calls
              if (deltaToolCalls && Array.isArray(deltaToolCalls)) {
                for (const tc of deltaToolCalls) {
                  // Find or create tool call
                  const index = tc.index || 0
                  if (!toolCalls[index]) {
                    toolCalls[index] = { id: tc.id, function: { name: '', arguments: '' } }
                  }
                  if (tc.function?.name) toolCalls[index].function.name += tc.function.name
                  if (tc.function?.arguments) toolCalls[index].function.arguments += tc.function.arguments
                }
              }
            } catch {}
          }
        }

        console.log('[Chat] Initial streaming complete - content length:', initialContent.length, 'toolCalls:', toolCalls.length)

        // ── Step 2: Execute tool calls if any ──────────────────────────────────
        const toolResults: Array<{ tool_call_id: string; name: string; content: string }> = []

        if (toolCalls.length > 0) {
          for (const tc of toolCalls) {
            let args: Record<string, any> = {}
            try {
              args = JSON.parse(tc.function.arguments || '{}')
            } catch {
              args = {}
            }

            console.log('[Chat] Executing tool:', tc.function.name, 'args:', JSON.stringify(args))
            sendData(toolActivityEvent({ id: streamId, model: config.model, status: 'started', toolName: tc.function.name, toolCallId: tc.id, args }))

            const ctx: ToolContext = { userId, userRole, userPermissions, projectId }
            const result = await executeTool(tc.function.name, args, ctx)
            const status = result?.error ? 'failed' : 'completed'

            console.log('[Chat] Tool result:', JSON.stringify(result).slice(0, 200))
            sendData(toolActivityEvent({ id: streamId, model: config.model, status, toolName: tc.function.name, toolCallId: tc.id, args, result }))

            // For search_wiki, always show the file names to user
            if (tc.function.name === 'search_wiki' && result?.results && Array.isArray(result.results)) {
              const titles = result.results.map((r: any) => r.title || '未命名').join('\n  ')
              const meta = result.metadata
              const projectLabel = meta?.crossProject
                ? `\n🌐 跨項目搜尋 (${meta.searchedProjects} 個項目)`
                : ''
              const header = meta?.hasMore
                ? `${projectLabel}\n\n📄 找到 ${meta.matched} 篇相關文件,已返回 ${meta.returned} 篇(共 ${meta.totalAvailable} 篇可查):\n  ${titles}\n\n💡 如需其他結果,請嘗試更具體的關鍵字。\n\n`
                : `${projectLabel}\n\n📄 找到 ${meta?.returned ?? 0} 篇相關文件:\n  ${titles}\n\n`
              sendChunk(header)
            } else if (tc.function.name === 'search_wiki' && result?.error) {
              // Show error message
              sendChunk(`\n\n⚠️ ${result.error}\n\n`)
            }

            toolResults.push({
              tool_call_id: tc.id,
              name: tc.function.name,
              content: JSON.stringify(result, null, 2)
            })
          }

          // ── Step 3: Stream follow-up LLM call with tool results ───────────────
          const toolMessages: ChatCompletionMessage[] = [
            ...messages,
            { role: 'assistant', content: initialContent || null, tool_calls: toolCalls.map((tc, i) => ({ id: tc.id, type: 'function', function: { name: tc.function.name, arguments: tc.function.arguments } })) },
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

          console.log('[Chat] Streaming follow-up LLM with', cleanMessages.length, 'messages')

          // Stream follow-up response - create new AbortController for timeout
          const followUpController = new AbortController()
          const followUpTimeoutId = setTimeout(() => followUpController.abort(), LLM_TIMEOUT_MS)
          const followUpSignal = signal ? AbortSignal.any([signal, followUpController.signal]) : followUpController.signal

          let followUpResponse
          try {
            followUpResponse = await fetch(url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'text/event-stream',
                ...(config.apiKey ? { 'Authorization': `Bearer ${config.apiKey}` } : {})
              },
              signal: followUpSignal,
              body: JSON.stringify({
                model: config.model,
                stream: true,
                temperature: 0.3,
                messages: cleanMessages,
                // 同 initial call — 熄 thinking mode
                enable_thinking: false
              })
            })
            clearTimeout(followUpTimeoutId)
          } catch (fetchError: any) {
            clearTimeout(followUpTimeoutId)
            console.log('[Chat] Follow-up fetch error:', fetchError.name, fetchError.message)
            throw fetchError
          }

          if (!followUpResponse.ok) {
            const text = await followUpResponse.text().catch(() => '')
            console.log('[Chat] Follow-up response error:', followUpResponse.status, text)
            throw new Error(`Follow-up LLM failed (${followUpResponse.status})`)
          }

          if (!followUpResponse.body) {
            throw new Error('LLM follow-up response has no body (non-streaming response)')
          }

          // Log raw response headers for debugging
          console.log('[Chat] Follow-up response status:', followUpResponse.status)
          console.log('[Chat] Follow-up response content-type:', followUpResponse.headers.get('content-type'))

          const contentType = followUpResponse.headers.get('content-type') || ''
          if (contentType.includes('text/event-stream')) {
            console.log('[Chat] Confirmed SSE stream')
          } else {
            // If not SSE, read as regular JSON
            const text = await followUpResponse.text()
            console.log('[Chat] Non-SSE response, length:', text.length, 'preview:', text.slice(0, 300))
          }

          console.log('[Chat] Follow-up response received, processing stream...')

          const followUpReader = followUpResponse.body!.getReader()
          let followUpBuffer = ''
          let chunkCount = 0

          while (true) {
            const { done, value } = await followUpReader.read()
            if (done) break

            followUpBuffer += decoder.decode(value, { stream: true })
            const lines = followUpBuffer.split('\n')
            followUpBuffer = lines.pop() || ''

            for (const rawLine of lines) {
              // 同 initial parser — 相容 OpenAI "data: {...}" 同 DashScope "data:{...}"
              const line = rawLine.trim()
              if (!line.startsWith('data:')) continue
              const data = line.startsWith('data: ') ? line.slice(6) : line.slice(5)
              if (data === '[DONE]' || data === '') continue

              try {
                const parsed = JSON.parse(data)
                // Log raw response structure for debugging
                chunkCount++
                if (chunkCount === 1) {
                  console.log('[Chat] First follow-up chunk:', JSON.stringify(parsed).slice(0, 500))
                }

                // Only extract actual content, not reasoning
                const delta = parsed?.choices?.[0]?.delta
                const contentDelta = delta?.content
                if (typeof contentDelta === 'string' && contentDelta) {
                  sendChunk(contentDelta)
                }
              } catch (parseErr) {
                console.log('[Chat] Parse error in follow-up:', parseErr, 'line:', line.slice(0, 100))
              }
            }
          }

          console.log('[Chat] Follow-up streaming complete, chunks:', chunkCount, 'content length:', assistantContent.length)
        }

        // ── Step 4: Finalize ───────────────────────────────────────────────────
        sendData(sseChunk({ id: streamId, model: config.model, finishReason: 'stop' }))

        if (assistantContent.trim()) {
          // Use Promise.all for parallel writes to avoid connection contention
          await Promise.all([
            prisma.chatMessage.create({
              data: { sessionId, role: 'assistant', content: assistantContent }
            }),
            prisma.chatSession.update({
              where: { id: sessionId },
              data: { updatedAt: new Date() }
            })
          ])
        }

        sendData('[DONE]')
        controller.close()
      } catch (error) {
        // Check if we already sent partial content
        const hasPartialContent = assistantContent.trim().length > 0

        if (hasPartialContent) {
          // Save partial response and notify user
          console.log('[Chat] Stream interrupted with partial content, saving...')
          try {
            await prisma.chatMessage.create({
              data: { sessionId, role: 'assistant', content: assistantContent + '\n\n[回應被中斷]' }
            })
            sendData(sseChunk({ id: streamId, model: config.model, finishReason: 'stop' }))
            sendData('[DONE]')
            // Only close if not already closed
            try { controller.close() } catch {}
            return
          } catch (saveError) {
            console.log('[Chat] Failed to save partial:', saveError)
          }
        }

        const isTimeout = error instanceof LLMTimeoutError
        const isNetworkError = error instanceof Error && (
          error.message?.includes('connection') ||
          error.message?.includes('network') ||
          error.message?.includes('fetch') ||
          error.message?.includes('closed')
        )

        const message = isTimeout
          ? '抱歉，AI 回應時間過長，請嘗試較簡短的問題或稍後再試。'
          : isNetworkError
            ? '網絡連接不穩定，回應被中斷。請稍後重試。'
            : error instanceof Error
              ? `AI 處理失敗：${error.message}`
              : 'LLM streaming failed'

        console.log('[Chat] Stream error:', error instanceof Error ? error.message : error)

        // Try to save partial content and send final message
        try {
          // Save partial content to database
          if (assistantContent.trim()) {
            await prisma.chatMessage.create({
              data: { sessionId, role: 'assistant', content: assistantContent + '\n\n[回應被中斷]' }
            }).catch(() => {})
          }
          // Try to send final message to client
          try {
            sendData(sseChunk({ id: streamId, model: config.model, content: `\n\n⚠️ ${message}` }))
            sendData(sseChunk({ id: streamId, model: config.model, finishReason: 'stop' }))
            sendData('[DONE]')
          } catch {}
        } catch {}
        // Always try to close controller
        try { controller.close() } catch {}
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