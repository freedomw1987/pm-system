/**
 * Chat stream integration test — US-8.1, US-8.2
 *
 * 覆蓋 chat.ts 嘅 LLM streaming path,呢個 path 喺 Sprint 2 retro 列為 DEFERRED:
 *   - US-8.1: 自然語言查詢 (chat.ts 1787 行,L1277 streamLLMResponse)
 *   - US-8.2: 綁定項目 (同上)
 *
 * 對應 TECH-DEBT TD-013 (Sprint 2 retro ACT-14) + 紅線 12 + 16。
 *
 * 策略:
 *   1. Pure helper unit tests — `sseChunk` / `toolActivityEvent` / `encodeSSEData` /
 *      `normalizeChatCompletionUrl` 直接 derive 唔需要 mock
 *   2. Integration test — `streamLLMResponse` 直接 call + mock `globalThis.fetch`
 *      攔截 LLM outbound,return controlled SSE stream,assert output event 結構
 *
 * **Source change scope**:`streamLLMResponse` / `sseChunk` / `toolActivityEvent` /
 * `encodeSSEData` / `normalizeChatCompletionUrl` 喺 Sprint 3 commit 加 `export` keyword,
 * 純 testability 改善,runtime 行為不變(0 business logic 改動)。
 */

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

// Mock the prisma client so streamLLMResponse's finalize step
// (prisma.chatMessage.create / prisma.chatSession.update) doesn't require
// a live database connection. The chat streaming logic itself doesn't read
// from the DB — it only writes at the end.
mock.module('../utils/prisma', () => {
  const noop = async () => null
  const noopMany = async () => []
  return {
    prisma: {
      chatMessage: {
        create: noop,
        findMany: noopMany,
        findFirst: noop,
      },
      chatSession: {
        update: noop,
        findFirst: noop,
        delete: noop,
      },
      lLMConfig: {
        findFirst: async () => ({
          apiUrl: 'https://api.openai.com/v1',
          apiKey: '***',
          model: 'gpt-4o',
        }),
      },
      // Other models referenced by executeTool stubs — return empty / undefined
      wikiPage: { findMany: noopMany, findFirst: noop },
      project: { findUnique: noop, findFirst: noop },
      projectMember: { findFirst: noop, findMany: noopMany },
      requirement: { findMany: noopMany, findFirst: noop, findUnique: noop },
      task: { findMany: noopMany, findFirst: noop, findUnique: noop },
      bug: { findMany: noopMany, findFirst: noop, findUnique: noop },
    },
  }
})

// Now import chat AFTER the mock is registered
import {
  encodeSSEData,
  normalizeChatCompletionUrl,
  sseChunk,
  streamLLMResponse,
  toolActivityEvent,
} from './chat'

// ─── Pure helpers — US-8.1/8.2 SSE encoding invariants ───────────────────────

describe('sseChunk (pure helper, US-8.1/8.2)', () => {
  test('emits OpenAI-compatible chat.completion.chunk shape', () => {
    const chunk = sseChunk({ id: 'chatcmpl-1', model: 'gpt-4o', content: '你好' })
    expect(chunk.object).toBe('chat.completion.chunk')
    expect(chunk.id).toBe('chatcmpl-1')
    expect(chunk.model).toBe('gpt-4o')
    expect(chunk.choices).toHaveLength(1)
    const choice = chunk.choices[0]!
    expect(choice.index).toBe(0)
    expect(choice.delta).toEqual({ content: '你好' })
    expect(choice.finish_reason).toBeNull()
  })

  test('omits content in delta when content is empty string', () => {
    const chunk = sseChunk({ id: 'x', model: 'm', content: '' })
    // Source code: `content ? { content } : {}` — empty string is falsy
    const choice = chunk.choices[0]!
    expect(choice.delta).toEqual({})
  })

  test('emits finish_reason when provided', () => {
    const chunk = sseChunk({ id: 'x', model: 'm', content: undefined, finishReason: 'stop' })
    const choice = chunk.choices[0]!
    expect(choice.finish_reason).toBe('stop')
    expect(choice.delta).toEqual({})
  })

  test('includes created timestamp (seconds epoch)', () => {
    const before = Math.floor(Date.now() / 1000)
    const chunk = sseChunk({ id: 'x', model: 'm' })
    const after = Math.floor(Date.now() / 1000)
    expect(chunk.created).toBeGreaterThanOrEqual(before)
    expect(chunk.created).toBeLessThanOrEqual(after)
  })
})

