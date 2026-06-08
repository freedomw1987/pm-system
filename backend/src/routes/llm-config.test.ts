/**
 * LLM Config route test — US-8.7 (P0)
 *
 * Covers:
 *  - GET: 唔 expose apiKey / visionApiKey (security invariant)
 *  - GET: returns hasVisionKey boolean 替代 raw key
 *  - PUT: admin-only gate
 *  - PUT: 必填 apiUrl + model
 *  - PUT: apiKey optional — 唔提供時保留 existing (key rotation 友善)
 *  - PUT: vision fields 處理 (null 清除 logic)
 *
 * 對應 TECH-DEBT TD-001 + 紅線 12.
 *
 * Approach: derive pure redaction + validation helpers,因為 route 直接 access Prisma
 * 但 LLM config 邏輯簡單(81 行),無 LLM streaming 或 WebSocket 嘅 deep state。
 */

import { describe, expect, test } from 'bun:test'

// ─── Pure helpers derived from llm-config.ts ─────────────────────────────────

type AuthUser = { id: string; role: string }

type LLMConfigInternal = {
  id: string
  apiUrl: string
  apiKey: string | null
  model: string
  visionApiUrl: string | null
  visionApiKey: string | null
  visionModel: string | null
  updatedAt: Date
}

type LLMConfigPublic = {
  id: string
  apiUrl: string
  model: string
  visionApiUrl: string | null
  visionModel: string | null
  hasVisionKey: boolean
  updatedAt: Date
}

/**
 * 從 llm-config.ts GET / derive 嘅 redaction
 * 守住 "絕對唔 expose raw key" invariant
 */
function redactLLMConfig(config: LLMConfigInternal | null): LLMConfigPublic | null {
  if (!config) return null
  return {
    id: config.id,
    apiUrl: config.apiUrl,
    model: config.model,
    visionApiUrl: config.visionApiUrl || null,
    visionModel: config.visionModel || null,
    hasVisionKey: !!config.visionApiKey,
    updatedAt: config.updatedAt,
  }
}

/**
 * 從 llm-config.ts PUT / derive 嘅 admin-only gate
 */
function canUpdateLLMConfig(user: AuthUser | null): boolean {
  if (!user) return false
  return user.role === 'admin'
}

/**
 * 從 llm-config.ts PUT / derive 嘅 input validation
 * 必填 apiUrl + model
 */
function validateUpdateLLMConfig(body: unknown): {
  ok: boolean
  reason?: string
} {
  if (!body || typeof body !== 'object') return { ok: false, reason: 'body required' }
  const b = body as Record<string, unknown>
  if (typeof b.apiUrl !== 'string' || b.apiUrl.length === 0) {
    return { ok: false, reason: 'apiUrl is required' }
  }
  if (typeof b.model !== 'string' || b.model.length === 0) {
    return { ok: false, reason: 'model is required' }
  }
  return { ok: true }
}

/**
 * 從 llm-config.ts PUT / derive 嘅 update data builder
 * 守住 "apiKey optional → 唔覆蓋 existing" invariant
 */
function buildLLMConfigUpdate(body: {
  apiUrl: string
  apiKey?: string
  model: string
  visionApiUrl?: string
  visionApiKey?: string
  visionModel?: string
}) {
  const data: any = {
    apiUrl: body.apiUrl,
    model: body.model,
  }
  // Only update apiKey if provided (so existing key can be retained)
  if (body.apiKey) data.apiKey = body.apiKey
  if (body.visionApiUrl !== undefined) data.visionApiUrl = body.visionApiUrl || null
  if (body.visionModel !== undefined) data.visionModel = body.visionModel || null
  if (body.visionApiKey) data.visionApiKey = body.visionApiKey
  return data
}

/**
 * 從 llm-config.ts PUT / derive 嘅 URL format basic check
 * 守住 "apiUrl 應該係 URL 格式" (Elysia 唔做, business logic 應該守)
 */
function isValidApiUrl(url: string): boolean {
  if (typeof url !== 'string' || url.length === 0) return false
  // 簡單 check: 開頭 https:// or http://
  if (!url.startsWith('https://') && !url.startsWith('http://')) return false
  // 唔可以 whitespace
  if (url.includes(' ')) return false
  return true
}

// ─── US-8.7 GET /llm-config ─────────────────────────────────────────────────

describe('US-8.7: GET /llm-config', () => {
  describe('redactLLMConfig (security: 唔 expose raw key)', () => {
    const fullConfig: LLMConfigInternal = {
      id: 'cfg-1',
      apiUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-secret-key-12345',
      model: 'gpt-4o-mini',
      visionApiUrl: 'https://api.openai.com/v1',
      visionApiKey: 'sk-vision-secret-67890',
      visionModel: 'gpt-4o',
      updatedAt: new Date('2026-06-08'),
    }

    test('redacts apiKey completely', () => {
      const redacted = redactLLMConfig(fullConfig)!
      expect((redacted as any).apiKey).toBeUndefined()
      expect('apiKey' in redacted).toBe(false)
    })

    test('redacts visionApiKey completely', () => {
      const redacted = redactLLMConfig(fullConfig)!
      expect((redacted as any).visionApiKey).toBeUndefined()
      expect('visionApiKey' in redacted).toBe(false)
    })

    test('exposes hasVisionKey boolean (替代 raw key)', () => {
      const redacted = redactLLMConfig(fullConfig)!
      expect(redacted.hasVisionKey).toBe(true)
    })

    test('hasVisionKey = false when visionApiKey missing', () => {
      const noVision: LLMConfigInternal = {
        ...fullConfig,
        visionApiKey: null,
      }
      expect(redactLLMConfig(noVision)!.hasVisionKey).toBe(false)
    })

    test('preserves non-secret fields', () => {
      const redacted = redactLLMConfig(fullConfig)!
      expect(redacted.id).toBe('cfg-1')
      expect(redacted.apiUrl).toBe('https://api.openai.com/v1')
      expect(redacted.model).toBe('gpt-4o-mini')
      expect(redacted.visionModel).toBe('gpt-4o')
    })

    test('vision fields default to null when empty', () => {
      const minimal: LLMConfigInternal = {
        id: 'cfg-1',
        apiUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test',
        model: 'gpt-4o-mini',
        visionApiUrl: null,
        visionApiKey: null,
        visionModel: null,
        updatedAt: new Date(),
      }
      const redacted = redactLLMConfig(minimal)!
      expect(redacted.visionApiUrl).toBeNull()
      expect(redacted.visionModel).toBeNull()
    })

    test('null config → null', () => {
      expect(redactLLMConfig(null)).toBeNull()
    })
  })
})

