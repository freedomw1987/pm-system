import { Elysia, t } from 'elysia'
import { prisma } from '../utils/prisma'

const llmConfigRoutes = new Elysia({ prefix: '/llm-config' })
  // GET - fetch current config (no API key returned)
  .get('/', async ({ set }) => {
    const config = await prisma.lLMConfig.findFirst()
    if (!config) {
      set.status = 404
      return { error: { code: 'NOT_FOUND', message: 'LLM config not set. Please configure.' } }
    }
    // Don't expose apiKey or visionApiKey
    return {
      id: config.id,
      apiUrl: config.apiUrl,
      model: config.model,
      visionApiUrl: config.visionApiUrl || null,
      visionModel: config.visionModel || null,
      hasVisionKey: !!config.visionApiKey,
      updatedAt: config.updatedAt
    }
  })
  // GET - fetch audit logs (Admin only) — TD-007
  .get('/audit-logs', async ({ set, user }) => {
    if (!user || user.role !== 'admin') {
      set.status = 403
      return { error: { code: 'FORBIDDEN', message: 'Admin access required' } }
    }
    const logs = await prisma.lLMConfigAuditLog.findMany({
      orderBy: { timestamp: 'desc' },
      take: 100 // last 100 entries
    })
    return { logs }
  })
  // PUT - update config (Admin only)
  .put('/', async ({ body, set, user, request }) => {
    if (!user || user.role !== 'admin') {
      set.status = 403
      return { error: { code: 'FORBIDDEN', message: 'Admin access required' } }
    }

    const { apiUrl, apiKey, model, visionApiUrl, visionApiKey, visionModel } = body as {
      apiUrl: string
      apiKey?: string
      model: string
      visionApiUrl?: string
      visionApiKey?: string
      visionModel?: string
    }

    if (!apiUrl || !model) {
      set.status = 400
      return { error: { code: 'VALIDATION_ERROR', message: 'apiUrl and model are required' } }
    }

    // Get existing config for audit comparison
    const existing = await prisma.lLMConfig.findFirst()

    const data: any = {
      apiUrl,
      model
    }
    // Only update apiKey if provided (so existing key can be retained)
    if (apiKey) data.apiKey = apiKey
    // Vision LLM fields
    if (visionApiUrl !== undefined) data.visionApiUrl = visionApiUrl || null
    if (visionModel !== undefined) data.visionModel = visionModel || null
    if (visionApiKey) data.visionApiKey = visionApiKey

    const config = existing
      ? await prisma.lLMConfig.update({ where: { id: existing.id }, data })
      : await prisma.lLMConfig.create({ data })

    // ── TD-007: Write audit logs for sensitive field changes ──
    const ipAddress = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? null
    const userAgent = request.headers.get('user-agent') ?? null

    // Helper to mask API key: show last 4 chars
    const maskKey = (key: string | null | undefined) => {
      if (!key) return null
      return key.slice(0, 6) + '***' + key.slice(-4)
    }

    // Helper to write audit log entry
    const writeAuditLog = async (action: string, field: string, oldVal: string | null, newVal: string | null) => {
      await prisma.lLMConfigAuditLog.create({
        data: {
          actorId: user.id,
          actorName: user.name || user.email || 'admin',
          action,
          field,
          maskedValue: newVal ? maskKey(newVal) : null,
          oldValue: oldVal ? maskKey(oldVal) : null,
          newValue: newVal ? maskKey(newVal) : null,
          ipAddress,
          userAgent
        }
      })
    }

    // Compare and log changes
    if (existing) {
      if (apiKey && apiKey !== existing.apiKey) {
        await writeAuditLog('UPDATE_KEY', 'apiKey', existing.apiKey, apiKey)
      }
      if (visionApiKey && visionApiKey !== existing.visionApiKey) {
        await writeAuditLog('UPDATE_KEY', 'visionApiKey', existing.visionApiKey, visionApiKey)
      }
      if (apiUrl !== existing.apiUrl) {
        await writeAuditLog('UPDATE_CONFIG', 'apiUrl', existing.apiUrl, apiUrl)
      }
      if (model !== existing.model) {
        await writeAuditLog('UPDATE_CONFIG', 'model', existing.model, model)
      }
      if (visionApiUrl !== existing.visionApiUrl) {
        await writeAuditLog('UPDATE_CONFIG', 'visionApiUrl', existing.visionApiUrl || '', visionApiUrl || '')
      }
      if (visionModel !== existing.visionModel) {
        await writeAuditLog('UPDATE_CONFIG', 'visionModel', existing.visionModel || '', visionModel || '')
      }
    } else {
      // New config created
      await writeAuditLog('UPDATE_CONFIG', 'apiUrl', null, apiUrl)
      if (apiKey) await writeAuditLog('UPDATE_KEY', 'apiKey', null, apiKey)
    }

    return {
      id: config.id,
      apiUrl: config.apiUrl,
      model: config.model,
      visionApiUrl: config.visionApiUrl || null,
      visionModel: config.visionModel || null,
      hasVisionKey: !!config.visionApiKey,
      updatedAt: config.updatedAt
    }
  }, {
    body: t.Object({
      apiUrl: t.String(),
      apiKey: t.Optional(t.String()),
      model: t.String(),
      visionApiUrl: t.Optional(t.String()),
      visionApiKey: t.Optional(t.String()),
      visionModel: t.Optional(t.String())
    })
  })

export { llmConfigRoutes }