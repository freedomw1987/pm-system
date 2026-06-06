import { describe, expect, test } from 'bun:test'
import { createRefreshTokenManager } from './authRefresh'

describe('createRefreshTokenManager', () => {
  test('shares one refresh request across concurrent callers', async () => {
    let refreshCalls = 0
    const manager = createRefreshTokenManager({
      getRefreshToken: () => 'refresh-token-1',
      setTokens: () => undefined,
      clearTokens: () => undefined,
      refresh: async () => {
        refreshCalls += 1
        await new Promise(resolve => setTimeout(resolve, 1))
        return {
          accessToken: 'access-token-2',
          refreshToken: 'refresh-token-2',
        }
      },
    })

    const [first, second, third] = await Promise.all([
      manager.refreshAccessToken(),
      manager.refreshAccessToken(),
      manager.refreshAccessToken(),
    ])

    expect(first).toBe('access-token-2')
    expect(second).toBe('access-token-2')
    expect(third).toBe('access-token-2')
    expect(refreshCalls).toBe(1)
  })
})
