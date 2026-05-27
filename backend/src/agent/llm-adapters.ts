/**
 * LLM Adapter System
 *
 * Provides a unified interface for different LLM providers
 * to support various API formats (Claude, OpenAI, qwen, etc.)
 */

export interface LLMConfig {
  apiUrl: string
  apiKey: string
  model: string
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | LLMContentPart[]
}

export interface LLMContentPart {
  type: 'text' | 'image' | 'image_url' | 'document'
  text?: string
  source?: {
    type: 'base64'
    media_type: string
    data: string
  }
  image_url?: {
    url: string
  }
}

export interface LLMResponse {
  content: string | null
  raw: string | null
  error?: string
}

// Prompt template for document analysis
const DOCUMENT_ANALYSIS_PROMPT = `你是一個資深項目管理文件分析助手。請分析以下文件內容，提取可直接建立為 WikiPage 的結構化知識。

請只輸出 JSON，不要包含 Markdown code fence 或額外文字，格式如下：
{
  "title": "適合作為 Wiki 頁面的標題",
  "summary": "文件摘要",
  "wikiContent": "完整 Markdown Wiki 內容，需包含重點、需求/任務/風險/待確認事項等章節",
  "tags": ["document", "ai-parsed"],
  "recommendations": ["後續建議 1", "後續建議 2"]
}`

/**
 * Base adapter interface
 */
export interface LLMAdapter {
  /** Provider name */
  name: string

  /** Check if this adapter handles the given model */
  matches(model: string): boolean

  /** Check if model supports vision/multimodal input */
  supportsVision(): boolean

  /** Check if model supports PDF input directly */
  supportsPDF(): boolean

  /** Build messages for document analysis with optional file attachment */
  buildDocumentAnalysisMessages(
    fileName: string,
    parsedText: string,
    fileBuffer?: Buffer,
    mimeType?: string
  ): { messages: LLMMessage[]; useVision: boolean }

  /** Extract content from LLM response */
  extractContent(data: any): string | null
}

/**
 * Claude Adapter
 * Supports: Claude (Anthropic)
 */
export class ClaudeAdapter implements LLMAdapter {
  name = 'Claude'

  matches(model: string): boolean {
    return model.toLowerCase().includes('claude')
  }

  supportsVision(): boolean {
    return true
  }

  supportsPDF(): boolean {
    return true
  }

  buildDocumentAnalysisMessages(
    fileName: string,
    parsedText: string,
    fileBuffer?: Buffer,
    mimeType?: string
  ): { messages: LLMMessage[]; useVision: boolean } {
    if (fileBuffer && mimeType) {
      const base64Data = fileBuffer.toString('base64')
      const ext = path.extname(fileName).toLowerCase()

      // Determine media type
      let mediaType = mimeType
      if (ext === '.pdf' || mimeType === 'application/pdf') {
        mediaType = 'application/pdf'
      } else if (mimeType.startsWith('image/png')) {
        mediaType = 'image/png'
      } else if (mimeType.startsWith('image/webp')) {
        mediaType = 'image/webp'
      } else if (mimeType.startsWith('image/gif')) {
        mediaType = 'image/gif'
      }

      // Use document type for Claude
      return {
        useVision: true,
        messages: [{
          role: 'user',
          content: [
            { type: 'text' as const, text: DOCUMENT_ANALYSIS_PROMPT },
            { type: ext === '.pdf' || mimeType === 'application/pdf' ? 'document' : 'image',
              source: { type: 'base64', media_type: mediaType, data: base64Data } }
          ]
        }]
      }
    }

    // Text-only mode
    return {
      useVision: false,
      messages: [
        { role: 'system', content: '你擅長將項目文件整理為清晰的知識庫頁面。請嚴格輸出可解析 JSON。' },
        { role: 'user', content: `${DOCUMENT_ANALYSIS_PROMPT}\n\n## 文件名稱\n${fileName}\n\n## 文件內容\n${truncateText(parsedText)}` }
      ]
    }
  }

  extractContent(data: any): string | null {
    return data?.choices?.[0]?.message?.content || null
  }
}

/**
 * OpenAI Adapter
 * Supports: GPT-4o, GPT-4 Vision, etc.
 */
export class OpenAIAdapter implements LLMAdapter {
  name = 'OpenAI'

  matches(model: string): boolean {
    const lower = model.toLowerCase()
    return lower.includes('gpt-4o') || lower.includes('gpt-4') || lower.includes('o1') || lower.includes('o3')
  }

  supportsVision(): boolean {
    return true
  }

  supportsPDF(): boolean {
    // OpenAI GPT-4o supports PDF input
    return true
  }

