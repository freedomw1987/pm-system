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
  // PUT - update config (Admin only)
  .put('/', async ({ body, set, user }) => {
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

    // Upsert: update existing or create new
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