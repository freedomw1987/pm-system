/**
 * Generate a UUID v4 string. Works in all browser contexts:
 *
 * 1. `crypto.randomUUID()` (preferred) — available in secure contexts (HTTPS / localhost).
 * 2. Fallback using `crypto.getRandomValues` (available in non-secure HTTP contexts where
 *    `randomUUID` is gated). Manually sets the UUID v4 version + variant bits.
 * 3. Last-resort `Math.random()` based ID — used only when Web Crypto is entirely
 *    unavailable (very old browsers, some webviews). Not cryptographically strong
 *    but sufficient for client-side message IDs.
 */
export function uuid(): string {
  // Preferred: native randomUUID (HTTPS / localhost / Node 19+)
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  // Fallback 1: getRandomValues (works on http:// in most modern browsers)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    // Per RFC 4122 §4.4: set version (4) and variant (10x) bits
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }

  // Fallback 2: Math.random (last resort — not crypto-strong)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