  buildDocumentAnalysisMessages(
    fileName: string,
    parsedText: string,
    fileBuffer?: Buffer,
    mimeType?: string
  ): { messages: LLMMessage[]; useVision: boolean } {
    if (fileBuffer && mimeType) {
      const base64Data = fileBuffer.toString('base64')
      const ext = path.extname(fileName).toLowerCase()

      // Determine media type
      let mediaType = 'image/jpeg'
      if (mimeType.startsWith('image/png')) mediaType = 'image/png'
      else if (mimeType.startsWith('image/webp')) mediaType = 'image/webp'
      else if (mimeType.startsWith('image/gif')) mediaType = 'image/gif'
      else if (ext === '.pdf' || mimeType === 'application/pdf') mediaType = 'application/pdf'

      // For PDF, use file type; for images use image_url
      const contentType = (ext === '.pdf' || mimeType === 'application/pdf') ? 'file' : 'image_url'

      if (contentType === 'file') {
        // OpenAI file type for PDF
        return {
          useVision: true,
          messages: [{
            role: 'user',
            content: [
              { type: 'text' as const, text: DOCUMENT_ANALYSIS_PROMPT },
              { type: 'file' as const, source: { type: 'base64', media_type: mediaType, data: base64Data } }
            ]
          }]
        }
      } else {
        // OpenAI image_url format
        return {
          useVision: true,
          messages: [{
            role: 'user',
            content: [
              { type: 'text' as const, text: DOCUMENT_ANALYSIS_PROMPT },
              { type: 'image_url' as const, image_url: { url: `data:${mediaType};base64,${base64Data}` } }
            ]
          }]
        }
      }
    }

    // Text-only mode
    return {
      useVision: false,
      messages: [
        { role: 'system', content: '你擅長將項目文件整理為清晰的知識庫頁面。請嚴格輸出可解析 JSON。' },
        { role: 'user', content: `${DOCUMENT_ANALYSIS_PROMPT}\n\n## 文件名稱\n${fileName}\n\n## 文件內容\n${truncateText(parsedText)}` }
      ]
    }
  }

  extractContent(data: any): string | null {
    return data?.choices?.[0]?.message?.content || null
  }
}

/**
 * Qwen/DashScope Adapter
 * Supports: qwen, tongyi, etc.
 */
export class QwenAdapter implements LLMAdapter {
  name = 'Qwen'

  matches(model: string): boolean {
    const lower = model.toLowerCase()
    return lower.includes('qwen') || lower.includes('tongyi')
  }

  supportsVision(): boolean {
    return true
  }

  supportsPDF(): boolean {
    // qwen VL models don't support PDF directly, need text extraction first
    return false
  }

  buildDocumentAnalysisMessages(
    fileName: string,
    parsedText: string,
    fileBuffer?: Buffer,
    mimeType?: string
  ): { messages: LLMMessage[]; useVision: boolean } {
    if (fileBuffer && mimeType) {
      const base64Data = fileBuffer.toString('base64')
      const ext = path.extname(fileName).toLowerCase()

      // For images, use image_url format
      if (mimeType.startsWith('image/')) {
        let mediaType = 'image/jpeg'
        if (mimeType.startsWith('image/png')) mediaType = 'image/png'
        else if (mimeType.startsWith('image/webp')) mediaType = 'image/webp'
        else if (mimeType.startsWith('image/gif')) mediaType = 'image/gif'

        return {
          useVision: true,
          messages: [{
            role: 'user',
            content: [
              { type: 'text' as const, text: DOCUMENT_ANALYSIS_PROMPT },
              { type: 'image_url' as const, image_url: { url: `data:${mediaType};base64,${base64Data}` } }
            ]
          }]
        }
      }

      // For PDF files - qwen VL may not support PDF directly
      // Fall back to text mode and let caller extract text first
      // (Caller will only pass fileBuffer if shouldUseVision is true)
    }

    // If we reach here with fileBuffer but no match above, something went wrong
    // Fall back to text mode

    // Text-only mode (fallback)
    return {
      useVision: false,
      messages: [
        { role: 'system', content: '你擅長將項目文件整理為清晰的知識庫頁面。請嚴格輸出可解析 JSON。' },
        { role: 'user', content: `${DOCUMENT_ANALYSIS_PROMPT}\n\n## 文件名稱\n${fileName}\n\n## 文件內容\n${truncateText(parsedText)}` }
      ]
    }
  }

  extractContent(data: any): string | null {
    // Try multiple formats that might be used
    return data?.choices?.[0]?.message?.content
      || data?.choices?.[0]?.text
      || data?.output_text
      || data?.content
      || null
  }
}

