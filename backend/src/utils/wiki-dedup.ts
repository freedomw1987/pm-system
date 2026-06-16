import { prisma } from './prisma'

/**
 * Sprint 21 US-21.3: normalize a wiki page title for duplicate detection.
 * - lower-case
 * - trim
 * - collapse internal whitespace
 * - strip trailing punctuation
 * Same title from different file (e.g. "API 認證流程" vs "api  認證流程.") = duplicate.
 */
export function normalizeTitleForCompare(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[。.,，、:;!?]+$/g, '')
}

/**
 * Sprint 21 US-21.3: find an existing wiki page with the same normalized title
 * within the same project. Returns null if no match.
 */
export async function findExistingWikiPage(projectId: string, title: string) {
  if (!projectId || !title) return null
  const normalized = normalizeTitleForCompare(title)

  // PostgreSQL citext not available; use raw `mode: 'insensitive'` on a
  // pre-trimmed where. We then post-filter for whitespace/punctuation
  // normalization since Prisma can't express that in WHERE.
  const candidates = await prisma.wikiPage.findMany({
    where: {
      projectId,
      title: { contains: title.trim().slice(0, 200), mode: 'insensitive' }
    },
    select: { id: true, title: true, updatedAt: true, createdAt: true }
  })

  for (const c of candidates) {
    if (normalizeTitleForCompare(c.title) === normalized) {
      return c
    }
  }
  return null
}
