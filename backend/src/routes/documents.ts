import { Elysia } from 'elysia'
import { prisma } from '../utils/prisma'
import * as fs from 'fs'
import * as path from 'path'
import * as mammoth from 'mammoth'
import * as XLSX from 'xlsx'

const MAX_FILE_SIZE = 5 * 1024 * 1024
const SUPPORTED_EXTENSIONS = ['.docx', '.md', '.xlsx']
const MAX_PROMPT_TEXT_LENGTH = 60_000

type UploadedFileInfo = {
  fileName: string
  mimeType: string
  fileSize: number
  buffer: Buffer
}

type ParsedLLMDocument = {
  title?: string
  summary?: string
  wikiContent?: string
  content?: string
  tags?: string[]
  recommendations?: string[]
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

function truncateText(text: string, maxLength = MAX_PROMPT_TEXT_LENGTH) {
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength)}\n\n[內容過長，已截斷 ${text.length - maxLength} 個字元]`
}

function getExtension(fileName: string, mimeType?: string) {
  const ext = path.extname(fileName || '').toLowerCase()
  if (ext) return ext

  const mimeToExt: Record<string, string> = {
    'text/markdown': '.md',
    'text/x-markdown': '.md',
    'text/plain': '.md',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'application/vnd.ms-excel': '.xlsx'
  }
  return mimeToExt[mimeType || ''] || ''
}

async function readUploadedFile(file: any): Promise<UploadedFileInfo> {
  if (!file || typeof file !== 'object') {
    throw new Error('file is required and must be a valid uploaded file')
  }

  if ('path' in file && typeof file.path === 'string') {
    const stats = fs.statSync(file.path)
    return {
      fileName: file.name || file.filename || path.basename(file.path),
      mimeType: file.type || 'application/octet-stream',
      fileSize: stats.size,
      buffer: fs.readFileSync(file.path)
    }
  }

  if (typeof file.arrayBuffer === 'function') {
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    return {
      fileName: file.name || file.filename || 'uploaded-file',
      mimeType: file.type || 'application/octet-stream',
      fileSize: typeof file.size === 'number' ? file.size : buffer.length,
      buffer
    }
  }

  throw new Error('file is required and must be a valid uploaded file')
}

async function parseDocument(fileInfo: UploadedFileInfo, ext: string) {
  if (ext === '.md') {
    return fileInfo.buffer.toString('utf-8')
  }

  if (ext === '.docx') {
    const result = await mammoth.extractRawText({ buffer: fileInfo.buffer })
    const warnings = result.messages?.map((m: any) => m.message).filter(Boolean) || []
    return warnings.length > 0
      ? `${result.value}\n\n[解析警告]\n${warnings.map((w: string) => `- ${w}`).join('\n')}`
      : result.value
  }

  if (ext === '.xlsx') {
    const workbook = XLSX.read(fileInfo.buffer, { type: 'buffer' })
    const sheetTexts: string[] = []

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName]
      if (!sheet) continue
      const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false })
      if (csv.trim()) {
        sheetTexts.push(`## Sheet: ${sheetName}\n${csv.trim()}`)
      }
    }

    return sheetTexts.join('\n\n')
  }

  throw new Error(`Unsupported file type: ${ext}`)
}

function stripJsonFence(text: string) {
  let cleaned = text.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  }
  return cleaned.trim()
}

function parseLLMJson(text: string): ParsedLLMDocument | null {
  const cleaned = stripJsonFence(text)
  const candidates = [cleaned]

  const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
  if (jsonMatch?.[0] && jsonMatch[0] !== cleaned) candidates.push(jsonMatch[0])

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      if (parsed && typeof parsed === 'object') return parsed
    } catch {
      // Try the next candidate.
    }
  }

  return null
}

