/**
 * RG-010 (Sprint 5): WS auth gate helpers — pure function regression test.
 *
 * TD-014: bun:test `mock.module` 對 ESM hoist 唔可靠, in-process WS integration
 * test 撞 open handler 嘅真 prisma load 失效. Fix: 抽純 function 拆出嚟
 * (ws-handler-helpers.ts) — 唔需要 mock 任何嘢, 用 input/output 直接 assert.
 *
 * 守住 invariant:
 *  - `extractWsAuthParams` 必須 parse 出 token + agentId (full URL or query string)
 *  - `wsCloseCodeForReason` 必須 stable 對應 error reason 落 specific close code
 *  - `buildAgentWelcomeMessage` 必須 produce parseable JSON, payload 入面有 agentId
 *  - 全部 helper 都唔可以 import prisma / ws / Date.now() (用 `issuedAtMs` param
 *    注入 timestamp, 確保 deterministic)
 */
import { describe, expect, test } from 'bun:test'
import {
  extractWsAuthParams,
  wsCloseCodeForReason,
  buildAgentWelcomeMessage,
  __WS_HELPER_VERSION__
} from './ws-handler-helpers'

describe('RG-010: WS handler helpers (TD-014 closure)', () => {
  // ─── extractWsAuthParams ─────────────────────────────────────────────
  describe('extractWsAuthParams', () => {
    test('parses token + agentId from ws:// URL with query string', () => {
      const result = extractWsAuthParams('ws://localhost/ws/agents/?token=abc123&agentId=agent-uuid-1')
      expect(result).not.toBeNull()
      expect(result!.token).toBe('abc123')
      expect(result!.agentId).toBe('agent-uuid-1')
    })

    test('parses from wss:// scheme (production HTTPS)', () => {
      const result = extractWsAuthParams('wss://api.example.com/ws/agents/?token=xyz&agentId=agent-2')
      expect(result).not.toBeNull()
      expect(result!.token).toBe('xyz')
      expect(result!.agentId).toBe('agent-2')
    })

    test('returns null if token is missing', () => {
      const result = extractWsAuthParams('ws://localhost/ws/agents/?agentId=agent-1')
      expect(result).toBeNull()
    })

    test('returns null if agentId is missing', () => {
      const result = extractWsAuthParams('ws://localhost/ws/agents/?token=abc')
      expect(result).toBeNull()
    })

    test('returns null if both missing', () => {
      const result = extractWsAuthParams('ws://localhost/ws/agents/')
      expect(result).toBeNull()
    })

    test('preserves token with special chars (URL-encoded)', () => {
      const result = extractWsAuthParams('ws://localhost/ws/agents/?token=abc%2B123%3D%3D&agentId=agent-1')
      expect(result).not.toBeNull()
      expect(result!.token).toBe('abc+123==') // URL-decoded
    })
  })

  // ─── wsCloseCodeForReason ────────────────────────────────────────────
  describe('wsCloseCodeForReason', () => {
    test('maps "missing" to 4001 (Missing authentication)', () => {
      expect(wsCloseCodeForReason('missing')).toBe(4001)
    })

    test('maps "invalid_token" to 4002 (Invalid token)', () => {
      expect(wsCloseCodeForReason('invalid_token')).toBe(4002)
    })

    test('maps "invalid_agent" to 4003 (Invalid agent)', () => {
      expect(wsCloseCodeForReason('invalid_agent')).toBe(4003)
    })

    test('maps "auth_failed" to 4002 (Authentication failed — same as invalid_token)', () => {
      // Deliberate: catch-all auth failure uses same code as bad-token for
      // uniform client handling. Documented invariant: any non-4003 auth
      // failure closes 4002.
      expect(wsCloseCodeForReason('auth_failed')).toBe(4002)
    })

    test('maps "ok" / "forced_disconnect" to 1000 (Normal closure)', () => {
      expect(wsCloseCodeForReason('ok')).toBe(1000)
      expect(wsCloseCodeForReason('forced_disconnect')).toBe(1000)
    })

    test('returns 1011 (internal error) for unknown reason', () => {
      // Cast to bypass type system — testing the default branch.
      expect(wsCloseCodeForReason('mystery' as any)).toBe(1011)
    })
  })

  // ─── buildAgentWelcomeMessage ────────────────────────────────────────
  describe('buildAgentWelcomeMessage', () => {
    test('produces parseable JSON with type=ping + agentId + timestamp', () => {
      const json = buildAgentWelcomeMessage('agent-uuid-1', 'Connected to PM System', 1700000000000)
      const obj = JSON.parse(json)

      expect(obj.type).toBe('ping')
      expect(obj.payload.message).toBe('Connected to PM System')
      expect(obj.payload.agentId).toBe('agent-uuid-1')
      expect(obj.timestamp).toBe(1700000000000)
    })

    test('is deterministic — same inputs always produce same output', () => {
      const a = buildAgentWelcomeMessage('agent-1', 'msg', 1000)
      const b = buildAgentWelcomeMessage('agent-1', 'msg', 1000)
      expect(a).toBe(b)
    })

    test('different agentIds produce different payloads (no shared state)', () => {
      const a = JSON.parse(buildAgentWelcomeMessage('agent-1', 'm', 1000))
      const b = JSON.parse(buildAgentWelcomeMessage('agent-2', 'm', 1000))
      expect(a.payload.agentId).not.toBe(b.payload.agentId)
    })

    test('does NOT call Date.now() internally — fully deterministic on timestamp param', () => {
      // If buildAgentWelcomeMessage called Date.now() internally, two calls
      // would produce different timestamps. We assert equality below.
      const t1 = 1234567890
      const t2 = 1234567890
      const a = JSON.parse(buildAgentWelcomeMessage('agent', 'm', t1))
      const b = JSON.parse(buildAgentWelcomeMessage('agent', 'm', t2))
      expect(a.timestamp).toBe(b.timestamp)
      expect(a.timestamp).toBe(1234567890)
    })
  })

  // ─── Module invariant ────────────────────────────────────────────────
  test('__WS_HELPER_VERSION__ is pinned (drift detector)', () => {
    // If helpers change shape, bump version. Test guards against silent
    // signature drift that runtime.ts might depend on.
    expect(__WS_HELPER_VERSION__).toBe('1.0.0')
  })
})
