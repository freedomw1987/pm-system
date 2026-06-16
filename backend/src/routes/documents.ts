import { Elysia } from 'elysia'
import { prisma } from '../utils/prisma'
import { findExistingWikiPage } from '../utils/wiki-dedup'
import * as fs from 'fs'
import * as path from 'path'
import * as mammoth from 'mammoth'
import ExcelJS from 'exceljs'
import { $ } from 'bun'
import { randomUUID } from 'crypto'

const MAX_FILE_SIZE = 50 * 1024 * 1024
// Sprint 21 US-21.1: add .doc (legacy Word), .xls (legacy Excel), .txt (plain text)
const SUPPORTED_EXTENSIONS = ['.docx', '.md', '.xlsx', '.pdf', '.doc', '.xls', '.txt']
const MAX_PROMPT_TEXT_LENGTH = 60_000

/**
 * Sprint 21 US-21.4 hotfix: LLM call 嘅 explicit timeout。
 *
 * 點解需要:
 *   - Bun.fetch 默認 5 分鐘 timeout,reject 之後會 throw AbortError
 *   - 如果 timeout 喺 nginx \`proxy_read_timeout\` (600s) 之後 trigger,
 *     nginx 會見到 upstream 提前 close,response chunk 寫唔切尾 marker
 *   - browser fetch throw \`upstream prematurely closed\` 之後無完整 body
 *   - 對 user: 個 file 永遠 hanging,UI 唔知 fail 咗
 *
 * 設 60s (1 分鐘):
 *   - 短過 nginx proxy_read_timeout 600s
 *   - LLM call 通常 5-30s,60s 已經超寬
 *   - 對 LLM server 死 / 唔存在 model 嘅情況(真實 cause),user 1 分鐘
 *     內就見到 error 結果,backend 寫 DB 仲可以 emit file:error event
 *   - 短過一般 user 嘅耐心(2-3 分鐘),user 唔會 refresh 然後見到
 *     'upstream prematurely closed'
 *   - 環境變數可 override: \`LLM_TIMEOUT_MS\` (e.g. 180000 for slow model)
 *
 * Trigger scenario: \`openai/gpt-5.5\` (fake model name) 之後 — 之前
 * 4 分鐘 timeout 都仲未返,user 28 秒就 refresh browser → controller
 * closed → backend safeSend 永遠 silent drop error。1 分鐘 timeout
 * 之後 backend 寫 error result,user 仲喺度等嘅 session 收到 event。
 */
const LLM_TIMEOUT_MS = Math.max(10_000, parseInt(process.env.LLM_TIMEOUT_MS || '60000', 10))

/**
 * Sprint 21: 批次上傳 queue 嘅並發上限。
 * 設 3 嘅原因:
 *   - 大多數 LLM provider (OpenAI / Claude / Qwen) 都有限速 RPM/TPM
 *   - 太高並發容易觸發 429
 *   - 3 個算 sweet spot:同時間有 progress feedback,但又唔會撞 rate limit
 *   - 環境變數可 override(用嚟畀企業 LLM 部署調高)
 */