function buildFallbackWikiContent(fileName: string, rawText: string, llmOutput: string, structured: ParsedLLMDocument | null) {
  if (structured?.wikiContent || structured?.content) {
    return structured.wikiContent || structured.content || ''
  }

  const summary = structured?.summary ? `## 摘要\n${structured.summary}\n\n` : ''
  const recommendations = structured?.recommendations?.length
    ? `## 建議\n${structured.recommendations.map(item => `- ${item}`).join('\n')}\n\n`
    : ''

  return `# ${structured?.title || `${fileName} 文件解析`}\n\n${summary}${recommendations}## AI 分析結果\n${llmOutput.trim()}\n\n## 原始解析內容節選\n\n\`\`\`text\n${truncateText(rawText, 12_000)}\n\`\`\`\n`
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

async function analyzeDocumentWithLLM(
  fileName: string,
  parsedText: string
): Promise<{ content: string | null; raw: string | null; error?: string }> {
  const config = await prisma.lLMConfig.findFirst()
  if (!config) {
    return { content: null, raw: null, error: '請先到「AI 設定」頁面配置 API Key 和模型' }
  }

  try {
    const prompt = `你是一個資深項目管理文件分析助手。請分析以下文件內容，提取可直接建立為 WikiPage 的結構化知識。\n\n請只輸出 JSON，不要包含 Markdown code fence 或額外文字，格式如下：\n{\n  "title": "適合作為 Wiki 頁面的標題",\n  "summary": "文件摘要",\n  "wikiContent": "完整 Markdown Wiki 內容，需包含重點、需求/任務/風險/待確認事項等章節",\n  "tags": ["document", "ai-parsed"],\n  "recommendations": ["後續建議 1", "後續建議 2"]\n}\n\n## 文件名稱\n${fileName}\n\n## 文件內容\n${truncateText(parsedText)}`

    const response = await fetch(normalizeChatCompletionUrl(config.apiUrl), {
      method: 'POST',
      headers: llmHeaders(config.apiKey),
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        stream: false,
        messages: [
          { role: 'system', content: '你擅長將項目文件整理為清晰的知識庫頁面。請嚴格輸出可解析 JSON。' },
          { role: 'user', content: prompt }
        ]
      })
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      return { content: null, raw: null, error: `AI 分析失敗（HTTP ${response.status}），請確認 API Key 和模型是否正確` }
    }

    const data = await response.json().catch(() => null) as any
    const content = data?.choices?.[0]?.message?.content
      || data?.choices?.[0]?.text
      || data?.output_text
      || data?.content

    if (!content || typeof content !== 'string') {
      return { content: null, raw: null, error: 'AI 回應格式不符預期，請嘗試其他模型或稍後再試' }
    }

    return { content, raw: content, error: undefined }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'AI 分析時發生未知錯誤'
    return { content: null, raw: null, error: msg }
  }
}

const documentRoutes = new Elysia({ prefix: '/documents' })
  .post('/parse', async ({ body, set, user }) => {
    if (!user) {
      return errorResponse(set, 401, 'UNAUTHORIZED', 'Authentication required')
    }

    const { file, projectId } = body as { file?: any; projectId?: string }
    if (!file) {
      return errorResponse(set, 400, 'VALIDATION_ERROR', 'file is required')
    }

    try {
      const fileInfo = await readUploadedFile(file)
      if (fileInfo.fileSize > MAX_FILE_SIZE) {
        return errorResponse(set, 413, 'FILE_TOO_LARGE', 'File size exceeds 5MB limit')
      }

      const ext = getExtension(fileInfo.fileName, fileInfo.mimeType)
      if (!SUPPORTED_EXTENSIONS.includes(ext)) {
        return errorResponse(set, 400, 'UNSUPPORTED_FILE_TYPE', 'Supported file types are .docx, .md, and .xlsx')
      }

      if (projectId) {
        const access = await assertProjectAccess(user, projectId)
        if (!access.ok) {
          return errorResponse(set, access.status, access.code, access.message)
        }
      }

      const parsedText = await parseDocument(fileInfo, ext)
      if (!parsedText.trim()) {
        return errorResponse(set, 422, 'PARSE_EMPTY', 'Document parsed successfully but no text content was found')
      }

      const llmResult = await analyzeDocumentWithLLM(fileInfo.fileName, parsedText)
      const llmOutput = llmResult.raw ?? ''

      // If LLM is not configured or failed, return a friendly message
      if (llmResult.error) {
        return {
          success: false,
          error: {
            code: 'LLM_NOT_CONFIGURED',
            message: llmResult.error
          }
        }
      }

      const structured = parseLLMJson(llmOutput)
      const title = (structured?.title || `${path.basename(fileInfo.fileName, ext)} 文件解析`).slice(0, 200)
      const tags = Array.isArray(structured?.tags)
        ? Array.from(new Set([...(structured?.tags || []), 'ai-parsed', ext.slice(1)]))
        : ['ai-parsed', ext.slice(1)]
      const wikiContent = buildFallbackWikiContent(fileInfo.fileName, parsedText, llmOutput, structured)

      let wikiPage = null
      if (projectId) {
        const lastPage = await prisma.wikiPage.findFirst({
          where: { projectId },
          orderBy: { order: 'desc' },
          select: { order: true }
        })

        wikiPage = await prisma.wikiPage.create({
          data: {
            projectId,
            title,
            content: wikiContent,
            tags,
            order: (lastPage?.order ?? -1) + 1,
            createdById: user.id
          },
          include: {
            createdBy: { select: { id: true, name: true } },
            project: { select: { id: true, name: true } }
          }
        })
      }

      return {
        success: true,
        file: {
          name: fileInfo.fileName,
          size: fileInfo.fileSize,
          type: ext
        },
        parsedTextPreview: truncateText(parsedText, 2_000),
        analysis: structured || { raw: llmOutput },
        wikiPage,
        message: projectId
          ? 'Document parsed, analyzed by LLM, and WikiPage created.'
          : 'Document parsed and analyzed by LLM. Provide projectId to create a WikiPage automatically.'
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Document parsing failed'
      return errorResponse(set, 500, 'DOCUMENT_PARSE_FAILED', message)
    }
  })

export { documentRoutes }
export default documentRoutes
