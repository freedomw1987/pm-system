export interface TokenRefreshResponse {
  accessToken: string
  refreshToken: string
  user?: unknown
}

interface RefreshTokenManagerOptions {
  getRefreshToken: () => string | null
  refresh: (refreshToken: string) => Promise<TokenRefreshResponse>
  setTokens: (response: TokenRefreshResponse) => void
  clearTokens: () => void
}

export function createRefreshTokenManager(options: RefreshTokenManagerOptions) {
  let inFlightRefresh: Promise<string> | null = null

  const refreshAccessToken = () => {
    if (!inFlightRefresh) {
      inFlightRefresh = (async () => {
        const refreshToken = options.getRefreshToken()
        if (!refreshToken) {
          options.clearTokens()
          throw new Error('No refresh token available')
        }

        const response = await options.refresh(refreshToken)
        options.setTokens(response)
        return response.accessToken
      })().catch((error) => {
        options.clearTokens()
        throw error
      }).finally(() => {
        inFlightRefresh = null
      })
    }

    return inFlightRefresh
  }

  return { refreshAccessToken }
}