const BATCH_CONCURRENCY = Math.max(1, parseInt(process.env.DOC_BATCH_CONCURRENCY || '3', 10))

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
    'text/plain': '.txt',
    'application/msword': '.doc',
    'application/vnd.ms-word': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.ms-excel': '.xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
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
  if (ext === '.md' || ext === '.txt') {
    return fileInfo.buffer.toString('utf-8')
  }

  if (ext === '.docx') {
    const result = await mammoth.extractRawText({ buffer: fileInfo.buffer })
    const warnings = result.messages?.map((m: any) => m.message).filter(Boolean) || []
    return warnings.length > 0
      ? `${result.value}\n\n[解析警告]\n${warnings.map((w: string) => `- ${w}`).join('\n')}`
      : result.value
  }

  if (ext === '.doc') {
    // Sprint 21 US-21.1: legacy .doc (Word 97-2003) via `antiword` native binary.
    // Why not SheetJS xlsx? — npm `xlsx` is permanently stuck at 0.18.5 (Prototype
    // Pollution + ReDoS, see REGRESSION-GUARD.md). Native `antiword` is CVE-free,
    // Alpine has the package, no npm audit failure.
    // wvText (from `wv` package) is a fallback in case antiword's Word 6/95
    // dialect detection fails on older .doc variants.
    // Hotfix US-21.1.1: replaced catdoc with wvText — catdoc is NOT in Alpine
    // official repo.
    const tmpPath = `/tmp/wiki_doc_${Date.now()}_${Math.random().toString(36).slice(2)}.doc`
    try {
      await fs.promises.writeFile(tmpPath, fileInfo.buffer)
      let text = ''
      try {
        const proc = await $`antiword -m UTF-8.txt ${tmpPath}`.text()
        text = proc
      } catch (antiwordErr) {
        console.log('[Document Parse] antiword failed, falling back to wvText:', antiwordErr)
        // wvText outputs to stdout by default; -c flag for charset
        const proc = await $`wvText ${tmpPath}`.text()
        text = proc
      }
      const body = (text || '').trim()
      if (!body) {
        throw new Error('legacy .doc 文件解析後為空,請用 .docx 重試')
      }
      return body
    } catch (e: any) {
      throw new Error(`legacy .doc 解析失敗 (${e?.message || 'unknown'}):請用 .docx 重試`)
    } finally {
      await fs.promises.unlink(tmpPath).catch(() => {})
    }
  }

  if (ext === '.xlsx') {
    // exceljs replaces xlsx (TD-012: xlsx 0.18.5 has Prototype Pollution + ReDoS CVEs)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(fileInfo.buffer)
    const sheetTexts: string[] = []

    workbook.eachSheet((worksheet, sheetId) => {
      const rows: string[] = []
      worksheet.eachRow({ includeEmpty: false }, (row) => {
        const cells: string[] = []
        row.eachCell({ includeEmpty: false }, (cell) => {
          // Cast cell values to string for uniform CSV output
          const v = cell.value
          let text: string
          if (v === null || v === undefined) {
            text = ''
          } else if (typeof v === 'object') {
            // exceljs formula/rich-text/complex objects → string
            text = String((v as any).result ?? (v as any).text ?? (v as any).richText?.map((r: any) => r.text).join('') ?? '')
          } else {
            text = String(v)
          }
          // Escape CSV: wrap in quotes if contains comma/quote/newline
          if (/[",\n]/.test(text)) {
            text = `"${text.replace(/"/g, '""')}"`
          }
          cells.push(text)
        })
        if (cells.length > 0) rows.push(cells.join(','))
      })
      if (rows.length > 0) {
        sheetTexts.push(`## Sheet: ${worksheet.name} (id=${sheetId})\n${rows.join('\n')}`)
      }
    })

    return sheetTexts.join('\n\n')
  }

  if (ext === '.xls') {
    // Sprint 21 US-21.1: legacy .xls (Excel 97-2003 BIFF8) via `ssconvert`
    // (part of the `gnumeric` package, available in Alpine via apk).
    // Hotfix US-21.1.1: replaced xls2csv with ssconvert directly — xls2csv is
    // NOT in Alpine official repo. Why not SheetJS xlsx? — npm `xlsx` is
    // permanently 0.18.5 (CVE-2023-30533 Prototype Pollution +
    // CVE-2024-22363 ReDoS, see REGRESSION-GUARD.md). Native binary path
    // is CVE-free.
    // ssconvert outputs the active sheet to a single file; we want all
    // sheets, so we export to xlsx first (which preserves all sheets),
    // then re-parse via exceljs. This adds a step but ensures full coverage.
    // For the simpler "all-sheets concatenated as CSV" case, use --export-type
    // with Gnumeric_stf:stf_csv. We use the second approach here.
    const tmpPath = `/tmp/wiki_xls_${Date.now()}_${Math.random().toString(36).slice(2)}.xls`
    try {
      await fs.promises.writeFile(tmpPath, fileInfo.buffer)
      // Export all sheets as a single CSV file. ssconvert's stf_csv format
      // concatenates sheets with a blank line separator, similar to xls2csv.
      const outPath = `/tmp/wiki_xls_out_${Date.now()}.csv`
      try {
        await $`ssconvert --export-type=Gnumeric_stf:stf_csv -O 'separator=,' ${tmpPath} ${outPath}`.text()
        const csv = await fs.promises.readFile(outPath, 'utf-8')
        const body = (csv || '').trim()
        if (!body) {
          throw new Error('legacy .xls 文件解析後為空,請用 .xlsx 重試')
        }
        return `## Sheet (legacy xls)\n${body}`
      } finally {
        await fs.promises.unlink(outPath).catch(() => {})
      }
    } catch (e: any) {
      throw new Error(`legacy .xls 解析失敗 (${e?.message || 'unknown'}):請用 .xlsx 重試`)
    } finally {
      await fs.promises.unlink(tmpPath).catch(() => {})
    }
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
 * 處理單個 file,畀 batch endpoint 用。永遠唔 throw,失敗會返 success:false。
 * Sprint 21 US-21.4: 抽出嚟令 batch streaming endpoint 邏輯保持線性。
 */
async function processSingleFileForBatch(
  file: any,
  projectId: string,
  userId: string
): Promise<{
  name: string
  success: boolean
  type?: string
  size?: number
  wikiPage?: any
  existingPage?: any
  duplicate?: boolean
  attachment?: any
  error?: string
}> {
  const t0 = Date.now()
  const fileLabel = file?.name || file?.filename || 'unknown'
  console.log(`[batch-parse] processFile start: ${fileLabel}`)
  let fileInfo: UploadedFileInfo
  try {
    fileInfo = await normalizeUploadedFile(file)
  } catch (e: any) {
    return {
      name: file?.name || file?.filename || 'unknown',
      success: false,
      error: e?.message || 'Invalid file format'
    }
  }

  if (fileInfo.fileSize > MAX_FILE_SIZE) {
    return {
      name: fileInfo.fileName,
      success: false,
      error: 'File size exceeds 50MB limit'
    }
  }

  const ext = getExtension(fileInfo.fileName, fileInfo.mimeType)
  if (!SUPPORTED_EXTENSIONS.includes(ext)) {
    return {
      name: fileInfo.fileName,
      success: false,
      error: `Unsupported file type: ${ext || '(no extension)'}`
    }
  }

  const llmConfig = await prisma.lLMConfig.findFirst()
  if (!llmConfig) {
    return {
      name: fileInfo.fileName,
      success: false,
      error: '請先到「AI 設定」頁面配置 API Key'
    }
  }

  const isPdfFile = ext === '.pdf'
  let parsedText = ''
  if (!isPdfFile) {
    try {
      parsedText = await parseDocument(fileInfo, ext)
    } catch (e: any) {
      return {
        name: fileInfo.fileName,
        success: false,
        type: ext,
        size: fileInfo.fileSize,
        error: `解析失敗: ${e?.message || 'unknown'}`
      }
    }
    if (!parsedText.trim()) {
      return {
        name: fileInfo.fileName,
        success: false,
        type: ext,
        size: fileInfo.fileSize,
        error: 'No text content found in document'
      }
    }
  }

  const llmT0 = Date.now()
  console.log(`[batch-parse] LLM call start: ${fileInfo.fileName} (${isPdfFile ? 'pdf' : 'text'}, ${(fileInfo.fileSize / 1024).toFixed(1)}KB)`)
  const llmResult = await analyzeDocumentWithLLM(
    fileInfo.fileName,
    parsedText,
    isPdfFile ? fileInfo.buffer : undefined,
    isPdfFile ? fileInfo.mimeType : undefined,
    isPdfFile
  )
  const llmElapsed = ((Date.now() - llmT0) / 1000).toFixed(1)
  console.log(`[batch-parse] LLM call done in ${llmElapsed}s: ${fileInfo.fileName} ${llmResult.error ? `ERROR="${llmResult.error}"` : `OK (${llmResult.raw?.length || 0} chars)`}`)
  const llmOutput = llmResult.raw ?? ''
  if (llmResult.error) {
    return {
      name: fileInfo.fileName,
      success: false,
      type: ext,
      size: fileInfo.fileSize,
      error: llmResult.error
    }
  }

  const structured = parseLLMJson(llmOutput)
  const title = (structured?.title || `${path.basename(fileInfo.fileName, ext)} 文件解析`).slice(0, 200)
  const tags = Array.isArray(structured?.tags)
    ? Array.from(new Set([...(structured?.tags || []), 'ai-parsed', ext.slice(1)]))
    : ['ai-parsed', ext.slice(1)]
  const wikiContent = buildFallbackWikiContent(fileInfo.fileName, parsedText, llmOutput, structured)

  // Sprint 21 US-21.3: detect duplicate within same project BEFORE creating.
  let existingPage = null
  if (projectId) {
    existingPage = await findExistingWikiPage(projectId, title)
  }

  let wikiPage = null
  let attachment = null
  if (projectId) {
    if (existingPage) {
      // Skip creation — frontend will offer "更新此頁" button.
      wikiPage = null
    } else {
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
          createdById: userId
        },
        include: {
          createdBy: { select: { id: true, name: true } },
          project: { select: { id: true, name: true } }
        }
      })

      attachment = await saveFileAsWikiAttachment(fileInfo, wikiPage.id, projectId, userId)
    }
  }

  return {
    name: fileInfo.fileName,
    success: true,
    type: ext,
    size: fileInfo.fileSize,
    wikiPage,
    existingPage,
    duplicate: !!existingPage,
    attachment,
    // Sprint 21 US-21.4: 帶埋 LLM analysis + parsed text preview 返出去,
    // 畀 frontend 嘅「更新同名 wiki 頁」按鈕可以拎到內容去 PUT 落 wiki
    analysis: structured,
    parsedTextPreview: parsedText ? truncateText(parsedText, 2_000) : undefined
  }
}

