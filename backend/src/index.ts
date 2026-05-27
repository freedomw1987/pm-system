import "dotenv/config";
import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors'
import { swagger } from '@elysiajs/swagger'
import { authRoutes } from './routes/auth'
import { userRoutes } from './routes/users'
import { projectRoutes } from './routes/projects'
import { requirementRoutes } from './routes/requirements'
import { taskRoutes } from './routes/tasks'
import { bugRoutes } from './routes/bugs'
import { workLogRoutes } from './routes/worklogs'
import { reportRoutes } from './routes/reports'
import { attachmentRoutes } from './routes/attachments'
import { roleRoutes } from './routes/roles'
import wikiRoutes from './routes/wikis'
import { llmConfigRoutes } from './routes/llm-config'
import { documentRoutes } from './routes/documents'
import { chatRoutes } from './routes/chat'
import { agentRoutes } from './routes/agents'
import { tokenLogRoutes } from './routes/tokenlogs'
import { agentWebSocketRoutes, agentManagementRoutes, agentHealthRoutes } from './agent/runtime'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { setRolePermissions } from './middleware/permission'

// ─── In-memory role permissions cache ────────────────────────────────────────
// Loaded from DB once per role. Managed by index.ts. Callers use setRolePermissions().
const rolePermissionCache = new Map<string, string[]>()
let prismaInstance: PrismaClient | null = null

function getPrisma(): PrismaClient {
  if (!prismaInstance) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL })
    const adapter = new PrismaPg(pool)
    prismaInstance = new PrismaClient({ adapter })
  }
  return prismaInstance
}

async function loadRolePermissions(roleName: string): Promise<string[]> {
  const cached = rolePermissionCache.get(roleName)
  if (cached !== undefined) return cached

  const prisma = getPrisma()
  const role = await prisma.role.findUnique({ where: { name: roleName } })
  const permissions = role?.permissions ?? []
  rolePermissionCache.set(roleName, permissions)
  // Also sync to middleware cache (single source of truth)
  setRolePermissions(roleName, permissions)
  return permissions
}

export async function refreshAllRolePermissions() {
  rolePermissionCache.clear()
  const prisma = getPrisma()
  const roles = await prisma.role.findMany({ select: { name: true, permissions: true } })
  for (const role of roles) {
    rolePermissionCache.set(role.name, role.permissions)
    setRolePermissions(role.name, role.permissions)
  }
}

// ─── Auth derive ──────────────────────────────────────────────────────────────
const app = new Elysia()
  .use(cors({
    origin: '*',
    credentials: true
  }))
  .use(swagger({
    documentation: {
      info: {
        title: 'PM System API',
        version: '1.0.0',
        description: 'Internal Project Management System API'
      }
    }
  }))
  // Increase body size limit for file uploads (50MB)
  .onParse(({ request }, contentType) => {
    if (contentType === 'multipart/form-data' || request.headers.get('content-type')?.includes('multipart/form-data')) {
      // Let Elysia handle it, but we validate size in the route handler
    }
  })
  // Public routes
  .use(authRoutes)
  // Protected routes
  .group('/api', (app) => app
    .derive(async ({ headers }) => {
      const authHeader = headers.authorization
      if (!authHeader?.startsWith('Bearer ')) {
        return { user: null }
      }
      const token = authHeader.slice(7)
      try {
        const [userId, role] = token.split(':')
        if (!userId) return { user: null }

        // Load permissions for this role from cache/DB
        const permissions = role ? await loadRolePermissions(role) : []

        // Load agent info if applicable
        const prisma = getPrisma()
        const dbUser = await prisma.user.findUnique({
          where: { id: userId },
          select: { isAgent: true, agentConfig: true }
        })

        return {
          user: {
            id: userId,
            role: role || 'developer',
            permissions,
            isAgent: dbUser?.isAgent ?? false,
            agentConfig: dbUser?.agentConfig ?? null
          }
        }
      } catch {
        return { user: null }
      }
    })
    .use(userRoutes)
    .use(projectRoutes)
    .use(requirementRoutes)
    .use(taskRoutes)
    .use(bugRoutes)
    .use(workLogRoutes)
    .use(reportRoutes)
    .use(attachmentRoutes)
    .use(roleRoutes)
    .use(wikiRoutes)
    .use(llmConfigRoutes)
    .use(documentRoutes)
    .use(chatRoutes)
    .use(agentRoutes)
    .use(tokenLogRoutes)
    .use(agentManagementRoutes)
    .use(agentHealthRoutes)
  )
  // WebSocket endpoint for agents
  .use(agentWebSocketRoutes)
  .listen(4000)

// Warm up cache at startup
refreshAllRolePermissions().catch(console.error)

console.log(`🚀 PM System API running at http://localhost:4000`)
console.log(`📚 Swagger docs at http://localhost:4000/swagger`)

export { app }