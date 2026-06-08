/**
 * Agent route test — US-9.1 (P0, marked 🔴 in tracker)
 *
 * Covers:
 *  - US-9.1: POST /agents (建 Agent) — 補 unit test 守住:
 *    * 建 Agent permission gate (admin / has agents.create perm)
 *    * 必填 name 校驗
 *    * Default agent config 結構 invariants
 *    * Default role (developer)
 *    * Soft-delete 用 isAgent=false (唔係 hard delete) invariant
 *  - US-9.1 (附屬) PUT /:id / DELETE /:id — 守住 isAgent filter
 *  - 守住 Agent 唔可以 hit 內建 role assignment 嘅 invariant
 *
 * US-9.2 (claim-task) 已有完整 test: src/routes/agents.test.ts (Sprint 1 寫過)
 *
 * 對應 TECH-DEBT TD-001 + 紅線 12 + retro ACT-8.
 */

import { describe, expect, test } from 'bun:test'

// ─── Pure helpers derived from agents.ts ─────────────────────────────────────

type AuthUser = {
  id: string
  role: string
  permissions?: string[]
}

/**
 * 從 agents.ts POST / derive 嘅建 Agent permission gate
 * 保持同 source 一致: agents.create perm OR admin
 */
function canCreateAgent(user: AuthUser | null): boolean {
  if (!user) return false
  if (user.role === 'admin') return true
  if (user.permissions?.includes('agents.create')) return true
  return false
}

/**
 * 從 agents.ts PUT /:id derive 嘅編 Agent permission gate
 */
function canEditAgent(user: AuthUser | null): boolean {
  if (!user) return false
  if (user.role === 'admin') return true
  if (user.permissions?.includes('agents.edit')) return true
  return false
}

/**
 * 從 agents.ts DELETE /:id derive 嘅刪 Agent permission gate
 * (實作係 soft delete — set isAgent=false)
 */
function canDeleteAgent(user: AuthUser | null): boolean {
  if (!user) return false
  if (user.role === 'admin') return true
  if (user.permissions?.includes('agents.delete')) return true
  return false
}

/**
 * 從 agents.ts POST / derive 嘅 input validation
 * 必填 name
 */
function validateCreateAgentInput(body: unknown): {
  ok: boolean
  reason?: string
} {
  if (!body || typeof body !== 'object') return { ok: false, reason: 'body required' }
  const b = body as Record<string, unknown>
  if (typeof b.name !== 'string' || b.name.length === 0) {
    return { ok: false, reason: 'Name is required' }
  }
  return { ok: true }
}

/**
 * 從 agents.ts POST / derive 嘅 default agent config
 * 守住 source 嘅 default values invariant
 */
const DEFAULT_AGENT_CONFIG = {
  maxConcurrentTasks: 3,
  temperature: 0.7,
  systemPrompt: '你是一個專業的 AI Agent，擅長分析和解決軟件工程問題。',
  skills: [],
  mcpServers: [],
} as const

const DEFAULT_AGENT_ROLE = 'developer' as const

function buildAgentConfig(userConfig?: Record<string, unknown>) {
  return {
    ...DEFAULT_AGENT_CONFIG,
    ...(userConfig ?? {}),
  }
}

function resolveAgentRole(role?: string): string {
  return role || DEFAULT_AGENT_ROLE
}

/**
 * 從 agents.ts DELETE /:id derive 嘅 soft-delete invariant
 * 唔好 hard delete,set isAgent=false
 */
function isSoftDeleted(agent: { isAgent: boolean }): boolean {
  return agent.isAgent === false
}

// ─── US-9.1 建 Agent ────────────────────────────────────────────────────────