/**
 * Concurrency-limited runner:同時間最多 BATCH_CONCURRENCY 個 worker,
 * 完成一個就即刻 pull 新嘅入嚟(行內 worker pool)。
 * - 用 onFileDone 通知 caller(畀 streaming endpoint emit SSE)
 * - 永遠 resolve,個別 file 嘅錯誤已經喺 processSingleFileForBatch 內部 swallow 咗
 */
async function processBatchWithConcurrency(
  files: any[],
  projectId: string,
  userId: string,
  onFileDone: (
    result: Awaited<ReturnType<typeof processSingleFileForBatch>>,
    index: number
  ) => void | Promise<void>
): Promise<void> {
  const total = files.length
  let nextIndex = 0
  const workers: Promise<void>[] = []

  for (let w = 0; w < Math.min(BATCH_CONCURRENCY, total); w++) {
    workers.push((async () => {
      while (true) {
        const myIndex = nextIndex++
        if (myIndex >= total) return
        const file = files[myIndex]
        const result = await processSingleFileForBatch(file, projectId, userId)
        await onFileDone(result, myIndex)
      }
    })())
  }

  await Promise.all(workers)
}

function sseEncode(data: unknown): string {
  return `data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`
}

/**
 * Safe wrapper for controller.enqueue — silently drop 已經 closed 嘅 controller
 *
 * Race condition 場景:
 *   - browser fetch 個 SSE stream 然後 user 取消 / 關 tab / refresh
 *   - 個 connection close 咗,underlying ReadableStream 嘅 controller
 *     自動 closed
 *   - 但 server 嗰邊 worker 仲喺度跑緊,佢嘗試 `send({...})` 就會
 *     throw \`TypeError: Invalid state: Controller is already closed\`
 *   - 個 throw 會 reject worker promise → Promise.all reject →
 *     catch block 跑 → catch block 又試 send error event → 又 throw
 *   - 結果: log 充滿 spurious error,user 體驗反而受影響
 *
 * 修法: \`safeSend\` 自動 try/catch,controller closed 嗰陣 silently
 * 吞咗 throw,worker 繼續完成 file processing。
 *
 * 注意: \`controller.error()\` 唔好 call — 已經 closed 嘅 controller
 * 再 error 會 throw,我哋嘅目標係 quietly 放棄 send 而已。
 */
