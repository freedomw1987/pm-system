/**
 * In-memory sliding-window rate limiter (RG-008 regression target).
 *
 * Used by auth/login (TD-008) — IP-based, 5 attempts / 60s window.
 *
 * 設計:
 * - In-memory Map<key, timestamps[]>,每個 key 一個 sliding window
 * - Map 自動 cleanup 過期 entry 防 memory leak
 * - 唔用 plugin,純 20 行,bun-test mock 友善
 * - Production 用 Redis swap 一行 OK
 *
 * 點用:
 *   const ok = rateLimit({ key: `login:${ip}`, limit: 5, windowMs: 60_000 })
 *   if (!ok) return { error: { code: 'TOO_MANY_REQUESTS', message: 'Too many login attempts' } }
 */

export interface RateLimitOptions {
  key: string
  limit: number
  windowMs: number
}

export interface RateLimitResult {
  ok: boolean
  remaining: number
  resetMs: number  // ms until oldest attempt expires
}

// Internal store — exported for tests
export const rateLimitStore = new Map<string, number[]>()

/**
 * Check if request is allowed. Records the attempt only when ok=true
 * (i.e. we don't count blocked attempts; otherwise the limit never recovers).
 */
export function rateLimit({ key, limit, windowMs }: RateLimitOptions): RateLimitResult {
  const now = Date.now()
  const cutoff = now - windowMs

  // Get existing timestamps, drop expired
  const timestamps = (rateLimitStore.get(key) ?? []).filter(t => t > cutoff)

  if (timestamps.length >= limit) {
    const oldest = timestamps[0]!
    return {
      ok: false,
      remaining: 0,
      resetMs: oldest + windowMs - now
    }
  }

  // Allow: record this attempt
  timestamps.push(now)
  rateLimitStore.set(key, timestamps)
  return {
    ok: true,
    remaining: limit - timestamps.length,
    resetMs: windowMs
  }
}

/** For tests: reset all rate limit state. */
export function _resetRateLimit() {
  rateLimitStore.clear()
}

/**
 * Periodic cleanup of expired entries — call from server lifecycle.
 * Removes keys whose newest timestamp is older than the largest tracked window.
 */
export function _cleanupRateLimit() {
  const now = Date.now()
  for (const [key, timestamps] of rateLimitStore) {
    const fresh = timestamps.filter(t => now - t < 60 * 60 * 1000)  // 1h grace
    if (fresh.length === 0) {
      rateLimitStore.delete(key)
    } else if (fresh.length !== timestamps.length) {
      rateLimitStore.set(key, fresh)
    }
  }
}
