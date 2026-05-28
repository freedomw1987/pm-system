import { Elysia } from 'elysia'
import { prisma } from '../utils/prisma'
import * as fs from 'fs'
import * as path from 'path'
import * as mammoth from 'mammoth'
import * as XLSX from 'xlsx'
import { $ } from 'bun'

const MAX_FILE_SIZE = 50 * 1024 * 1024
const SUPPORTED_EXTENSIONS = ['.docx', '.md', '.xlsx', '.pdf']
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

/**
 * Convert PDF pages to images using pdftoppm
 * Returns array of image buffers (PNG format)
 */
async function convertPdfToImages(pdfBuffer: Buffer, maxPages = 10): Promise<Buffer[]> {
  const tmpDir = `/tmp/pdf_${Date.now()}`
  const pdfPath = `${tmpDir}/input.pdf`
  const outputPrefix = `${tmpDir}/page`

  // Ensure tmp directory exists
  await fs.promises.mkdir(tmpDir, { recursive: true })

  // Write PDF to temp file
  await fs.promises.writeFile(pdfPath, pdfBuffer)

  try {
    // Get page count
    const pdfInfoResult = await $`pdfinfo ${pdfPath}`.text()
    const pageMatch = pdfInfoResult.match(/Pages:\s*(\d+)/)
    const pageCount = pageMatch ? Math.min(parseInt(pageMatch[1]), maxPages) : 1

    console.log(`[PDF] Converting ${pageCount} pages to images...`)

    // Convert PDF pages to PNG images
    // -r 150: 150 DPI resolution
    // -png: output as PNG
    // -f 1 -l N: first to N pages
    await $`pdftoppm -r 150 -png -f 1 -l ${pageCount} ${pdfPath} ${outputPrefix}`.text()

    // Read all generated PNG files
    const imageBuffers: Buffer[] = []
    for (let i = 1; i <= pageCount; i++) {
      const imgPath = `${outputPrefix}-${i}.png`
      try {
        const imgBuffer = await fs.promises.readFile(imgPath)
        imageBuffers.push(imgBuffer)
        console.log(`[PDF] Page ${i}: ${imgBuffer.length} bytes`)
      } catch {
        console.log(`[PDF] Page ${i} not found, skipping`)
      }
    }

    return imageBuffers
  } finally {
    // Cleanup temp files
    await $`rm -rf ${tmpDir}`.text()
  }
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
    'application/vnd.ms-excel': '.xlsx',
    'application/pdf': '.pdf'
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

  if (ext === '.pdf') {
    // First try pdf2json for text extraction
    const PDFParser = (await import('pdf2json')).default
    const pdfParser = new PDFParser()

    const textContent = await new Promise<string>((resolve, reject) => {
      pdfParser.on('pdfParser_dataError', (errData: any) => {
        reject(new Error(errData.parserError || 'PDF parsing failed'))
      })
      pdfParser.on('pdfParser_dataReady', () => {
        const text = pdfParser.getRawTextContent()
        resolve(text || '')
      })
      pdfParser.parseBuffer(fileInfo.buffer)
    })

    // If no text found, try OCR on embedded images
    if (!textContent.trim()) {
      console.log('[Document Parse] No text in PDF, trying OCR...')

      // Try to use Tesseract for OCR if available
      try {
        // Note: Full PDF to image conversion would require pdf.js or sharp
        // For now, we'll mark it as needing manual processing
        console.log('[Document Parse] PDF appears to be scanned, OCR not fully implemented')
        throw new Error('PDF appears to be a scanned document without extractable text. Please use a PDF with text layer or convert to images first.')
      } catch (ocrError) {
        throw new Error('PDF appears to be a scanned document without extractable text. Please use a PDF with text layer or convert to images first.')
      }
    }

    return textContent
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

/**
 * Analyze PDF by converting to images first
 */
async function analyzePdfWithImages(
  fileName: string,
  pdfBuffer: Buffer
): Promise<{ content: string | null; raw: string | null; error?: string }> {
  const config = await prisma.lLMConfig.findFirst()
  if (!config) {
    return { content: null, raw: null, error: '請先到「AI 設定」頁面配置 API Key 和模型' }
  }

  // Use Vision LLM if configured, otherwise fallback to main LLM
  const useVision = config.visionApiUrl && config.visionModel
  const apiUrl = useVision ? config.visionApiUrl! : config.apiUrl
  const apiKey = useVision ? config.visionApiKey : config.apiKey
  const model = useVision ? config.visionModel! : config.model

  if (!apiKey) {
    return { content: null, raw: null, error: '請先到「AI 設定」頁面配置 API Key 和模型' }
  }

  try {
    // Convert PDF pages to images
    console.log(`[PDF] Converting PDF to images...`)
    const imageBuffers = await convertPdfToImages(pdfBuffer)

    if (imageBuffers.length === 0) {
      return { content: null, raw: null, error: 'PDF 轉換為圖片失敗，請確認 PDF 檔案有效' }
    }

    console.log(`[PDF] Converted ${imageBuffers.length} pages to images`)
    console.log(`[PDF] Using ${useVision ? 'Vision' : 'Main'} LLM: ${model}`)

    // Build messages with images - each page is a separate message
    const imageMessages: any[] = []
    for (let i = 0; i < Math.min(imageBuffers.length, 5); i++) {
      imageMessages.push({
        role: 'user',
        content: [
          { type: 'text', text: `第 ${i + 1} 頁：` },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${imageBuffers[i].toString('base64')}` } }
        ]
      })
    }

    // Add analysis prompt as the last message
    const promptMessage = {
      role: 'user' as const,
      content: `以上是 PDF 文件的全部 ${imageBuffers.length} 頁圖片。請分析這些頁面內容，提取可直接建立為 WikiPage 的結構化知識。

請只輸出 JSON，不要包含 Markdown code fence 或額外文字，格式如下：
{
  "title": "適合作為 Wiki 頁面的標題",
  "summary": "文件摘要",
  "wikiContent": "完整 Markdown Wiki 內容，需包含重點、需求/任務/風險/待確認事項等章節",
  "tags": ["document", "ai-parsed"],
  "recommendations": ["後續建議 1", "後續建議 2"]
}`
    }

    const messages = [
      { role: 'system' as const, content: '你擅長將項目文件整理為清晰的知識庫頁面。請嚴格輸出可解析 JSON。' },
      ...imageMessages,
      promptMessage
    ]

    console.log(`[PDF] Sending ${messages.length} messages with ${imageBuffers.length} images to LLM`)
    console.log(`[PDF] First image message structure:`, JSON.stringify(messages[1]))

    const response = await fetch(normalizeChatCompletionUrl(apiUrl), {
      method: 'POST',
      headers: llmHeaders(apiKey),
      body: JSON.stringify({
        model,
        temperature: 0.2,
        stream: false,
        messages
      })
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      console.log(`[PDF] LLM API Error: ${response.status}`, text)
      return { content: null, raw: null, error: `AI 分析失敗（HTTP ${response.status}），請確認 API Key 和模型是否正確` }
    }

    const data = await response.json().catch(() => null)
    // Direct extraction - works for most APIs (OpenAI, qwen, etc.)
    const content = data?.choices?.[0]?.message?.content
      || data?.choices?.[0]?.text
      || data?.output_text
      || data?.content
      || null

    if (!content || typeof content !== 'string') {
      return { content: null, raw: null, error: 'AI 回應格式不符預期，請嘗試其他模型或稍後再試' }
    }

    return { content, raw: content, error: undefined }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'PDF 分析時發生未知錯誤'
    console.log(`[PDF] Error:`, msg)
    return { content: null, raw: null, error: msg }
  }
}

async function analyzeDocumentWithLLM(
  fileName: string,
  parsedText: string,
  fileBuffer?: Buffer,
  mimeType?: string,
  isPdf = false
): Promise<{ content: string | null; raw: string | null; error?: string }> {
  const config = await prisma.lLMConfig.findFirst()
  if (!config) {
    return { content: null, raw: null, error: '請先到「AI 設定」頁面配置 API Key 和模型' }
  }

  // For PDF files, use image-based analysis
  if (isPdf && fileBuffer) {
    return analyzePdfWithImages(fileName, fileBuffer)
  }

  try {
    console.log(`[Document Parse] Using model: ${config.model}`)

    // Build messages
    const messages: any[] = [
      { role: 'system', content: '你擅長將項目文件整理為清晰的知識庫頁面。請嚴格輸出可解析 JSON。' },
      { role: 'user', content: `你是一個資深項目管理文件分析助手。請分析以下文件內容，提取可直接建立為 WikiPage 的結構化知識。

請只輸出 JSON，不要包含 Markdown code fence 或額外文字，格式如下：
{
  "title": "適合作為 Wiki 頁面的標題",
  "summary": "文件摘要",
  "wikiContent": "完整 Markdown Wiki 內容，需包含重點、需求/任務/風險/待確認事項等章節",
  "tags": ["document", "ai-parsed"],
  "recommendations": ["後續建議 1", "後續建議 2"]
}

## 文件名稱
${fileName}

## 文件內容
${truncateText(parsedText)}` }
    ]

    console.log(`[Document Parse] Messages: ${messages.length}`)

    const response = await fetch(normalizeChatCompletionUrl(config.apiUrl), {
      method: 'POST',
      headers: llmHeaders(config.apiKey),
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        stream: false,
        messages
      })
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      console.log('[Document Parse] LLM API Error:', response.status, text)
      return { content: null, raw: null, error: `AI 分析失敗（HTTP ${response.status}），請確認 API Key 和模型是否正確` }
    }

    const data = await response.json().catch(() => null)
    // Direct extraction - works for most APIs (OpenAI, qwen, etc.)
    const content = data?.choices?.[0]?.message?.content
      || data?.choices?.[0]?.text
      || data?.output_text
      || data?.content
      || null

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
        return errorResponse(set, 413, 'FILE_TOO_LARGE', 'File size exceeds 50MB limit')
      }

      const ext = getExtension(fileInfo.fileName, fileInfo.mimeType)
      if (!SUPPORTED_EXTENSIONS.includes(ext)) {
        return errorResponse(set, 400, 'UNSUPPORTED_FILE_TYPE', 'Supported file types are .docx, .md, .xlsx, and .pdf')
      }

      if (projectId) {
        const access = await assertProjectAccess(user, projectId)
        if (!access.ok) {
          return errorResponse(set, access.status, access.code, access.message)
        }
      }

      // Check LLM config
      const llmConfig = await prisma.lLMConfig.findFirst()
      if (!llmConfig) {
        return errorResponse(set, 500, 'LLM_NOT_CONFIGURED', '請先到「AI 設定」頁面配置 API Key 和模型')
      }

      const isPdfFile = ext === '.pdf'
      let parsedText = ''

      // For PDFs, we use image-based analysis (converted to images)
      // For other files, extract text first
      if (!isPdfFile) {
        parsedText = await parseDocument(fileInfo, ext)
        if (!parsedText.trim()) {
          return errorResponse(set, 422, 'PARSE_EMPTY', 'Document parsed successfully but no text content was found')
        }
      }

      // For PDFs, fileBuffer is passed to trigger image conversion
      // For other files, pass parsedText only
      const llmResult = await analyzeDocumentWithLLM(
        fileInfo.fileName,
        parsedText,
        isPdfFile ? fileInfo.buffer : undefined,
        isPdfFile ? fileInfo.mimeType : undefined,
        isPdfFile
      )
      const llmOutput = llmResult.raw ?? ''

      // If LLM failed, return the error
      if (llmResult.error) {
        return {
          success: false,
          error: {
            code: 'LLM_FAILED',
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

  // Batch upload and parse multiple documents
  .post('/batch-parse', async ({ body, set, user }) => {
    if (!user) {
      return errorResponse(set, 401, 'UNAUTHORIZED', 'Authentication required')
    }

    // body can be either parsed by Elysia (array of files) or raw
    let files: any[] = []
    let projectId = ''

    if (Array.isArray(body)) {
      // Elysia parsed it as array
      files = body
    } else if (body && typeof body === 'object') {
      // Check if body has files array
      const b = body as any
      if (Array.isArray(b.files)) {
        files = b.files
      } else if (b.files) {
        files = [b.files]
      }
      projectId = b.projectId || ''
    }

    if (files.length === 0) {
      return errorResponse(set, 400, 'VALIDATION_ERROR', 'files array is required')
    }

    if (files.length > 20) {
      return errorResponse(set, 400, 'VALIDATION_ERROR', 'Maximum 20 files per batch')
    }

    if (projectId) {
      const access = await assertProjectAccess(user, projectId)
      if (!access.ok) {
        return errorResponse(set, access.status, access.code, access.message)
      }
    }

    const results: any[] = []
    let wikiPagesCreated = 0

    for (const file of files) {
      try {
        // Create fileInfo from various file formats
        let fileInfo: UploadedFileInfo

        if (file && typeof file === 'object' && 'buffer' in file) {
          // Our custom format
          fileInfo = {
            fileName: (file as any).filename || (file as any).name || 'unknown',
            mimeType: (file as any).type || 'application/octet-stream',
            fileSize: (file as any).buffer?.length || 0,
            buffer: (file as any).buffer || Buffer.alloc(0)
          }
        } else if (file && typeof file === 'object' && 'path' in file) {
          // Elysia file format (temp file path)
          const fs = await import('fs')
          const filePath = (file as any).path
          const stats = fs.statSync(filePath)
          fileInfo = {
            fileName: (file as any).name || (file as any).filename || 'unknown',
            mimeType: (file as any).type || 'application/octet-stream',
            fileSize: stats.size,
            buffer: fs.readFileSync(filePath)
          }
        } else if (file && typeof file === 'object' && 'arrayBuffer' in file) {
          // Browser File/Blob format
          const arrayBuffer = await (file as any).arrayBuffer()
          fileInfo = {
            fileName: (file as any).name || (file as any).filename || 'unknown',
            mimeType: (file as any).type || 'application/octet-stream',
            fileSize: (file as any).size || arrayBuffer.byteLength,
            buffer: Buffer.from(arrayBuffer)
          }
        } else {
          throw new Error('Invalid file format')
        }

        if (fileInfo.fileSize > MAX_FILE_SIZE) {
          results.push({
            name: fileInfo.fileName,
            success: false,
            error: 'File size exceeds 50MB limit'
          })
          continue
        }

        const ext = getExtension(fileInfo.fileName, fileInfo.mimeType)
        if (!SUPPORTED_EXTENSIONS.includes(ext)) {
          results.push({
            name: fileInfo.fileName,
            success: false,
            error: `Unsupported file type: ${ext}`
          })
          continue
        }

        // Check LLM config
        const llmConfig = await prisma.lLMConfig.findFirst()
        if (!llmConfig) {
          results.push({
            name: fileInfo.fileName,
            success: false,
            error: '請先到「AI 設定」頁面配置 API Key'
          })
          continue
        }

        const isPdfFile = ext === '.pdf'
        let parsedText = ''

        // For PDFs, we use image-based analysis (converted to images)
        // For other files, extract text first
        if (!isPdfFile) {
          parsedText = await parseDocument(fileInfo, ext)
          if (!parsedText.trim()) {
            results.push({
              name: fileInfo.fileName,
              success: false,
              error: 'No text content found in document'
            })
            continue
          }
        }

        // For PDFs, fileBuffer is passed to trigger image conversion
        // For other files, pass parsedText only
        const llmResult = await analyzeDocumentWithLLM(
          fileInfo.fileName,
          parsedText,
          isPdfFile ? fileInfo.buffer : undefined,
          isPdfFile ? fileInfo.mimeType : undefined,
          isPdfFile
        )
        const llmOutput = llmResult.raw ?? ''

        if (llmResult.error) {
          results.push({
            name: fileInfo.fileName,
            success: false,
            error: llmResult.error
          })
          continue
        }

        const structured = parseLLMJson(llmOutput)
        const title = (structured?.title || `${path.basename(fileInfo.fileName, ext)} 文件解析`).slice(0, 200)
        const tags = Array.isArray(structured?.tags)
          ? Array.from(new Set([...(structured?.tags || []), 'ai-parsed', ext.slice(1)]))
          : ['ai-parsed', ext.slice(1)]
        const wikiContent = buildFallbackWikiContent(fileInfo.fileName, parsedText, llmOutput, structured)

        let wikiPage = null
        let attachment = null
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
          wikiPagesCreated++

          // Also save the file as an attachment
          try {
            const fs = await import('fs')
            const path = await import('path')
            const { v4: uuidv4 } = await import('uuid')
            const UPLOAD_DIR = process.env.UPLOAD_DIR || '/app/uploads'

            const ext = path.extname(fileInfo.fileName)
            const storedFilename = `${uuidv4()}${ext}`
            const storedPath = path.join(UPLOAD_DIR, storedFilename)

            // Ensure upload directory exists
            if (!fs.existsSync(UPLOAD_DIR)) {
              fs.mkdirSync(UPLOAD_DIR, { recursive: true })
            }

            // Write file to disk
            fs.writeFileSync(storedPath, fileInfo.buffer)

            // Create attachment record
            attachment = await prisma.attachment.create({
              data: {
                entityType: 'wiki',
                entityId: wikiPage.id,
                filename: fileInfo.fileName,
                storedPath: storedFilename,
                mimeType: fileInfo.mimeType,
                fileSize: fileInfo.fileSize,
                uploadedById: user.id,
                projectId
              }
            })
          } catch (attachmentError) {
            console.error('Failed to create attachment:', attachmentError)
            // Don't fail the whole operation if attachment creation fails
          }
        }

        results.push({
          name: fileInfo.fileName,
          success: true,
          type: ext,
          size: fileInfo.fileSize,
          wikiPage,
          attachment
        })
      } catch (error) {
        console.error('Batch parse error:', error)
        const fileName = (file as any)?.name || (file as any)?.filename || 'unknown'
        results.push({
          name: fileName,
          success: false,
          error: `${fileName}: ${error instanceof Error ? error.message : 'Processing failed'}`
        })
      }
    }

    return {
      success: true,
      total: files.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      wikiPagesCreated,
      results
    }
  })

export { documentRoutes }
export default documentRoutes