/**
 * Gemini Adapter
 * Supports: Google Gemini
 */
export class GeminiAdapter implements LLMAdapter {
  name = 'Gemini'

  matches(model: string): boolean {
    return model.toLowerCase().includes('gemini')
  }

  supportsVision(): boolean {
    return true
  }

  supportsPDF(): boolean {
    return true
  }

  buildDocumentAnalysisMessages(
    fileName: string,
    parsedText: string,
    fileBuffer?: Buffer,
    mimeType?: string
  ): { messages: LLMMessage[]; useVision: boolean } {
    if (fileBuffer && mimeType) {
      const base64Data = fileBuffer.toString('base64')
      const ext = path.extname(fileName).toLowerCase()

      // Determine media type
      let mediaType = 'image/jpeg'
      if (mimeType.startsWith('image/png')) mediaType = 'image/png'
      else if (mimeType.startsWith('image/webp')) mediaType = 'image/webp'
      else if (mimeType.startsWith('image/gif')) mediaType = 'image/gif'
      else if (ext === '.pdf' || mimeType === 'application/pdf') mediaType = 'application/pdf'

      // Gemini uses inline_data format
      return {
        useVision: true,
        messages: [{
          role: 'user',
          content: [
            { type: 'text' as const, text: DOCUMENT_ANALYSIS_PROMPT },
            { type: 'image' as const, source: { type: 'base64', media_type: mediaType, data: base64Data } }
          ]
        }]
      }
    }

    // Text-only mode
    return {
      useVision: false,
      messages: [
        { role: 'system', content: '你擅長將項目文件整理為清晰的知識庫頁面。請嚴格輸出可解析 JSON。' },
        { role: 'user', content: `${DOCUMENT_ANALYSIS_PROMPT}\n\n## 文件名稱\n${fileName}\n\n## 文件內容\n${truncateText(parsedText)}` }
      ]
    }
  }

  extractContent(data: any): string | null {
    return data?.candidates?.[0]?.content?.parts?.[0]?.text
      || data?.content
      || null
  }
}

/**
 * Generic Adapter (fallback for unknown providers)
 */
export class GenericAdapter implements LLMAdapter {
  name = 'Generic'

  matches(model: string): boolean {
    return true // Always matches as fallback
  }

  supportsVision(): boolean {
    return false
  }

  supportsPDF(): boolean {
    return false
  }

  buildDocumentAnalysisMessages(
    fileName: string,
    parsedText: string,
    _fileBuffer?: Buffer,
    _mimeType?: string
  ): { messages: LLMMessage[]; useVision: boolean } {
    // Always text-only for generic adapters
    return {
      useVision: false,
      messages: [
        { role: 'system', content: '你擅長將項目文件整理為清晰的知識庫頁面。請嚴格輸出可解析 JSON。' },
        { role: 'user', content: `${DOCUMENT_ANALYSIS_PROMPT}\n\n## 文件名稱\n${fileName}\n\n## 文件內容\n${truncateText(parsedText)}` }
      ]
    }
  }

  extractContent(data: any): string | null {
    return data?.choices?.[0]?.message?.content
      || data?.choices?.[0]?.text
      || data?.output_text
      || data?.content
      || null
  }
}

// All available adapters
const adapters: LLMAdapter[] = [
  new ClaudeAdapter(),
  new OpenAIAdapter(),
  new QwenAdapter(),
  new GeminiAdapter(),
  new GenericAdapter(), // Must be last as fallback
]

/**
 * Find the appropriate adapter for a model
 */
export function findAdapter(model: string): LLMAdapter {
  for (const adapter of adapters) {
    if (adapter.matches(model)) {
      return adapter
    }
  }
  return new GenericAdapter()
}

/**
 * Check if model supports vision for a given file type
 */
export function supportsVisionForFile(model: string, mimeType: string | undefined): boolean {
  const adapter = findAdapter(model)

  if (mimeType?.startsWith('image/')) {
    return adapter.supportsVision()
  }

  if (mimeType === 'application/pdf' || mimeType?.endsWith('.pdf')) {
    return adapter.supportsPDF()
  }

  return false
}

import * as path from 'path'

const MAX_PROMPT_TEXT_LENGTH = 60_000

function truncateText(text: string): string {
  if (text.length <= MAX_PROMPT_TEXT_LENGTH) return text
  return `${text.slice(0, MAX_PROMPT_TEXT_LENGTH)}\n\n[內容過長，已截斷 ${text.length - MAX_PROMPT_TEXT_LENGTH} 個字元]`
}