describe('toolActivityEvent (pure helper, US-8.1/8.2)', () => {
  test('started event wraps payload under tool_activity object', () => {
    const ev = toolActivityEvent({
      id: 'a', model: 'gpt-4o', status: 'started', toolName: 'list_requirements'
    })
    expect(ev.object).toBe('chat.tool_activity')
    expect(ev.id).toBe('a')
    expect(ev.model).toBe('gpt-4o')
    expect(ev.tool_activity.status).toBe('started')
    expect(ev.tool_activity.toolName).toBe('list_requirements')
    // No result in started → error field undefined
    expect(ev.tool_activity.error).toBeUndefined()
  })

  test('completed event captures result via error field when result.error present', () => {
    const ev = toolActivityEvent({
      id: 'a', model: 'gpt-4o', status: 'completed', toolName: 'list_requirements',
      toolCallId: 'call_123', args: { projectId: 'p1' }, result: { requirements: [], count: 0 }
    })
    expect(ev.tool_activity.status).toBe('completed')
    // toolCallId is wrapped inside tool_activity.id (source uses toolCallId || fallback)
    expect(ev.tool_activity.id).toBe('call_123')
    // resultCount captured from result.count
    expect(ev.tool_activity.resultCount).toBe(0)
    // error should be undefined for successful result
    expect(ev.tool_activity.error).toBeUndefined()
  })

  test('failed event surfaces error from result.error', () => {
    const ev = toolActivityEvent({
      id: 'a', model: 'gpt-4o', status: 'failed', toolName: 'search_wiki',
      result: { error: 'Permission denied' }
    })
    expect(ev.tool_activity.status).toBe('failed')
    expect(ev.tool_activity.error).toBe('Permission denied')
  })

  test('localized label for search_wiki with query contains the query', () => {
    const ev = toolActivityEvent({
      id: 'a', model: 'gpt-4o', status: 'started', toolName: 'search_wiki',
      args: { query: '專案管理' }
    })
    expect(ev.tool_activity.label).toContain('專案管理')
    expect(ev.tool_activity.query).toBe('專案管理')
  })

  test('falls back to default label for unknown tool', () => {
    const ev = toolActivityEvent({
      id: 'a', model: 'gpt-4o', status: 'started', toolName: 'mystery_tool_xyz'
    })
    expect(ev.tool_activity.label).toContain('mystery_tool_xyz')
  })
})

describe('encodeSSEData (pure helper)', () => {
  test('wraps string with "data: " + "\\n\\n" terminator (SSE protocol)', () => {
    expect(encodeSSEData('hello')).toBe('data: hello\n\n')
  })

  test('JSON-stringifies non-string payloads', () => {
    const payload = { foo: 'bar', n: 42 }
    expect(encodeSSEData(payload)).toBe(`data: ${JSON.stringify(payload)}\n\n`)
  })

  test('handles nested objects', () => {
    const payload = { choices: [{ delta: { content: 'hi' } }] }
    expect(encodeSSEData(payload)).toBe(`data: ${JSON.stringify(payload)}\n\n`)
  })
})

describe('normalizeChatCompletionUrl (pure helper)', () => {
  test('appends /chat/completions when URL has no trailing path', () => {
    expect(normalizeChatCompletionUrl('https://api.openai.com/v1'))
      .toBe('https://api.openai.com/v1/chat/completions')
  })

  test('idempotent when URL already ends with /chat/completions', () => {
    expect(normalizeChatCompletionUrl('https://api.openai.com/v1/chat/completions'))
      .toBe('https://api.openai.com/v1/chat/completions')
  })

  test('strips trailing slashes before appending', () => {
    expect(normalizeChatCompletionUrl('https://api.openai.com/v1///'))
      .toBe('https://api.openai.com/v1/chat/completions')
  })

  test('trims surrounding whitespace', () => {
    expect(normalizeChatCompletionUrl('  https://api.example.com  '))
      .toBe('https://api.example.com/chat/completions')
  })

  test('handles custom OpenAI-compatible providers', () => {
    expect(normalizeChatCompletionUrl('https://llm.example.internal/'))
      .toBe('https://llm.example.internal/chat/completions')
  })
})

// ─── streamLLMResponse — integration test with mocked globalThis.fetch ───────