function safeSend(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  payload: unknown
): void {
  try {
    controller.enqueue(encoder.encode(sseEncode(payload)))
  } catch (err: any) {
    // Controller closed (browser disconnect, network reset, etc.)
    // 唔好 throw,worker 完成 file processing 仲可以寫入 DB
    // (frontend 已經唔再 listening,event 丟咗就算)
    if (err?.message?.includes('Controller is already closed') ||
        err?.message?.includes('Invalid state')) {
      // 加 log 知道係邊個 payload 撞上 closed controller — 對 debug
      // 'upstream prematurely closed' 好有用
      const payloadType = (typeof payload === 'object' && payload && 'type' in payload)
        ? (payload as any).type
        : 'unknown'
      console.warn(`[safeSend] controller closed when sending type=${payloadType} — silent drop`)
      return  // silent — 預期行為
    }
    // 其他 error log 出嚟 + 仍然 throw
    console.warn('[safeSend] non-closed-controller error:', err?.message)
    throw err
  }
}

/**
 * 從 Elysia / FormData 嘅 file object 抽出標準 UploadedFileInfo
 * (從原本 inline 喺 batch-parse 嘅 code 抽出,畀 streaming endpoint 同
 *  helper 共用)
 */
async function normalizeUploadedFile(file: any): Promise<UploadedFileInfo> {
  if (file && typeof file === 'object' && 'buffer' in file) {
    return {
      fileName: file.filename || file.name || 'unknown',
      mimeType: file.type || 'application/octet-stream',
      fileSize: file.buffer?.length || 0,
      buffer: file.buffer || Buffer.alloc(0)
    }
  }
  if (file && typeof file === 'object' && 'path' in file) {
    const filePath = file.path
    const stats = fs.statSync(filePath)
    return {
      fileName: file.name || file.filename || 'unknown',
      mimeType: file.type || 'application/octet-stream',
      fileSize: stats.size,
      buffer: fs.readFileSync(filePath)
    }
  }
  if (file && typeof file === 'object' && 'arrayBuffer' in file) {
    const arrayBuffer = await file.arrayBuffer()
    return {
      fileName: file.name || file.filename || 'unknown',
      mimeType: file.type || 'application/octet-stream',
      fileSize: typeof file.size === 'number' ? file.size : arrayBuffer.byteLength,
      buffer: Buffer.from(arrayBuffer)
    }
  }
  throw new Error('Invalid file format')
}

