import { Elysia, t } from 'elysia'
import { prisma } from '../utils/prisma'
import { v4 as uuidv4 } from 'uuid'
import * as fs from 'fs'
import * as path from 'path'
import { hasPermission } from '../middleware/permission'

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/app/uploads'

const attachmentRoutes = new Elysia({ prefix: '/attachments' })
  // Upload attachment
  .post('/upload',
    async ({ body, set, user }) => {
      const { file, entityType, entityId } = body as { file: any; entityType: string; entityId: string }

      if (!file || !entityType || !entityId) {
        set.status = 400
        return { error: { code: 'VALIDATION_ERROR', message: 'file, entityType, and entityId are required' } }
      }

      // Upload requires user to be authenticated
      if (!user) {
        set.status = 401
        return { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }
      }

      if (!['requirement', 'task', 'project', 'wiki'].includes(entityType)) {
        set.status = 400
        return { error: { code: 'VALIDATION_ERROR', message: 'entityType must be "requirement", "task", "project", or "wiki"' } }
      }

      // For project and wiki attachments, entityId is the projectId/wikiId
      const projectId = ['project', 'wiki'].includes(entityType) ? entityId : null

      // Get file data from ElysiaFile (Bun) or standard File/Blob
      let fileBuffer: Buffer
      let fileName: string
      let mimeType: string
      let fileSize: number

      if (file && typeof file === 'object' && 'path' in file && typeof (file as any).path === 'string') {
        // ElysiaFile (Bun) - file stored at temp path
        const filePath = (file as any).path
        fileName = path.basename(filePath)
        const stats = fs.statSync(filePath)
        fileSize = stats.size
        const ext = path.extname(filePath).toLowerCase()
        const mimeTypes: Record<string, string> = {
          '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
          '.gif': 'image/gif', '.webp': 'image/webp', '.pdf': 'application/pdf',
          '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          '.txt': 'text/plain', '.md': 'text/markdown'
        }
        mimeType = mimeTypes[ext] || 'application/octet-stream'
        fileBuffer = fs.readFileSync(filePath)
      } else if (file && typeof file === 'object') {
        // Standard File/Blob - read content via arrayBuffer
        fileName = file.name || file.filename || 'unknown'
        mimeType = file.type || 'application/octet-stream'
        fileSize = file.size || 0
        const arrayBuffer = await file.arrayBuffer()
        fileBuffer = Buffer.from(arrayBuffer)
      } else {
        set.status = 400
        return { error: { code: 'VALIDATION_ERROR', message: 'file is required and must be a valid file object' } }
      }

      // Generate stored filename
      const ext = path.extname(fileName)
      const storedFilename = `${uuidv4()}${ext}`
      const storedPath = path.join(UPLOAD_DIR, storedFilename)

      // Ensure upload directory exists
      if (!fs.existsSync(UPLOAD_DIR)) {
        fs.mkdirSync(UPLOAD_DIR, { recursive: true })
      }

      // Write file
      fs.writeFileSync(storedPath, fileBuffer)

      // Create database record
      const attachment = await prisma.attachment.create({
        data: {
          entityType,
          entityId,
          filename: fileName,
          storedPath: storedFilename,
          mimeType,
          fileSize,
          uploadedById: user.id,
          ...(projectId && { projectId })
        }
      })

      return {
        id: attachment.id,
        filename: attachment.filename,
        storedPath: attachment.storedPath,
        mimeType: attachment.mimeType,
        fileSize: attachment.fileSize
      }
    }
  )
  // Download attachment
  .get('/:id', async ({ params, set }) => {
    const attachment = await prisma.attachment.findUnique({
      where: { id: params.id }
    })

    if (!attachment) {
      set.status = 404
      return { error: { code: 'NOT_FOUND', message: 'Attachment not found' } }
    }

    const filePath = path.join(UPLOAD_DIR, attachment.storedPath)
    if (!fs.existsSync(filePath)) {
      set.status = 404
      return { error: { code: 'NOT_FOUND', message: 'File not found' } }
    }

    const file = fs.readFileSync(filePath)
    return new Response(file, {
      headers: {
        'Content-Type': attachment.mimeType,
        'Content-Disposition': `attachment; filename="${attachment.filename}"`
      }
    })
  })
  // Get attachments for an entity
  .get('/entity/:type/:id', async ({ params }) => {
    const attachments = await prisma.attachment.findMany({
      where: {
        entityType: params.type,
        entityId: params.id
      },
      include: {
        uploadedBy: { select: { id: true, name: true } }
      },
      orderBy: { createdAt: 'desc' }
    })

    return { attachments }
  })
  // Get attachments for a project
  .get('/project/:projectId', async ({ params }) => {
    const attachments = await prisma.attachment.findMany({
      where: {
        projectId: params.projectId
      },
      include: {
        uploadedBy: { select: { id: true, name: true } }
      },
      orderBy: { createdAt: 'desc' }
    })

    return { attachments }
  })
  // Delete attachment
  .delete('/:id', async ({ params, set, user }) => {
    if (!user) {
      set.status = 401
      return { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }
    }

    const attachment = await prisma.attachment.findUnique({
      where: { id: params.id }
    })

    if (!attachment) {
      set.status = 404
      return { error: { code: 'NOT_FOUND', message: 'Attachment not found' } }
    }

    // Only uploader or admin can delete
    if (!hasPermission(user, 'projects.delete') && user.role !== 'admin' && attachment.uploadedById !== user.id) {
      set.status = 403
      return { error: { code: 'FORBIDDEN', message: "Permission denied: 'projects.delete' is required" } }
    }

    // Delete file
    const filePath = path.join(UPLOAD_DIR, attachment.storedPath)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }

    // Delete database record
    await prisma.attachment.delete({ where: { id: params.id } })

    return { success: true }
  })

export { attachmentRoutes }