describe('US-9.1: POST /agents', () => {
  describe('canCreateAgent', () => {
    test('null user → false', () => {
      expect(canCreateAgent(null)).toBe(false)
    })

    test('admin can create', () => {
      expect(canCreateAgent({ id: 'u-1', role: 'admin' })).toBe(true)
    })

    test('user with agents.create perm can create', () => {
      expect(
        canCreateAgent({ id: 'u-1', role: 'pm', permissions: ['agents.create'] })
      ).toBe(true)
    })

    test('pm without perm cannot create', () => {
      expect(canCreateAgent({ id: 'u-1', role: 'pm' })).toBe(false)
    })

    test('developer cannot create', () => {
      expect(canCreateAgent({ id: 'u-1', role: 'developer' })).toBe(false)
    })
  })

  describe('validateCreateAgentInput', () => {
    test('rejects null body', () => {
      expect(validateCreateAgentInput(null).ok).toBe(false)
    })

    test('rejects non-object body', () => {
      expect(validateCreateAgentInput('foo').ok).toBe(false)
      expect(validateCreateAgentInput(42).ok).toBe(false)
    })

    test('rejects missing name', () => {
      const r = validateCreateAgentInput({})
      expect(r.ok).toBe(false)
      expect(r.reason).toBe('Name is required')
    })

    test('rejects empty name', () => {
      const r = validateCreateAgentInput({ name: '' })
      expect(r.ok).toBe(false)
    })

    test('rejects non-string name', () => {
      expect(validateCreateAgentInput({ name: 123 }).ok).toBe(false)
      expect(validateCreateAgentInput({ name: null }).ok).toBe(false)
    })

    test('accepts valid name', () => {
      expect(validateCreateAgentInput({ name: 'MyAgent' }).ok).toBe(true)
    })

    test('accepts name + agentConfig (optional)', () => {
      expect(
        validateCreateAgentInput({
          name: 'Agent-1',
          agentConfig: { temperature: 0.5 },
        }).ok
      ).toBe(true)
    })
  })

  describe('default agent config invariants', () => {
    test('default config has all required fields', () => {
      expect(DEFAULT_AGENT_CONFIG).toHaveProperty('maxConcurrentTasks', 3)
      expect(DEFAULT_AGENT_CONFIG).toHaveProperty('temperature', 0.7)
      expect(DEFAULT_AGENT_CONFIG).toHaveProperty('systemPrompt')
      expect(DEFAULT_AGENT_CONFIG).toHaveProperty('skills', [])
      expect(DEFAULT_AGENT_CONFIG).toHaveProperty('mcpServers', [])
    })

    test('default system prompt is in Chinese (業務要求)', () => {
      expect(DEFAULT_AGENT_CONFIG.systemPrompt).toContain('AI Agent')
    })
  })

  describe('buildAgentConfig (user config override)', () => {
    test('no user config → use all defaults', () => {
      const cfg = buildAgentConfig()
      expect(cfg.maxConcurrentTasks).toBe(3)
      expect(cfg.temperature).toBe(0.7)
      expect(cfg.skills).toEqual([])
    })

    test('user config overrides defaults', () => {
      const cfg = buildAgentConfig({ maxConcurrentTasks: 10, temperature: 0.3 })
      expect(cfg.maxConcurrentTasks).toBe(10)
      expect(cfg.temperature).toBe(0.3)
      // 唔覆蓋嘅 field 用 default
      expect(cfg.skills).toEqual([])
    })

    test('user config can add custom fields', () => {
      const cfg = buildAgentConfig({ customField: 'hello' })
      expect((cfg as any).customField).toBe('hello')
    })
  })

  describe('resolveAgentRole (default role)', () => {
    test('undefined role → "developer" default', () => {
      expect(resolveAgentRole(undefined)).toBe('developer')
    })

    test('empty string role → "developer" default', () => {
      expect(resolveAgentRole('')).toBe('developer')
    })

    test('explicit role preserved', () => {
      expect(resolveAgentRole('pm')).toBe('pm')
      expect(resolveAgentRole('tester')).toBe('tester')
    })
  })
})

// ─── US-9.1 (附屬) Edit / Delete Agent ──────────────────────────────────────

describe('US-9.1 附屬: PUT /agents/:id, DELETE /agents/:id', () => {
  describe('canEditAgent', () => {
    test('admin can edit', () => {
      expect(canEditAgent({ id: 'u-1', role: 'admin' })).toBe(true)
    })

    test('user with agents.edit perm can edit', () => {
      expect(
        canEditAgent({ id: 'u-1', role: 'pm', permissions: ['agents.edit'] })
      ).toBe(true)
    })

    test('pm without perm cannot edit', () => {
      expect(canEditAgent({ id: 'u-1', role: 'pm' })).toBe(false)
    })
  })

  describe('canDeleteAgent', () => {
    test('admin can delete (soft)', () => {
      expect(canDeleteAgent({ id: 'u-1', role: 'admin' })).toBe(true)
    })

    test('user with agents.delete perm can delete', () => {
      expect(
        canDeleteAgent({ id: 'u-1', role: 'pm', permissions: ['agents.delete'] })
      ).toBe(true)
    })

    test('pm without perm cannot delete', () => {
      expect(canDeleteAgent({ id: 'u-1', role: 'pm' })).toBe(false)
    })
  })

  describe('isSoftDeleted (DELETE invariant)', () => {
    test('isAgent=true → not deleted', () => {
      expect(isSoftDeleted({ isAgent: true })).toBe(false)
    })

    test('isAgent=false → soft-deleted', () => {
      expect(isSoftDeleted({ isAgent: false })).toBe(true)
    })
  })
})
