import { Elysia, t } from 'elysia'
import { prisma } from '../utils/prisma'
import { findExistingWikiPage } from '../utils/wiki-dedup'

const wikiRoutes = new Elysia({ prefix: '/wikis' })
  // List wiki pages — optional projectId filter, optional search
  .get('/', async ({ query, set, user }) => {
    if (!user) {
      set.status = 401
      return { error: { code: 'UNAUTHORIZED', message: 'Login required' } }
    }

    const { projectId, search } = query as { projectId?: string; search?: string }

    // Build where clause
    const where: any = {}
    if (projectId) where.projectId = projectId

    // Text search across title and content
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { content: { contains: search, mode: 'insensitive' } },
        { tags: { has: search } }
      ]
    }

    // Non-admin: only show pages from projects they are members of
    if (user.role !== 'admin') {
      const memberships = await prisma.projectMember.findMany({
        where: { userId: user.id },
        select: { projectId: true }
      })
      const projectIds = memberships.map(m => m.projectId)
      if (projectIds.length === 0) {
        return { pages: [] }
      }
      where.projectId = projectIds.length > 0 ? { in: projectIds } : undefined
      if (projectId && !projectIds.includes(projectId)) {
        return { pages: [] }
      }
      delete where.projectId // reset, apply via in filter below
      where.projectId = { in: projectIds }
    }

    const pages = await prisma.wikiPage.findMany({
      where,
      include: {
        createdBy: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } }
      },
      orderBy: { updatedAt: 'desc' }
    })

    return { pages }
  })
  // Get single wiki page
  .get('/:id', async ({ params, set, user }) => {
    if (!user) {
      set.status = 401
      return { error: { code: 'UNAUTHORIZED', message: 'Login required' } }
    }

    const page = await prisma.wikiPage.findUnique({
      where: { id: params.id },
      include: {
        createdBy: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } }
      }
    })

    if (!page) {
      set.status = 404
      return { error: { code: 'NOT_FOUND', message: 'Page not found' } }
    }

    // Check membership
    if (user.role !== 'admin') {
      const membership = await prisma.projectMember.findFirst({
        where: { projectId: page.projectId, userId: user.id }
      })
      if (!membership) {
        set.status = 403
        return { error: { code: 'FORBIDDEN', message: 'Not a project member' } }
      }
    }

    return { page }
  })
  // Create wiki page (or replace existing one if `replaceId` is provided)
  .post('/', async ({ body, set, user }) => {
    if (!user) {
      set.status = 401
      return { error: { code: 'UNAUTHORIZED', message: 'Login required' } }
    }

    const { projectId, title, content, tags, order, replaceId } = body as {
      projectId: string
      title: string
      content?: string
      tags?: string[]
      order?: number
      replaceId?: string
    }

    if (!projectId || !title) {
      set.status = 400
      return { error: { code: 'BAD_REQUEST', message: 'projectId and title are required' } }
    }

    // Check membership
    if (user.role !== 'admin') {
      const membership = await prisma.projectMember.findFirst({
        where: { projectId, userId: user.id }
      })
      if (!membership) {
        set.status = 403
        return { error: { code: 'FORBIDDEN', message: 'Not a project member' } }
      }
    }

    // Sprint 21 US-21.3: if `replaceId` is provided, UPDATE that page in place
    // (content + tags + title). This is the path the frontend takes after
    // confirming a duplicate upload. Skip the dup-check since user has
    // already chosen to update.
    if (replaceId) {
      const existing = await prisma.wikiPage.findUnique({ where: { id: replaceId } })
      if (!existing || existing.projectId !== projectId) {
        set.status = 404
        return { error: { code: 'NOT_FOUND', message: 'Page to replace not found in this project' } }
      }
      const page = await prisma.wikiPage.update({
        where: { id: replaceId },
        data: {
          title,
          content: content ?? existing.content,
          tags: tags ?? existing.tags
        },
        include: {
          createdBy: { select: { id: true, name: true } }
        }
      })
      return { page, replaced: true }
    }

    // Sprint 21 US-21.3: detect duplicate within same project.
    // If duplicate exists, refuse creation and tell frontend to ask the user
    // to call back with `replaceId`.
    const existingPage = await findExistingWikiPage(projectId, title)
    if (existingPage) {
      set.status = 409
      return {
        error: {
          code: 'DUPLICATE_PAGE',
          message: '同項目內已有同名 Wiki 頁面',
          existingPage
        }
      }
    }

    const page = await prisma.wikiPage.create({
      data: {
        projectId,
        title,
        content: content || '',
        tags: tags || [],
        order: order || 0,
        createdById: user.id
      },
      include: {
        createdBy: { select: { id: true, name: true } }
      }
    })

    return { page }
  }, {
    body: t.Object({
      projectId: t.String(),
      title: t.String(),
      content: t.Optional(t.String()),
      tags: t.Optional(t.Array(t.String())),
      order: t.Optional(t.Number()),
      replaceId: t.Optional(t.String())
    })
  })
  // Update wiki page
  .put('/:id', async ({ params, body, set, user }) => {
    if (!user) {
      set.status = 401
      return { error: { code: 'UNAUTHORIZED', message: 'Login required' } }
    }

    const { title, content, tags, order } = body as {
      title?: string
      content?: string
      tags?: string[]
      order?: number
    }

    const existing = await prisma.wikiPage.findUnique({ where: { id: params.id } })
    if (!existing) {
      set.status = 404
      return { error: { code: 'NOT_FOUND', message: 'Page not found' } }
    }

    // Check membership
    if (user.role !== 'admin') {
      const membership = await prisma.projectMember.findFirst({
        where: { projectId: existing.projectId, userId: user.id }
      })
      if (!membership) {
        set.status = 403
        return { error: { code: 'FORBIDDEN', message: 'Not a project member' } }
      }
    }

    const page = await prisma.wikiPage.update({
      where: { id: params.id },
      data: {
        ...(title !== undefined && { title }),
        ...(content !== undefined && { content }),
        ...(tags !== undefined && { tags }),
        ...(order !== undefined && { order })
      },
      include: {
        createdBy: { select: { id: true, name: true } }
      }
    })

    return { page }
  })
  // Delete wiki page
  .delete('/:id', async ({ params, set, user }) => {
    if (!user) {
      set.status = 401
      return { error: { code: 'UNAUTHORIZED', message: 'Login required' } }
    }

    const existing = await prisma.wikiPage.findUnique({ where: { id: params.id } })
    if (!existing) {
      set.status = 404
      return { error: { code: 'NOT_FOUND', message: 'Page not found' } }
    }

    // Check membership
    if (user.role !== 'admin') {
      const membership = await prisma.projectMember.findFirst({
        where: { projectId: existing.projectId, userId: user.id }
      })
      if (!membership) {
        set.status = 403
        return { error: { code: 'FORBIDDEN', message: 'Not a project member' } }
      }
    }

    await prisma.wikiPage.delete({ where: { id: params.id } })

    return { success: true }
  })

export default wikiRoutes