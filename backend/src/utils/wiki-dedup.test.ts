/**
 * Wiki dedup helper tests — US-21.3
 *
 * Verifies:
 *  - normalizeTitleForCompare: lowercase, trim, collapse whitespace, strip trailing punctuation
 *  - findExistingWikiPage: matches with normalization (mocks prisma)
 */

import { describe, expect, mock, test } from 'bun:test'

// Mock prisma before importing the helpers
const mockFindMany = mock(() => Promise.resolve([] as any[]))
mock.module('../utils/prisma', () => ({
  prisma: {
    wikiPage: {
      findMany: mockFindMany
    }
  }
}))

// Now import the helpers
const { normalizeTitleForCompare, findExistingWikiPage } = await import('./wiki-dedup')

describe('US-21.3: normalizeTitleForCompare', () => {
  test('lowercases', () => {
    expect(normalizeTitleForCompare('API 認證流程')).toBe('api 認證流程')
  })
  test('trims whitespace', () => {
    expect(normalizeTitleForCompare('  hello  ')).toBe('hello')
  })
  test('collapses internal whitespace', () => {
    expect(normalizeTitleForCompare('api    認證    流程')).toBe('api 認證 流程')
  })
  test('strips trailing punctuation (Chinese full stop + period + colon)', () => {
    expect(normalizeTitleForCompare('API 認證流程。')).toBe('api 認證流程')
    expect(normalizeTitleForCompare('API 認證流程.')).toBe('api 認證流程')
    expect(normalizeTitleForCompare('API 認證流程,')).toBe('api 認證流程')
    expect(normalizeTitleForCompare('API 認證流程:')).toBe('api 認證流程')
    expect(normalizeTitleForCompare('API 認證流程?')).toBe('api 認證流程')
    expect(normalizeTitleForCompare('API 認證流程!')).toBe('api 認證流程')
  })
  test('keeps internal punctuation intact', () => {
    // trailing "!" stripped, internal "?" kept
    expect(normalizeTitleForCompare('What? Why!')).toBe('what? why')
  })
  test('handles empty string', () => {
    expect(normalizeTitleForCompare('')).toBe('')
  })
  test('case-insensitive match for English + Chinese mixed', () => {
    expect(normalizeTitleForCompare('API 認證')).toBe(normalizeTitleForCompare('api 認證'))
  })
})

describe('US-21.3: findExistingWikiPage', () => {
  test('returns null when projectId is empty', async () => {
    const result = await findExistingWikiPage('', 'API 認證')
    expect(result).toBeNull()
  })

  test('returns null when title is empty', async () => {
    const result = await findExistingWikiPage('proj-1', '')
    expect(result).toBeNull()
  })

  test('returns null when no candidates', async () => {
    mockFindMany.mockImplementationOnce(() => Promise.resolve([]))
    const result = await findExistingWikiPage('proj-1', 'API 認證')
    expect(result).toBeNull()
  })

  test('returns match when normalized title equals', async () => {
    mockFindMany.mockImplementationOnce(() => Promise.resolve([
      { id: 'wiki-1', title: 'API 認證流程', updatedAt: new Date(), createdAt: new Date() }
    ]))
    const result = await findExistingWikiPage('proj-1', 'api 認證流程.')
    expect(result).not.toBeNull()
    expect(result?.id).toBe('wiki-1')
  })

  test('returns null when normalized title differs', async () => {
    mockFindMany.mockImplementationOnce(() => Promise.resolve([
      { id: 'wiki-1', title: 'API 認證流程', updatedAt: new Date(), createdAt: new Date() }
    ]))
    const result = await findExistingWikiPage('proj-1', '資料庫設計')
    expect(result).toBeNull()
  })

  test('handles whitespace differences', async () => {
    mockFindMany.mockImplementationOnce(() => Promise.resolve([
      { id: 'wiki-2', title: '部署   流程', updatedAt: new Date(), createdAt: new Date() }
    ]))
    const result = await findExistingWikiPage('proj-1', '部署 流程')
    expect(result).not.toBeNull()
    expect(result?.id).toBe('wiki-2')
  })

  test('passes projectId to where clause', async () => {
    let capturedWhere: any = null
    mockFindMany.mockImplementationOnce((args: any) => {
      capturedWhere = args?.where
      return Promise.resolve([])
    })
    await findExistingWikiPage('proj-xyz', 'Test Title')
    expect(capturedWhere).toBeTruthy()
    expect(capturedWhere.projectId).toBe('proj-xyz')
    expect(capturedWhere.title).toBeTruthy()
    expect(capturedWhere.title.contains).toBe('Test Title')
    expect(capturedWhere.title.mode).toBe('insensitive')
  })
})
