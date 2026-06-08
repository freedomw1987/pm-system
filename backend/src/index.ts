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
import { departmentRoutes } from './routes/departments'
import wikiRoutes from './routes/wikis'
import { llmConfigRoutes } from './routes/llm-config'
import { documentRoutes } from './routes/documents'
import { chatRoutes } from './routes/chat'
import { agentRoutes } from './routes/agents'
import { tokenLogRoutes } from './routes/tokenlogs'
import { agentWebSocketRoutes, agentManagementRoutes, agentHealthRoutes } from './agent/runtime'
import { PrismaClient } from '@prisma/client'
import { prisma } from './utils/prisma'
import { setRolePermissions } from './middleware/permission'

// ─── Role permissions loader (RG-007 fix) ─────────────────────────────────────
// No in-memory cache — RBAC changes take effect immediately for all users.
// 1-2ms per request overhead is acceptable for internal PM system (traffic low).
// Permission array queried fresh from DB on every authenticated request.

function getPrisma(): PrismaClient {
  return prisma
}

async function loadRolePermissions(roleName: string): Promise<string[]> {
  const prisma = getPrisma()
  const role = await prisma.role.findUnique({ where: { name: roleName } })
  const permissions = role?.permissions ?? []
  // Sync to middleware map (hasPermission reads from user.permissions directly,
  // but we keep middleware map for any future readers + backward compat)
  setRolePermissions(roleName, permissions)
  return permissions
}

export async function refreshAllRolePermissions() {
  const prisma = getPrisma()
  const roles = await prisma.role.findMany({ select: { name: true, permissions: true } })
  for (const role of roles) {
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

        // Load agent info + validate user actually exists (TD-011 fix)
        // 唔加呢行 → fake UUID token 過 derive hook,route handler 之後撞
        // `prisma.user.create / project.create` FK constraint 然後 throw 500
        const prisma = getPrisma()
        const dbUser = await prisma.user.findUnique({
          where: { id: userId },
          select: { isAgent: true, agentConfig: true, role: true }
        })
        if (!dbUser) {
          // Token format valid 但 user 真實唔存在 → 視為 auth-missing
          return { user: null }
        }

        // Load permissions for this role from DB (no cache — RG-007)
        // 改完 role permissions 即時生效,唔再需要 docker compose restart
        const effectiveRole = dbUser.role || role || 'developer'
        const permissions = await loadRolePermissions(effectiveRole)

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
        // 任何 prisma / DB error 都要 graceful fall-through
        // (TD-011 同類 — 唔好 leak 500)
        console.error('[auth derive] unexpected error:', err)
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
    .use(departmentRoutes)
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