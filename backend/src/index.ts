import "dotenv/config";
import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors'
import { swagger } from '@elysiajs/swagger'
import { authRoutes } from './routes/auth'
import { authDerive } from './middleware/auth'
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
import { checkAttachmentIntegrity, logAttachmentIntegrity } from './utils/attachment-integrity'

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
  return role?.permissions ?? []
}

export async function refreshAllRolePermissions() {
  const prisma = getPrisma()
  const roles = await prisma.role.findMany({ select: { name: true, permissions: true } })
  return roles.map((r) => ({ name: r.name, permissions: r.permissions }))
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
  // TD-NEW-1 (Sprint 18):/health endpoint —— public,unauthed,畀 docker
  // healthcheck + load balancer probe 用。Ping DB(SELECT 1)確認唔係淨返 200
  // 但 backend stuck 喺 prisma pool 滿。返 200 即 service alive + db reachable。
  //
  // 點解唔放 /api/health:/api/* group 全部用 authDerive,呢條會被 401。
  // 紅線:健康 endpoint 必須 unauthed 否則 docker healthcheck 永遠 fail。
  .get('/health', async () => {
    try {
      await prisma.$queryRaw`SELECT 1`
      return { status: 'ok', db: 'ok', uptime: process.uptime() }
    } catch (err) {
      return new Response(
        JSON.stringify({ status: 'degraded', db: 'fail', error: String(err) }),
        { status: 503, headers: { 'Content-Type': 'application/json' } },
      )
    }
  })
  // Auth derive apply 喺 app level,令 /auth/* 同 /api/* 都攞到 user
  // (extract 去 middleware/auth.ts — 2026-06-09 修 /auth/change-password 永遠 401)
  // 注意: Elysia 嘅 .derive() 只影響「之後」.use() 嘅 routes,所以要放喺
  // .use(authRoutes) 之前先用得著 /auth/*。
  .derive(authDerive)
  // Public routes
  .use(authRoutes)
  // Protected routes
  .group('/api', (app) => app
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

// v1.0.7 hotfix: surface pre-existing attachment file loss at startup.
// Runs async / non-blocking — server keeps listening. Scan is O(N) over
// the Attachment table; on a typical PM deployment (hundreds to low
// thousands of attachments) completes in < 100ms. See
// src/utils/attachment-integrity.ts for full context on why this
// exists (pre-v1.0.7 deployments lost files on every container
// recreate because /app/uploads had no volume mount).
checkAttachmentIntegrity()
  .then(logAttachmentIntegrity)
  .catch((err) => {
    // Don't let a check failure crash startup — the server is already
    // listening. Just log so the operator knows the check itself broke.
    console.error('[attachment-integrity] check failed:', err?.message || err)
  })

// TD-010: Structured startup logs
if (process.env.NODE_ENV === 'production' || process.env.JSON_LOGS === 'true') {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'INFO',
    event: 'SERVER_START',
    url: 'http://localhost:4000',
    docs: 'http://localhost:4000/swagger'
  }))
} else {
  console.log(`🚀 PM System API running at http://localhost:4000`)
  console.log(`📚 Swagger docs at http://localhost:4000/swagger`)
}

export { app }