/**
 * 把 file 落 disk 並且 prisma.attachment.create 入 wiki entity
 * (從原本 batch-parse 嘅 try/catch 抽出,失敗唔影響 wiki page create)
 */
async function saveFileAsWikiAttachment(
  fileInfo: UploadedFileInfo,
  wikiPageId: string,
  projectId: string,
  userId: string
) {
  try {
    const storedFilename = `${randomUUID()}${path.extname(fileInfo.fileName)}`
    const storedPath = path.join(process.env.UPLOAD_DIR || '/app/uploads', storedFilename)
    if (!fs.existsSync(process.env.UPLOAD_DIR || '/app/uploads')) {
      fs.mkdirSync(process.env.UPLOAD_DIR || '/app/uploads', { recursive: true })
    }
    fs.writeFileSync(storedPath, fileInfo.buffer)
    return await prisma.attachment.create({
      data: {
        entityType: 'wiki',
        entityId: wikiPageId,
        filename: fileInfo.fileName,
        storedPath: storedFilename,
        mimeType: fileInfo.mimeType,
        fileSize: fileInfo.fileSize,
        uploadedById: userId,
        projectId
      }
    })
  } catch (err) {
    console.error('saveFileAsWikiAttachment failed:', err)
    return null
  }
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
      }),
      // Sprint 21 US-21.4 hotfix: explicit timeout 短過 nginx
      // proxy_read_timeout,避免 upstream prematurely closed
      signal: AbortSignal.timeout(LLM_TIMEOUT_MS)
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
      }),
      // Sprint 21 US-21.4 hotfix: explicit timeout 短過 nginx
      // proxy_read_timeout,避免 upstream prematurely closed
      signal: AbortSignal.timeout(LLM_TIMEOUT_MS)
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

    // Sprint 21 US-21.3: detect duplicate within same project BEFORE creating.
    // Frontend can then prompt user to either keep the existing page or
    // re-upload with `replaceId` to update its content.
    let existingPage = null
    if (projectId) {
      existingPage = await findExistingWikiPage(projectId, title)
    }

    let wikiPage = null
    if (projectId) {
      const lastPage = await prisma.wikiPage.findFirst({
        where: { projectId },
        orderBy: { order: 'desc' },
        select: { order: true }
      })

      // If duplicate exists, return `existingPage` and DON'T auto-create.
      // Frontend decides whether to call PUT /wikis/:id to update.
      if (existingPage) {
        wikiPage = null
      } else {
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
      existingPage,
      message: existingPage
        ? '偵測到同項目內已有同名 Wiki 頁面,請確認是否要更新內容。'
        : projectId
        ? 'Document parsed, analyzed by LLM, and WikiPage created.'
        : 'Document parsed and analyzed by LLM. Provide projectId to create a WikiPage automatically.'
    }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Document parsing failed'
      return errorResponse(set, 500, 'DOCUMENT_PARSE_FAILED', message)
    }
  })

  // Batch upload and parse multiple documents
  /**
   * Sprint 21 US-21.4: 批量上傳 + 解析,**SSE 串流**返進度。
   *
   * 改動:
   *   - 移除「最多 20 個 file」硬性限制
   *   - 加 server-side concurrency pool(worker 數 = BATCH_CONCURRENCY,預設 3)
   *   - 改成 Server-Sent Events,每個 file 完成即時 emit 進度事件
   *     畀 frontend 即時 refresh,等幾十個 file 唔使呆等轉圈
   *
   * SSE 事件(JSON 入 data:):
   *   { type: 'start',     total, concurrency, fileNames }
   *   { type: 'file',      index, name, success, ... }        ← 每 file 完成
   *   { type: 'complete',  total, successful, failed, wikiPagesCreated }
   *   { type: 'error',     message }                            ← batch fatal
   */
  .post('/batch-parse', async ({ body, set, user }) => {
    if (!user) {
      return errorResponse(set, 401, 'UNAUTHORIZED', 'Authentication required')
    }

    // body can be either parsed by Elysia (array of files) or raw
    let files: any[] = []
    let projectId = ''

    if (Array.isArray(body)) {
      files = body
    } else if (body && typeof body === 'object') {
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

    if (projectId) {
      const access = await assertProjectAccess(user, projectId)
      if (!access.ok) {
        return errorResponse(set, access.status, access.code, access.message)
      }
    }

    // ── SSE 串流 setup ──────────────────────────────────────────────
    // 每個 file 處理完 emit 一個 'file' 事件,frontend 即時更新 UI。
    // 不再等全 batch 完成先 return。
    const encoder = new TextEncoder()
    const total = files.length
    const fileNames = files.map((f: any) => f?.name || f?.filename || 'unknown')

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        // Sprint 21 US-21.4 hotfix: 用 safeSend 包 controller.enqueue。
        // Browser 取消 fetch / connection reset 會令 controller closed,
        // 然後 workers 仲 send 就 throw 'Controller is already closed'。
        // safeSend silently drop 咗 D 預期嘅 closed-controller error,
        // workers 仲繼續完成 file processing(寫 DB / upload 等),
        // 唔好因為 frontend 唔再 listen 就 crash 個 batch。
        const send = (payload: unknown) => safeSend(controller, encoder, payload)

        // Sprint 21 US-21.4 hotfix: SSE heartbeat
        //
        // Root cause: 喺 'start' event 同第一個 'file' event 之間有
        // 30s+ silence(LLM call 中)。雖然 backend 仲喺度 await,
        // 但呢段 silence 期間 nginx / browser fetch 任何一層 idle
        // detector 都可能 close 個 socket → 出現
        // `net::ERR_INCOMPLETE_CHUNKED_ENCODING` + nginx
        // `upstream prematurely closed connection`。
        //
        // 修法: 每 10s emit 一個 SSE comment line `: heartbeat\n\n`,
        // 對 SSE spec 嚟講係 no-op event(frontend 唔會 dispatch),
        // 但 socket 上面持續有 bytes 流動,防止 idle timeout 同
        // chunked-encoding 結尾 marker flush 問題。
        let heartbeatTimer: ReturnType<typeof setInterval> | null = null
        const startHeartbeat = () => {
          if (heartbeatTimer) return
          heartbeatTimer = setInterval(() => {
            try {
              controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`))
            } catch (err: any) {
              // Controller closed — 停止 heartbeat,workers 仲會用
              // safeSend silent drop
              if (heartbeatTimer) {
                clearInterval(heartbeatTimer)
                heartbeatTimer = null
              }
            }
          }, 10_000)
        }
        const stopHeartbeat = () => {
          if (heartbeatTimer) {
            clearInterval(heartbeatTimer)
            heartbeatTimer = null
          }
        }

        let successful = 0
        let failed = 0
        let wikiPagesCreatedInner = 0
        const batchStart = Date.now()
        console.log(`[batch-parse] stream start: ${total} files, concurrency=${BATCH_CONCURRENCY}`)

        try {
          // 1) start 事件:總數 + 並發數 + filename list
          send({ type: 'start', total, concurrency: BATCH_CONCURRENCY, fileNames })

          // 開啟 heartbeat,直至 finally
          startHeartbeat()

          // 2) worker pool 並發處理
          await processBatchWithConcurrency(files, projectId, user.id, async (result, index) => {
            if (result.success) {
              successful++
              if (result.wikiPage) wikiPagesCreatedInner++
            } else {
              failed++
            }
            const elapsed = ((Date.now() - batchStart) / 1000).toFixed(1)
            console.log(`[batch-parse] file ${index + 1}/${total} done in ${elapsed}s: ${result.name} success=${result.success}${result.error ? ` error="${result.error}"` : ''}`)
            // 'result.type' 係 file extension 嗰個 string,同 SSE event type 撞名,
            // 改用 fileType alias 傳出去畀 frontend
            const { type: _ext, ...rest } = result
            send({ type: 'file', index, ...rest, fileType: _ext })
          })

          // 3) complete 事件:總結
          const totalElapsed = ((Date.now() - batchStart) / 1000).toFixed(1)
          console.log(`[batch-parse] all done in ${totalElapsed}s: ${successful} ok, ${failed} failed, ${wikiPagesCreatedInner} wiki pages`)
          send({
            type: 'complete',
            total,
            successful,
            failed,
            wikiPagesCreated: wikiPagesCreatedInner
          })
        } catch (err: any) {
          console.error('[batch-parse] stream error:', err)
          // 用 safeSend,避免 catch block 都 throw(可能 controller 已 closed)
          send({ type: 'error', message: err?.message || 'batch processing failed' })
        } finally {
          stopHeartbeat()
          // controller.close() 喺 finally 一定跑 — 即使有 throw,確保
          // ReadableStream 完整 close,frontend fetch reader 嘅 done
          // 會係 true,觸發 while loop 退出
          try {
            controller.close()
          } catch {
            // 已經 closed 嘅話 swallow 咗
          }
          console.log(`[batch-parse] stream closed after ${((Date.now() - batchStart) / 1000).toFixed(1)}s`)
        }
      },
      cancel(reason) {
        // Browser disconnect / fetch abort 嗰陣 runtime 會 call cancel
        // log 出嚟畀我哋知真正 cause(對比 timeout / nginx close 等)
        console.warn('[batch-parse] stream cancelled by consumer:', reason)
      }
    })

    set.headers = {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      // nginx buffering 預設開啟,會 hold 住 SSE chunks 等夠大先 flush
      // → disable 確保 frontend 即時收到 progress
      'X-Accel-Buffering': 'no',
      'Connection': 'keep-alive'
    }

    return new Response(stream, { status: 200 })
  })

export { documentRoutes }
export default documentRoutes
