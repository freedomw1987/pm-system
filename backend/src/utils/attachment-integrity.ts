import { prisma } from './prisma'
import * as fs from 'fs'
import * as path from 'path'

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/app/uploads'

/**
 * Startup self-check: scan all Attachment rows and report any whose
 * storedPath file is missing on disk.
 *
 * Why this exists (v1.0.7 hotfix):
 *   - Prior to v1.0.7, backend container had NO volume mount on
 *     /app/uploads, so original uploaded files lived in the
 *     container's writable layer only.
 *   - Any container recreate (restart, image upgrade, `compose up -d`
 *     after a code change) wiped those files silently.
 *   - Attachment table rows survived (PostgreSQL is in a separate
 *     named volume), so the UI still showed "X attachments" but
 *     downloads returned 404.
 *   - This check surfaces that gap to operators at startup, so they
 *     know how many attachments are unreachable.
 *
 * IMPORTANT: this is DIAGNOSTIC, not a fix. We deliberately do NOT
 * delete orphan Attachment rows because:
 *   1. WikiPage.content (LLM-parsed Markdown) is still in PostgreSQL —
 *      the customer can still read the knowledge.
 *   2. Some "missing" files might be transient (eg. volume mount
 *      issue) — auto-deleting would be destructive.
 *   3. Customer can manually re-upload if they still have the source.
 *
 * The accompanying fix is `pm-system-uploads` named volume declared in
 * deploy/docker-compose.client.yml — from v1.0.7 onwards, NEW uploads
 * persist across container recreates.
 */
export async function checkAttachmentIntegrity(): Promise<{
  total: number
  missing: number
  missingPreview: Array<{ id: string; filename: string; entityType: string; storedPath: string }>
  uploadDirExists: boolean
}> {
  // If UPLOAD_DIR doesn't exist (eg. named volume never created), every
  // file is "missing" — but that's a config bug, not data loss. Distinguish.
  const uploadDirExists = fs.existsSync(UPLOAD_DIR)

  const attachments = await prisma.attachment.findMany({
    select: {
      id: true,
      filename: true,
      storedPath: true,
      entityType: true
    }
  })

  const missingPreview: Array<{ id: string; filename: string; entityType: string; storedPath: string }> = []
  let missing = 0
  for (const att of attachments) {
    const filePath = path.join(UPLOAD_DIR, att.storedPath)
    if (!fs.existsSync(filePath)) {
      missing++
      if (missingPreview.length < 5) {
        missingPreview.push({
          id: att.id,
          filename: att.filename,
          entityType: att.entityType,
          storedPath: att.storedPath
        })
      }
    }
  }

  return {
    total: attachments.length,
    missing,
    missingPreview,
    uploadDirExists
  }
}

/**
 * Log the integrity check result. Uses JSON format in production for
 * log aggregation; otherwise human-readable.
 */
export function logAttachmentIntegrity(result: Awaited<ReturnType<typeof checkAttachmentIntegrity>>) {
  const { total, missing, missingPreview, uploadDirExists } = result
  const isJson = process.env.NODE_ENV === 'production' || process.env.JSON_LOGS === 'true'

  if (total === 0) {
    // No attachments to check — stay quiet to avoid log noise on fresh installs.
    return
  }

  if (missing === 0) {
    if (isJson) {
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'INFO',
        event: 'ATTACHMENT_INTEGRITY_OK',
        total,
        uploadDir: UPLOAD_DIR
      }))
    } else {
      console.log(`[attachment-integrity] ✓ 全部 ${total} 個 attachment file 都喺度`)
    }
    return
  }

  // Some missing — that's the actionable case.
  if (isJson) {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'WARN',
      event: 'ATTACHMENT_INTEGRITY_MISSING',
      total,
      missing,
      uploadDir: UPLOAD_DIR,
      uploadDirExists,
      // If uploadDirExists === false, this is a config issue (volume
      // not mounted), not pre-existing data loss — flag it differently.
      likelyCause: uploadDirExists
        ? 'pre_v1.0.7_data_loss'        // volume exists but files don't → old data lost
        : 'volume_not_mounted',          // volume path doesn't even exist
      preview: missingPreview
    }))
  } else {
    console.warn(`\n[attachment-integrity] ⚠ ${missing}/${total} attachment file 唔見咗`)
    if (!uploadDirExists) {
      console.warn(`  UPLOAD_DIR ($UPLOAD_DIR) 都唔存在,似係 volume 冇 mount`)
      console.warn(`  check deploy/docker-compose.client.yml 嘅 backend:/app/uploads`)
    } else {
      console.warn(`  UPLOAD_DIR 存在但 file 唔見咗 → 大機會係升級前已遺失嘅 data`)
      console.warn(`  升級前嘅 wiki 上傳原本喺 container writable layer,隨 container`)
      console.warn(`  recreate 已經冇咗。Wiki 文字內容(LLM 整理過)依然喺 PostgreSQL,`)
      console.warn(`  客戶睇 wiki 文字冇影響,但 download 原始 file 會 404。`)
    }
    console.warn(`  頭 ${missingPreview.length} 個 missing attachment:`)
    for (const m of missingPreview) {
      console.warn(`    - [${m.entityType}] ${m.filename} (id=${m.id}, storedPath=${m.storedPath})`)
    }
    if (missing > missingPreview.length) {
      console.warn(`    ... 仲有 ${missing - missingPreview.length} 個`)
    }
    console.warn(`  新上傳由 v1.0.7+ 起會 persist 落 named volume pm-system-uploads\n`)
  }
}
