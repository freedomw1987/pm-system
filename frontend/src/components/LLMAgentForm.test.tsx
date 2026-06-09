/**
 * Frontend P2 Tests — LLM/AI Agent/Wiki/Reports
 *
 * 涵蓋:
 *  - US-8.x: LLM Chat
 *  - US-9.x: Agent
 *  - US-10.x: Wiki
 *  - US-11.3: Token Report
 */

import { describe, expect, test } from 'vitest'

// ─── LLM Response Parsing ─────────────────────────────────────────────────────

describe('US-8.x: LLM Response Parsing', () => {
  test('parses SSE chunk format', () => {
    const parseSSEChunk = (data: string) => {
      const lines = data.split('\n')
      const obj: Record<string, unknown> = {}
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const jsonStr = line.slice(6)
          if (jsonStr === '[DONE]') return { done: true }
          try {
            const parsed = JSON.parse(jsonStr)
            return parsed
          } catch { /* skip */ }
        }
      }
      return obj
    }

    const chunk = parseSSEChunk('data: {"content":"Hello"}\n\n')
    expect(chunk).toHaveProperty('content')
  })

  test('detects SSE completion', () => {
    const isDone = (data: string) => data.trim() === 'data: [DONE]'
    expect(isDone('data: [DONE]\n\n')).toBe(true)
    expect(isDone('data: {"content":"Hi"}\n\n')).toBe(false)
  })
})

// ─── Agent Status ───────────────────────────────────────────────────────────────

describe('US-9.x: Agent Status', () => {
  const AGENT_STATES = ['idle', 'busy', 'error', 'paused']

  test('agent states are valid', () => {
    expect(AGENT_STATES).toContain('idle')
    expect(AGENT_STATES).toContain('busy')
    expect(AGENT_STATES).toContain('error')
    expect(AGENT_STATES).toContain('paused')
  })

  test('agent can transition between states', () => {
    const transitions: Record<string, string[]> = {
      idle: ['busy'],
      busy: ['idle', 'error', 'paused'],
      paused: ['idle', 'busy'],
      error: ['idle'],
    }

    expect(transitions.idle).toContain('busy')
    expect(transitions.busy).toContain('idle')
  })
})

// ─── Wiki Markdown ──────────────────────────────────────────────────────────────

describe('US-10.x: Wiki Markdown', () => {
  test('extracts title from markdown', () => {
    const extractTitle = (content: string): string => {
      const match = content.match(/^#\s+(.+)$/m)
      return match?.[1] || ''
    }

    expect(extractTitle('# My Wiki Page\n\nContent')).toBe('My Wiki Page')
    expect(extractTitle('No title here')).toBe('')
  })

  test('extracts tags from frontmatter or content', () => {
    const extractTags = (content: string): string[] => {
      const tagMatch = content.match(/tags:\s*\[(.*?)\]/i)
      if (tagMatch) return tagMatch[1].split(',').map(t => t.trim())
      return []
    }

    expect(extractTags('tags: [test, wiki]')).toEqual(['test', 'wiki'])
    expect(extractTags('no tags here')).toEqual([])
  })

  test('validates wiki content is not empty', () => {
    const isValidWikiContent = (content: string) => content.trim().length > 0
    expect(isValidWikiContent('# Title\n\nSome content')).toBe(true)
    expect(isValidWikiContent('')).toBe(false)
    expect(isValidWikiContent('   ')).toBe(false)
  })
})

// ─── Token Report ───────────────────────────────────────────────────────────────

describe('US-11.3: Token Report', () => {
  test('calculates token cost', () => {
    const calcCost = (tokens: number, pricePer1k: number) =>
      (tokens / 1000) * pricePer1k

    expect(calcCost(1000, 0.01)).toBe(0.01)
    expect(calcCost(5000, 0.01)).toBe(0.05)
    expect(calcCost(10000, 0.002)).toBe(0.02)
  })

  test('groups tokens by model', () => {
    const groupByModel = (logs: { model: string; tokens: number }[]) => {
      const groups: Record<string, number> = {}
      for (const log of logs) {
        groups[log.model] = (groups[log.model] || 0) + log.tokens
      }
      return groups
    }

    const logs = [
      { model: 'gpt-4', tokens: 1000 },
      { model: 'gpt-4', tokens: 500 },
      { model: 'gpt-3.5', tokens: 300 },
    ]
    const grouped = groupByModel(logs)
    expect(grouped['gpt-4']).toBe(1500)
    expect(grouped['gpt-3.5']).toBe(300)
  })

  test('formats token count', () => {
    const formatTokens = (n: number): string => {
      if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
      if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
      return n.toString()
    }

    expect(formatTokens(1500000)).toBe('1.5M')
    expect(formatTokens(5000)).toBe('5.0K')
    expect(formatTokens(500)).toBe('500')
  })
})