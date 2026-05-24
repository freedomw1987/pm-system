import { Elysia, t } from 'elysia'
import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'

const authRoutes = new Elysia({ prefix: '/auth' })
  .post('/login', async ({ body, set, cookie: { refreshToken } }) => {
    const { email, password } = body as { email: string; password: string }

    const { prisma } = await import('../utils/prisma')
    const user = await prisma.user.findUnique({ where: { email } })

    if (!user) {
      set.status = 401
      return { error: { code: 'UNAUTHORIZED', message: 'Invalid email or password' } }
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash)
    if (!validPassword) {
      set.status = 401
      return { error: { code: 'UNAUTHORIZED', message: 'Invalid email or password' } }
    }

    // Create tokens - format: userId:role for API authorization
    const accessToken = `${user.id}:${user.role}`
    const refreshTokenValue = uuidv4()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

    // Load permissions for this role from DB
    const role = await prisma.role.findUnique({ where: { name: user.role } })
    const permissions = role?.permissions ?? []

    await prisma.refreshToken.create({
      data: {
        token: refreshTokenValue,
        userId: user.id,
        expiresAt
      }
    })

    refreshToken.set({
      value: refreshTokenValue,
      httpOnly: true,
      secure: false, // Set to true in production with HTTPS
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 // 7 days
    })

    return {
      accessToken,
      refreshToken: refreshTokenValue,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        permissions
      }
    }
  }, {
    body: t.Object({
      email: t.String({ format: 'email' }),
      password: t.String()
    })
  })
  .post('/logout', async ({ cookie: { refreshToken } }) => {
    if (refreshToken.value) {
      const { prisma } = await import('../utils/prisma')
      await prisma.refreshToken.deleteMany({
        where: { token: refreshToken.value }
      })
    }
    refreshToken.remove()
    return { success: true }
  })
  .post('/refresh', async ({ body, set }) => {
    const { refreshToken } = body as { refreshToken: string }

    const { prisma } = await import('../utils/prisma')
    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true }
    })

    if (!storedToken || storedToken.expiresAt < new Date()) {
      set.status = 401
      return { error: { code: 'UNAUTHORIZED', message: 'Invalid or expired refresh token' } }
    }

    // Delete old refresh token (rotation)
    await prisma.refreshToken.delete({ where: { id: storedToken.id } })

    // Create new refresh token
    const newRefreshToken = uuidv4()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    await prisma.refreshToken.create({
      data: {
        token: newRefreshToken,
        userId: storedToken.userId,
        expiresAt
      }
    })

    // Load fresh permissions for the user
    const freshRole = await prisma.role.findUnique({ where: { name: storedToken.user.role } })
    const freshPermissions = freshRole?.permissions ?? []

    return {
      accessToken: `${storedToken.userId}:${storedToken.user.role}`, // Proper userId:role format
      refreshToken: newRefreshToken,
      user: {
        id: storedToken.user.id,
        email: storedToken.user.email,
        name: storedToken.user.name,
        role: storedToken.user.role,
        permissions: freshPermissions
      }
    }
  }, {
    body: t.Object({
      refreshToken: t.String()
    })
  })

export { authRoutes }