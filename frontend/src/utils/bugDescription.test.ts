/**
 * descriptionAttachments utility tests — Sprint 21
 *
 * 覆蓋:
 *  - 冇 data URL 時直接 return 原字串(zero side-effect)
 *  - 有 data URL 時 call attachmentApi.upload + replace
 *  - 個別 upload 失敗嗰張保留 data URL,其他繼續行
 *  - fetch blob / File 包裝成功
 *  - 支援多個 entityType(requirement / task / project / bug ...)
 */
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest'
import { migrateDataUrlsToAttachments } from './descriptionAttachments'

// Mock api.ts 入面嘅 attachmentApi.upload,免 call 真 backend
vi.mock('./api', () => ({
  attachmentApi: {
    upload: vi.fn(),
  },
}))

import { attachmentApi } from './api'

const mockedUpload = vi.mocked(attachmentApi.upload)

// 一張 1x1 transparent PNG 嘅 base64(細但係合法)
const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

function makeDataUrl(b64: string, mime = 'image/png') {
  return `data:${mime};base64,${b64}`
}

describe('migrateDataUrlsToAttachments', () => {
  beforeEach(() => {
    mockedUpload.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('冇 data URL 時直接 return 原字串(zero side-effect)', async () => {
    const html = '<p>純文字描述</p>'
    const out = await migrateDataUrlsToAttachments(html, 'bug', 'bug-1')
    expect(out).toBe(html)
    expect(mockedUpload).not.toHaveBeenCalled()
  })

  test('空字串 return 原字串', async () => {
    const out = await migrateDataUrlsToAttachments('', 'bug', 'bug-1')
    expect(out).toBe('')
    expect(mockedUpload).not.toHaveBeenCalled()
  })

  test('有 data URL 時 upload + replace src', async () => {
    mockedUpload.mockResolvedValue({ data: { id: 'att-1' } } as any)
    const html = `<p>睇下:<img src="${makeDataUrl(TINY_PNG_B64)}" /></p>`
    const out = await migrateDataUrlsToAttachments(html, 'bug', 'bug-1')

    expect(out).not.toContain('data:image')
    expect(out).toContain('/api/attachments/att-1')
    expect(out).toContain('<img src="/api/attachments/att-1"')
    expect(mockedUpload).toHaveBeenCalledTimes(1)
    // upload 嘅 entityType + entityId 一定要啱
    const call = mockedUpload.mock.calls[0]
    expect(call[1]).toBe('bug')
    expect(call[2]).toBe('bug-1')
    // file 應該係 File instance 同 mime 啱
    expect(call[0]).toBeInstanceOf(Blob)
    expect((call[0] as File).type).toBe('image/png')
  })

  test('多張 data URL 全部 upload + 全部 replace', async () => {
    mockedUpload.mockResolvedValueOnce({ data: { id: 'att-1' } } as any)
    mockedUpload.mockResolvedValueOnce({ data: { id: 'att-2' } } as any)
    const dataUrlA = makeDataUrl(TINY_PNG_B64, 'image/png')
    const dataUrlB = makeDataUrl(TINY_PNG_B64, 'image/jpeg')
    const html = `<p><img src="${dataUrlA}" /><br><img src="${dataUrlB}" /></p>`
    const out = await migrateDataUrlsToAttachments(html, 'bug', 'bug-2')

    expect(mockedUpload).toHaveBeenCalledTimes(2)
    expect(out).toContain('/api/attachments/att-1')
    expect(out).toContain('/api/attachments/att-2')
    expect(out).not.toContain('data:image')
  })

  test('個別 upload 失敗嗰張保留 data URL,其他繼續 migrate', async () => {
    mockedUpload.mockRejectedValueOnce(new Error('network error'))
    mockedUpload.mockResolvedValueOnce({ data: { id: 'att-2' } } as any)
    const dataUrlA = makeDataUrl(TINY_PNG_B64, 'image/png')
    const dataUrlB = makeDataUrl(TINY_PNG_B64, 'image/png')
    const html = `<p><img src="${dataUrlA}" /><img src="${dataUrlB}" /></p>`

    const out = await migrateDataUrlsToAttachments(html, 'bug', 'bug-3')

    // 失敗嗰張保留 data URL
    expect(out).toContain(dataUrlA)
    // 成功嗰張 migrate
    expect(out).toContain('/api/attachments/att-2')
  })

  test('upload 返 null/undefined id 時 keep 住原 data URL', async () => {
    mockedUpload.mockResolvedValue({ data: {} } as any) // 冇 id
    const dataUrl = makeDataUrl(TINY_PNG_B64)
    const html = `<p><img src="${dataUrl}" /></p>`

    const out = await migrateDataUrlsToAttachments(html, 'bug', 'bug-4')

    // 冇 id 當失敗,保留 data URL
    expect(out).toContain(dataUrl)
    expect(out).not.toContain('/api/attachments/')
  })

  test('支援非 bug 嘅 entityType(requirement / task / project)', async () => {
    mockedUpload.mockResolvedValue({ data: { id: 'att-req-1' } } as any)
    const dataUrl = makeDataUrl(TINY_PNG_B64)
    const html = `<p><img src="${dataUrl}" /></p>`

    const out = await migrateDataUrlsToAttachments(html, 'requirement', 'req-99')

    expect(out).toContain('/api/attachments/att-req-1')
    expect(mockedUpload.mock.calls[0][1]).toBe('requirement')
    expect(mockedUpload.mock.calls[0][2]).toBe('req-99')
  })
})
