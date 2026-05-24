import { Elysia, t } from 'elysia'

const authMiddleware = async ({ user, set }: { user: any; set: any }) => {
  if (!user?.id) {
    set.status = 401
    return { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }
  }
  return true
}

export { authMiddleware }