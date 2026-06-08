/**
 * TD-008 + RG-008: Login rate limit regression tests.
 *
 * 守住 invariant:rate limit (a) blocks brute force,(b) isolates by IP,
 * (c) sliding window,(d) blocked attempts don't extend lockout.
 *
 * 註:Routing integration(真打 /auth/login)由 E2E suite 守住
 * (e2e/tests/auth-rate-limit.spec.ts),因為需要 DB + bcrypt 啟動,
 * 唔啱喺 host 跑 unit test 時 mock 整個 stack。
 */
import { describe, expect, test, beforeEach } from 'bun:test'
import { rateLimit, rateLimitStore, _resetRateLimit } from '../utils/rate-limit'

describe('RG-008: TD-008 login rate limit (unit + utility)', () => {
  beforeEach(() => {
    _resetRateLimit()
  })

  describe('rateLimit() utility', () => {
    test('allows requests under the limit', () => {
      for (let i = 0; i < 5; i++) {
        const result = rateLimit({ key: 'login:1.2.3.4', limit: 5, windowMs: 60_000 })
        expect(result.ok).toBe(true)
        expect(result.remaining).toBe(4 - i)
      }
    })

    test('blocks the 6th request from the same key', () => {
      for (let i = 0; i < 5; i++) {
        rateLimit({ key: 'login:1.2.3.4', limit: 5, windowMs: 60_000 })
      }
      const sixth = rateLimit({ key: 'login:1.2.3.4', limit: 5, windowMs: 60_000 })
      expect(sixth.ok).toBe(false)
      expect(sixth.remaining).toBe(0)
      expect(sixth.resetMs).toBeGreaterThan(0)
    })

    test('isolates different IPs', () => {
      for (let i = 0; i < 5; i++) {
        rateLimit({ key: 'login:1.2.3.4', limit: 5, windowMs: 60_000 })
      }
      // Different IP not affected
      const otherIp = rateLimit({ key: 'login:5.6.7.8', limit: 5, windowMs: 60_000 })
      expect(otherIp.ok).toBe(true)
      expect(otherIp.remaining).toBe(4)
    })

    test('sliding window: attempts expire after windowMs', async () => {
      // Use a 100ms window for fast test
      for (let i = 0; i < 5; i++) {
        rateLimit({ key: 'login:test', limit: 5, windowMs: 100 })
      }
      const blocked = rateLimit({ key: 'login:test', limit: 5, windowMs: 100 })
      expect(blocked.ok).toBe(false)

      // Wait for window to expire
      await new Promise(r => setTimeout(r, 150))

      const allowed = rateLimit({ key: 'login:test', limit: 5, windowMs: 100 })
      expect(allowed.ok).toBe(true)
    })

    test('blocked attempts do NOT count toward limit', () => {
      // Fill up limit
      for (let i = 0; i < 5; i++) {
        rateLimit({ key: 'login:x', limit: 5, windowMs: 60_000 })
      }
      // Hammer with blocked attempts — should not extend lockout
      for (let i = 0; i < 100; i++) {
        rateLimit({ key: 'login:x', limit: 5, windowMs: 60_000 })
      }
      // Store should still have 5 timestamps (blocked not recorded)
      const stored = rateLimitStore.get('login:x') ?? []
      expect(stored.length).toBe(5)
    })
  })

})
