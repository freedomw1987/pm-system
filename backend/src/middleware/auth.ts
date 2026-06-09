import type { Elysia } from 'elysia'
import { prisma } from '../utils/prisma'

const authMiddleware = async ({ user, set }: { user: any; set: any }) => {
  if (!user?.id) {
    set.status = 401
    return { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }
  }
  return true
}

/**
 * Auth derive hook — 從 Authorization: Bearer <token> 攞 user 放落 context。
 *
 * 為何放喺 middleware/auth.ts 而唔係 inline 喺 index.ts(2026-06-09 抽出):
 *   之前只有 /api group 用 derive → `/auth/change-password` 喺 root 攞唔到 user,
 *   永遠 401(US-1.4 /profile 改密碼功能完全 dead)。
 *   而家 extract 出嚟,apply 喺 app level(authRoutes + /api routes 都用),
 *   `/auth/change-password` 先至攞到 user。
 *
 * 行為:
 *   - 冇 Bearer / 冇 token → { user: null }(登入/refresh/logout 仍 work)
 *   - Token 格式錯 → { user: null }
 *   - User 真實唔存在(TD-011)→ { user: null },唔會過 derive 落到 handler
 *   - DB error → graceful { user: null },console.error
 *
 * 注意: Elysia 嘅 derive context `headers` 係 plain object(record<string, string>),
 * 唔係 Web `Headers` 實例。 用 `headers.authorization` 而唔係 `headers.get('authorization')`。
 */
export const authDerive = async ({ headers }: { headers: Record<string, string | undefined> }) => {
  const authHeader = headers['authorization']
  if (!authHeader?.startsWith('Bearer ')) {
    return { user: null }
  }
  const token = authHeader.slice(7)
  try {
    const [userId, role] = token.split(':')
    if (!userId) return { user: null }

    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { isAgent: true, agentConfig: true, role: true }
    })
    if (!dbUser) return { user: null } // TD-011 防 fake UUID

    const effectiveRole = dbUser.role || role || 'developer'
    const roleRecord = await prisma.role.findUnique({ where: { name: effectiveRole } })
    const permissions = roleRecord?.permissions ?? []

    return {
      user: {
        id: userId,
        role: effectiveRole,
        permissions,
        isAgent: dbUser.isAgent,
        agentConfig: dbUser.agentConfig
      }
    }
  } catch (err) {
    console.error('[authDerive] unexpected error:', err)
    return { user: null }
  }
}

export { authMiddleware }