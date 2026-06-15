import { describe, it, expect } from 'vitest'
import { uuid } from './uuid'

describe('uuid()', () => {
  it('returns a valid v4 UUID format', () => {
    const id = uuid()
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  })

  it('returns unique values on each call', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => uuid()))
    expect(ids.size).toBe(1000)
  })

  it('falls back when crypto.randomUUID is unavailable', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto')
    // Capture real getRandomValues BEFORE we override globalThis.crypto
    const realCrypto = (globalThis as any).crypto
    const realGetRandomValues: (a: Uint8Array) => Uint8Array =
      realCrypto.getRandomValues.bind(realCrypto)

    Object.defineProperty(globalThis, 'crypto', {
      value: { getRandomValues: realGetRandomValues }, // no randomUUID
      configurable: true,
    })

    try {
      const id = uuid()
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    } finally {
      if (original) Object.defineProperty(globalThis, 'crypto', original)
    }
  })
})
