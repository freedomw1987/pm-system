/**
 * Wiki search integration tests — US-8.6, US-10.3
 *
 * 覆蓋 chat.ts 嘅 Wiki search 功能:
 *   - Wiki tool labels and event structure
 *   - SSE encoding for wiki search results
 *   - Search result metadata structure
 */

import { describe, expect, mock, test } from 'bun:test'

// Mock prisma for wiki search
mock.module('../utils/prisma', () => ({
  prisma: {
    wikiPage: {
      findMany: mock(() => Promise.resolve([])),
      findFirst: mock(() => Promise.resolve(null)),
    },
    project: { findUnique: mock(() => ({ id: 'proj-1', name: 'Test' })) },
    projectMember: { findFirst: mock(() => ({ id: 'pm-1' })) },
  },
}))

import { encodeSSEData, toolActivityEvent } from './chat'

// ─── Wiki search event structure ───────────────────────────────────────────────

describe('Wiki search tool events (US-8.6, US-10.3)', () => {
  describe('search_wiki started event', () => {
    test('captures query in label', () => {
      const ev = toolActivityEvent({
        id: 'a', model: 'gpt-4o', status: 'started', toolName: 'search_wiki',
        args: { projectId: 'proj-1', query: '專案管理' }
      })
      expect(ev.tool_activity.label).toContain('專案管理')
      expect(ev.tool_activity.toolName).toBe('search_wiki')
    })

    test('handles query without search term', () => {
      const ev = toolActivityEvent({
        id: 'a', model: 'gpt-4o', status: 'started', toolName: 'search_wiki',
        args: { projectId: 'proj-1' }
      })
      expect(ev.tool_activity.label).toBe('搜尋 Wiki')
      expect(ev.tool_activity.toolName).toBe('search_wiki')
    })

    test('includes project context', () => {
      const ev = toolActivityEvent({
        id: 'a', model: 'gpt-4o', status: 'started', toolName: 'search_wiki',
        args: { projectId: 'proj-1', query: 'API' }
      })
      expect(ev.id).toBe('a')
      expect(ev.model).toBe('gpt-4o')
    })
  })

  describe('search_wiki completed event', () => {
    test('captures result count', () => {
      const ev = toolActivityEvent({
        id: 'a', model: 'gpt-4o', status: 'completed', toolName: 'search_wiki',
        result: { count: 5, results: [{}, {}, {}, {}, {}] }
      })
      expect(ev.tool_activity.status).toBe('completed')
      expect(ev.tool_activity.resultCount).toBe(5)
    })

    test('handles empty results', () => {
      const ev = toolActivityEvent({
        id: 'a', model: 'gpt-4o', status: 'completed', toolName: 'search_wiki',
        result: { count: 0, results: [] }
      })
      expect(ev.tool_activity.resultCount).toBe(0)
    })
  })

  describe('search_wiki failed event', () => {
    test('surfaces missing projectId error', () => {
      const ev = toolActivityEvent({
        id: 'a', model: 'gpt-4o', status: 'failed', toolName: 'search_wiki',
        result: { error: 'projectId is required — 請先選擇一個項目或在對話中指定項目 ID' }
      })
      expect(ev.tool_activity.status).toBe('failed')
      expect(ev.tool_activity.error).toContain('projectId')
    })

    test('surfaces missing query error', () => {
      const ev = toolActivityEvent({
        id: 'a', model: 'gpt-4o', status: 'failed', toolName: 'search_wiki',
        result: { error: 'query is required — 請提供要搜尋的 Wiki 關鍵字' }
      })
      expect(ev.tool_activity.error).toContain('query')
    })
  })
})

// ─── Wiki search SSE encoding ──────────────────────────────────────────────────

describe('Wiki search SSE encoding (US-8.6, US-10.3)', () => {
  test('encodes search result with multiple pages', () => {
    const payload = {
      query: '專案管理',
      count: 2,
      results: [
        { id: 'wiki-1', title: '專案管理指南', tags: ['管理'], score: 10, snippet: '甘特圖和里程碑...', updatedAt: '2026-01-01' },
        { id: 'wiki-2', title: '專案流程', tags: ['管理'], score: 5, snippet: '敏捷開發流程...', updatedAt: '2026-02-01' },
      ],
      message: '找到 2 篇相關 Wiki 頁面'
    }
    const encoded = encodeSSEData(payload)
    expect(encoded).toContain('data: ')
    expect(encoded).toContain('專案管理')
    expect(encoded).toContain('"count":2')
    expect(encoded).toEndWith('\n\n')
  })

  test('encodes empty search result', () => {
    const payload = {
      query: '不存在的關鍵詞',
      count: 0,
      results: [],
      message: '找不到包含「不存在的關鍵詞」的 Wiki 頁面'
    }
    const encoded = encodeSSEData(payload)
    expect(encoded).toContain('"count":0')
    expect(encoded).toContain('不存在的關鍵詞')
  })

  test('includes all required result fields', () => {
    const payload = {
      query: 'API',
      count: 1,
      results: [{
        id: 'wiki-3',
        title: 'API 文件',
        tags: ['技術', 'API'],
        score: 8,
        snippet: 'RESTful API 文件...',
        updatedAt: '2026-03-01T00:00:00.000Z'
      }],
      message: '找到 1 篇相關 Wiki 頁面'
    }
    const encoded = encodeSSEData(payload)
    const parsed = JSON.parse(encoded.replace(/^data: /, '').trim())

    expect(parsed.results[0]).toHaveProperty('id')
    expect(parsed.results[0]).toHaveProperty('title')
    expect(parsed.results[0]).toHaveProperty('tags')
    expect(parsed.results[0]).toHaveProperty('score')
    expect(parsed.results[0]).toHaveProperty('snippet')
    expect(parsed.results[0]).toHaveProperty('updatedAt')
  })
})