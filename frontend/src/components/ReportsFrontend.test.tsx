/**
 * Frontend Tests — Wiki & Reports
 */

import { describe, expect, test } from 'vitest'

// ─── Wiki Tests ──────────────────────────────────────────────

describe('Wiki (US-10.x)', () => {
  test('extracts title from markdown', () => {
    const extractTitle = (content: string) => {
      const match = content.match(/^#\s+(.+)$/m)
      return match?.[1] || ''
    }

    expect(extractTitle('# My Wiki Page\n\nContent')).toBe('My Wiki Page')
    expect(extractTitle('No heading here')).toBe('')
    expect(extractTitle('# Only Heading')).toBe('Only Heading')
  })

  test('extracts tags', () => {
    const extractTags = (content: string): string[] => {
      const match = content.match(/tags:\s*\[(.*?)\]/i)
      return match?.[1]?.split(',').map(t => t.trim()) || []
    }

    expect(extractTags('tags: [api, backend]')).toEqual(['api', 'backend'])
    expect(extractTags('no tags here')).toEqual([])
  })

  test('generates wiki link', () => {
    const wikiLink = (id: string, title: string) =>
      `/wiki/${id}?title=${encodeURIComponent(title)}`

    expect(wikiLink('123', 'My Wiki')).toBe('/wiki/123?title=My%20Wiki')
  })
})

// ─── Reports Tests (US-11.x) ─────────────────────────────────

describe('Reports (US-11.x)', () => {
  test('calculates completion rate', () => {
    const completionRate = (completed: number, total: number) =>
      total === 0 ? 0 : Math.round((completed / total) * 100)

    expect(completionRate(5, 10)).toBe(50)
    expect(completionRate(10, 10)).toBe(100)
    expect(completionRate(0, 0)).toBe(0)
    expect(completionRate(1, 3)).toBe(33)
  })

  test('groups worklogs by date', () => {
    const groupByDate = (logs: { date: string }[]) => {
      const groups: Record<string, typeof logs> = {}
      for (const log of logs) {
        const key = log.date.split('T')[0]
        if (!groups[key]) groups[key] = []
        groups[key].push(log)
      }
      return groups
    }

    const logs = [
      { date: '2026-06-10T09:00:00Z' },
      { date: '2026-06-10T14:00:00Z' },
      { date: '2026-06-11T10:00:00Z' },
    ]

    const grouped = groupByDate(logs)
    expect(Object.keys(grouped)).toHaveLength(2)
    expect(grouped['2026-06-10']).toHaveLength(2)
    expect(grouped['2026-06-11']).toHaveLength(1)
  })

  test('calculates token cost', () => {
    const calcCost = (tokens: number, pricePer1K: number) =>
      Math.round((tokens / 1000) * pricePer1K * 100) / 100

    expect(calcCost(1000, 0.01)).toBe(0.01)
    expect(calcCost(10000, 0.002)).toBe(0.02)
    expect(calcCost(0, 0.01)).toBe(0)
  })

  test('formats large numbers', () => {
    const formatNumber = (n: number): string => {
      if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
      if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
      return n.toString()
    }

    expect(formatNumber(1_500_000)).toBe('1.5M')
    expect(formatNumber(5_000)).toBe('5.0K')
    expect(formatNumber(500)).toBe('500')
  })
})