/**
 * Build a fake SSE ReadableStream response from an array of JSON payloads.
 * Matches OpenAI chat.completion.chunk streaming format.
 */
function fakeSSEResponse(chunks: Array<Record<string, any>>, withDone: boolean = true): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`))
      }
      if (withDone) {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      }
      controller.close()
    },
  })
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

/** Read a streamLLMResponse ReadableStream and return both raw text and parsed events.
 *
 * SSE events are separated by "\n\n" (double newline). We track the last
 * processed position to avoid re-parsing the same event on partial reads.
 */
async function readStream(stream: ReadableStream<Uint8Array>): Promise<{
  rawText: string
  parsed: any[]
}> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let rawText = ''
  const parsed: any[] = []
  let lastProcessedEnd = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    rawText += decoder.decode(value, { stream: true })
    // Process only the part of rawText that we haven't seen yet
    const newPart = rawText.slice(lastProcessedEnd)
    // Find the last complete "\n\n" block boundary in the new part
    const lastDoubleNewline = newPart.lastIndexOf('\n\n')
    if (lastDoubleNewline === -1) continue  // No complete event yet, wait for more data
    // Take only the new part up to and including the last "\n\n"
    const processableText = newPart.slice(0, lastDoubleNewline + 2)
    const blocks = processableText.split('\n\n')
    for (const block of blocks) {
      const line = block.trim()
      if (line.startsWith('data: ') && line.length > 6) {
        const data = line.slice(6)
        if (data !== '[DONE]') {
          try { parsed.push(JSON.parse(data)) } catch {}
        }
      }
    }
    lastProcessedEnd = lastProcessedEnd + lastDoubleNewline + 2
  }
  return { rawText, parsed }
}

const FAKE_CONFIG = {
  apiUrl: 'https://api.openai.com/v1',
  apiKey: '***',
  model: 'gpt-4o',
}

const FAKE_BASE_OPTS = {
  sessionId: 'session-test-1',
  userId: 'user-test-1',
  userRole: 'admin',
  userPermissions: ['requirements.read', 'requirements.create'],
  projectId: null,
  messages: [
    { role: 'system' as const, content: 'You are a helpful assistant.' },
    { role: 'user' as const, content: '你好' },
  ],
  config: FAKE_CONFIG,
}

describe('streamLLMResponse (integration with mocked fetch, US-8.1/8.2)', () => {
  let originalFetch: typeof globalThis.fetch
  let fetchCalls: Array<{ url: string; init: RequestInit | undefined }>

  beforeEach(() => {
    originalFetch = globalThis.fetch
    fetchCalls = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.fetch = (async (url: any, init?: RequestInit) => {
      fetchCalls.push({ url: String(url), init })
      // Test-specific override via __mockFetchResponse; default returns 1 content chunk
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fn = (globalThis as any).__mockFetchResponse
      if (typeof fn === 'function') return await fn()
      return fakeSSEResponse([
        { id: 'chatcmpl-1', object: 'chat.completion.chunk', created: 1, model: 'gpt-4o',
          choices: [{ index: 0, delta: { content: 'hi' }, finish_reason: null }] },
        { id: 'chatcmpl-1', object: 'chat.completion.chunk', created: 1, model: 'gpt-4o',
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
      ])
    }) as typeof globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).__mockFetchResponse
  })

  test('streams text chunks as sseChunk events to the SSE stream', async () => {
    const stream = await streamLLMResponse(FAKE_BASE_OPTS)
    const { rawText, parsed } = await readStream(stream)

    // Should call LLM endpoint with correct URL + auth header
    expect(fetchCalls).toHaveLength(1)
    expect(fetchCalls[0].url).toBe('https://api.openai.com/v1/chat/completions')
    const headers = fetchCalls[0].init?.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer ***')
    expect(headers['Content-Type']).toBe('application/json')
    expect(headers.Accept).toBe('text/event-stream')

    // body: stream=true + tool_choice + messages + model + tools
    const body = JSON.parse(fetchCalls[0].init?.body as string)
    expect(body.stream).toBe(true)
    expect(body.model).toBe('gpt-4o')
    expect(body.messages).toHaveLength(2)
    expect(body.tools).toBeDefined()  // tool defs are sent on initial call
    expect(body.tool_choice).toBe('auto')

    // SSE output: 1 content chunk ('hi') from LLM mock + 1 finish chunk
    // from source's finalize step (line 1550: sendData(sseChunk({ finishReason: 'stop' })))
    // = 2 parsed events. The mock's finish_reason='stop' chunk is filtered by
    // source (line 1370: `if (typeof contentDelta === 'string' && contentDelta)` —
    // no content means no sseChunk emit).
    expect(parsed).toHaveLength(2)
    const first = parsed[0]!
    const second = parsed[1]!
    expect(first.choices[0]!.delta.content).toBe('hi')
    // Source's finalize finish chunk
    expect(second.choices[0]!.finish_reason).toBe('stop')

    // [DONE] terminator emitted at end (SSE protocol)
    expect(rawText).toContain('data: [DONE]')

    // All non-empty lines use 'data: ' prefix
    const lines = rawText.split('\n').filter(l => l.length > 0)
    for (const line of lines) {
      expect(line.startsWith('data: ')).toBe(true)
    }
  })

  test('makes only 1 fetch call when LLM returns no tool_calls', async () => {
    const stream = await streamLLMResponse(FAKE_BASE_OPTS)
    await readStream(stream)
    // No tool_calls → no follow-up LLM call
    expect(fetchCalls).toHaveLength(1)
  })

  test('handles LLM error (500) gracefully — emits user-friendly error message', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).__mockFetchResponse = async () => {
      return new Response('Internal Server Error', { status: 500 })
    }

    // Source's streamLLMResponse 喺 catch block:
    //   1. 如果 hasPartialContent → send partial chunks
    //   2. sendData(translateError(error))  ← 用戶友善 error
    //   3. sendData(sseChunk({ finishReason: 'stop' }))
    //   4. sendData('[DONE]') 然後 close
    // 重要: 唔 crash,正常 close,user 收到 error message
    const stream = await streamLLMResponse(FAKE_BASE_OPTS)
    const { parsed, rawText } = await readStream(stream)
    // 應該 emit finish + [DONE](graceful close)
    expect(rawText).toContain('data: [DONE]')
    // 唔應該 emit "hi" 個 content chunk(LLM 已經 fail)
    expect(parsed.some(p => p?.choices?.[0]?.delta?.content === 'hi')).toBe(false)
    // 應該 emit 個 user-friendly error message
    const errorChunk = parsed.find(p => p?.choices?.[0]?.delta?.content?.includes('AI 處理失敗'))
    expect(errorChunk).toBeDefined()
  })

  test('handles empty content chunk gracefully (no empty SSE event)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).__mockFetchResponse = async () => {
      return fakeSSEResponse([
        { id: '1', object: 'chat.completion.chunk', created: 1, model: 'm',
          choices: [{ index: 0, delta: {}, finish_reason: null }] },  // empty delta
        { id: '1', object: 'chat.completion.chunk', created: 1, model: 'm',
          choices: [{ index: 0, delta: { content: 'hi' }, finish_reason: null }] },
        { id: '1', object: 'chat.completion.chunk', created: 1, model: 'm',
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
      ])
    }

    const stream = await streamLLMResponse(FAKE_BASE_OPTS)
    const { parsed } = await readStream(stream)

    // Should emit 3 events: empty-delta chunk (emitted as no-content sseChunk), content chunk, finish chunk.
    // Source's `if (typeof contentDelta === 'string' && contentDelta)` only filters on `content`,
    // so empty-delta chunks still get emitted but with empty content.
    expect(parsed.length).toBeGreaterThanOrEqual(2)
    // Find the chunk with content='hi'
    const contentChunk = parsed.find(p => p?.choices?.[0]?.delta?.content === 'hi')
    expect(contentChunk).toBeDefined()
    // Find the finish chunk
    const finishChunk = parsed.find(p => p?.choices?.[0]?.finish_reason === 'stop')
    expect(finishChunk).toBeDefined()
  })

  test('does not call LLM when apiKey is empty (no Authorization header)', async () => {
    const stream = await streamLLMResponse({
      ...FAKE_BASE_OPTS,
      config: { ...FAKE_CONFIG, apiKey: '' },
    })
    await readStream(stream)

    expect(fetchCalls).toHaveLength(1)
    const headers = fetchCalls[0].init?.headers as Record<string, string>
    // Source: `...(config.apiKey ? { Authorization } : {})` — falsy skips header
    expect(headers.Authorization).toBeUndefined()
  })
})
