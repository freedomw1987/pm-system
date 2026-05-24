import { Elysia, t } from 'elysia'
import { prisma } from '../utils/prisma'

const wikiRoutes = new Elysia({ prefix: '/wikis' })
  // List all wiki pages for a project (any project member can view)
  .get('/', async ({ query, set, user }) => {
    const { projectId } = query as { projectId: string }

    if (!user) {
      set.status = 401
      return { error: { code: 'UNAUTHORIZED', message: 'Login required' } }
    }

    if (!projectId) {
      set.status = 400
      return { error: { code: 'BAD_REQUEST', message: 'projectId is required' } }
    }

    // Check membership (admin sees all)
    if (user.role !== 'admin') {
      const membership = await prisma.projectMember.findFirst({
        where: { projectId, userId: user.id }
      })
      if (!membership) {
        set.status = 403
        return { error: { code: 'FORBIDDEN', message: 'Not a project member' } }
      }
    }

    const pages = await prisma.wikiPage.findMany({
      where: { projectId },
      include: {
        createdBy: { select: { id: true, name: true } }
      },
      orderBy: { order: 'asc' }
    })

    return { pages }
  })
  // Get single wiki page
  .get('/:id', async ({ params, set, user }) => {
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

    if (!user) {
      set.status = 401
      return { error: { code: 'UNAUTHORIZED', message: 'Login required' } }
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
  // Create wiki page (any project member can create)
  .post('/', async ({ body, set, user }) => {
    const { projectId, title, content, order } = body as {
      projectId: string
      title: string
      content?: string
      order?: number
    }

    if (!user) {
      set.status = 401
      return { error: { code: 'UNAUTHORIZED', message: 'Login required' } }
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

    const page = await prisma.wikiPage.create({
      data: {
        projectId,
        title,
        content: content || '',
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
      order: t.Optional(t.Number())
    })
  })
  // Update wiki page
  .put('/:id', async ({ params, body, set, user }) => {
    const { title, content, order } = body as {
      title?: string
      content?: string
      order?: number
    }

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

    const page = await prisma.wikiPage.update({
      where: { id: params.id },
      data: {
        ...(title !== undefined && { title }),
        ...(content !== undefined && { content }),
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