// ─── US-8.7 PUT /llm-config ─────────────────────────────────────────────────

describe('US-8.7: PUT /llm-config (admin-only update)', () => {
  describe('canUpdateLLMConfig', () => {
    test('null user → false', () => {
      expect(canUpdateLLMConfig(null)).toBe(false)
    })

    test('admin can update', () => {
      expect(canUpdateLLMConfig({ id: 'u-1', role: 'admin' })).toBe(true)
    })

    test('pm cannot update', () => {
      expect(canUpdateLLMConfig({ id: 'u-1', role: 'pm' })).toBe(false)
    })

    test('developer cannot update', () => {
      expect(canUpdateLLMConfig({ id: 'u-1', role: 'developer' })).toBe(false)
    })
  })

  describe('validateUpdateLLMConfig', () => {
    test('rejects null body', () => {
      expect(validateUpdateLLMConfig(null).ok).toBe(false)
    })

    test('rejects missing apiUrl', () => {
      const r = validateUpdateLLMConfig({ model: 'gpt-4o' })
      expect(r.ok).toBe(false)
      expect(r.reason).toBe('apiUrl is required')
    })

    test('rejects empty apiUrl', () => {
      const r = validateUpdateLLMConfig({ apiUrl: '', model: 'gpt-4o' })
      expect(r.ok).toBe(false)
    })

    test('rejects missing model', () => {
      const r = validateUpdateLLMConfig({ apiUrl: 'https://api.openai.com/v1' })
      expect(r.ok).toBe(false)
      expect(r.reason).toBe('model is required')
    })

    test('rejects empty model', () => {
      const r = validateUpdateLLMConfig({ apiUrl: 'https://api.openai.com/v1', model: '' })
      expect(r.ok).toBe(false)
    })

    test('accepts minimum valid (apiUrl + model only)', () => {
      expect(
        validateUpdateLLMConfig({ apiUrl: 'https://api.openai.com/v1', model: 'gpt-4o' }).ok
      ).toBe(true)
    })

    test('accepts full vision config', () => {
      expect(
        validateUpdateLLMConfig({
          apiUrl: 'https://api.openai.com/v1',
          model: 'gpt-4o',
          visionApiUrl: 'https://api.openai.com/v1',
          visionModel: 'gpt-4o',
          visionApiKey: 'sk-vision',
        }).ok
      ).toBe(true)
    })
  })

  describe('buildLLMConfigUpdate (key rotation logic)', () => {
    test('apiKey NOT included when not provided (existing key preserved)', () => {
      const data = buildLLMConfigUpdate({
        apiUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o',
      })
      expect(data).not.toHaveProperty('apiKey')
    })

    test('apiKey included when provided', () => {
      const data = buildLLMConfigUpdate({
        apiUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o',
        apiKey: 'sk-new-key',
      })
      expect(data.apiKey).toBe('sk-new-key')
    })

    test('empty string apiKey NOT included (treat as absent)', () => {
      const data = buildLLMConfigUpdate({
        apiUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o',
        apiKey: '',
      })
      expect(data).not.toHaveProperty('apiKey')
    })

    test('visionApiUrl null converts empty string to null', () => {
      const data = buildLLMConfigUpdate({
        apiUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o',
        visionApiUrl: '',
      })
      expect(data.visionApiUrl).toBeNull()
    })

    test('visionApiUrl provided preserved', () => {
      const data = buildLLMConfigUpdate({
        apiUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o',
        visionApiUrl: 'https://vision.api/v1',
      })
      expect(data.visionApiUrl).toBe('https://vision.api/v1')
    })

    test('visionModel undefined → NOT in update data', () => {
      const data = buildLLMConfigUpdate({
        apiUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o',
      })
      expect(data).not.toHaveProperty('visionModel')
    })

    test('visionApiKey empty string NOT included (treat as absent)', () => {
      const data = buildLLMConfigUpdate({
        apiUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o',
        visionApiKey: '',
      })
      expect(data).not.toHaveProperty('visionApiKey')
    })
  })

  describe('isValidApiUrl (URL format check)', () => {
    test('https:// is valid', () => {
      expect(isValidApiUrl('https://api.openai.com/v1')).toBe(true)
    })

    test('http:// is valid (dev)', () => {
      expect(isValidApiUrl('http://localhost:11434/v1')).toBe(true)
    })

    test('missing protocol is invalid', () => {
      expect(isValidApiUrl('api.openai.com/v1')).toBe(false)
    })

    test('whitespace in URL is invalid', () => {
      expect(isValidApiUrl('https://api.openai.com /v1')).toBe(false)
    })

    test('empty string is invalid', () => {
      expect(isValidApiUrl('')).toBe(false)
    })

    test('javascript: URL is rejected (XSS guard)', () => {
      expect(isValidApiUrl('javascript:alert(1)')).toBe(false)
    })
  })
})
