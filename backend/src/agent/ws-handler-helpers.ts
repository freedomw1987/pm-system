/**
 * WS handler helpers — pure functions extracted from agent/runtime.ts
 * to enable unit testing without booting a Bun WebSocket server.
 *
 * TD-014 / RG-010: bun:test `mock.module` doesn't survive ESM hoist, so
 * in-process WS integration tests cannot verify the auth gate logic.
 * These helpers are pure (input → output, no I/O, no closure) and can
 * be tested directly with bun:test.
 *
 * INVARIANT: 純 function only. No `ws` / `prisma` / `Date.now()` / `Math.random()` / DB calls.
 * If you need to add something with a side effect, wrap it in a caller and
 * pass the result in.
 */

/**
 * Parse agentId / token from a WS connection URL's query string.
 * Returns `null` if either is missing (caller should close 4001).
 *
 * @param rawUrl - `ws.raw.url` (full URL with `ws://` or `wss://` scheme)
 * @returns `{ token, agentId }` or `null` if either param missing
 */
export interface WsAuthParams {
  token: string
  agentId: string
}

export function extractWsAuthParams(rawUrl: string): WsAuthParams | null {
  // The runtime always passes 'http://localhost' as base; that lets URL parse
  // `ws://...` URLs in Node/Bun URL constructor. Mirror that here for unit
  // tests where we feed raw `ws://...` strings.
  const url = new URL(rawUrl, 'http://localhost')
  const token = url.searchParams.get('token')
  const agentId = url.searchParams.get('agentId')

  if (!token || !agentId) return null
  return { token, agentId }
}

/**
 * Map a high-level "reason" to the WS close code used by agent runtime.
 *  - 'missing' → 4001 (Missing authentication)
 *  - 'invalid_token' → 4002 (Invalid token)
 *  - 'invalid_agent' → 4003 (Invalid agent)
 *  - 'auth_failed' → 4002 (Authentication failed)
 *  - 'ok' → 1000 (Normal closure, sent by us in `close(1000, ...)` calls)
 *
 * Returns `null` for unknown reasons so callers can fall through to a
 * generic 1011 (internal error) at the close site.
 */
export type WsCloseReason =
  | 'missing'
  | 'invalid_token'
  | 'invalid_agent'
  | 'auth_failed'
  | 'ok'
  | 'forced_disconnect'

export function wsCloseCodeForReason(reason: WsCloseReason): number {
  switch (reason) {
    case 'missing':
      return 4001
    case 'invalid_token':
    case 'auth_failed':
      return 4002
    case 'invalid_agent':
      return 4003
    case 'ok':
    case 'forced_disconnect':
      return 1000
    default:
      return 1011 // internal error, unknown reason
  }
}

/**
 * Build the welcome message sent right after a successful agent auth.
 * Pure: agentId is interpolated into a static string template.
 *
 * @param agentId - the verified agent UUID
 * @param messageText - the welcome body (kept as a param so tests can pin it)
 * @param issuedAtMs - `Date.now()` value, injected for determinism in tests
 */
export function buildAgentWelcomeMessage(
  agentId: string,
  messageText: string,
  issuedAtMs: number
): string {
  return JSON.stringify({
    type: 'ping',
    payload: { message: messageText, agentId },
    timestamp: issuedAtMs
  })
}

/**
 * Sanity check: helper exists + shape matches what runtime.ts expects.
 * If this fails, the WS auth gate will silently mis-auth.
 */
export const __WS_HELPER_VERSION__ = '1.0.0' as const
