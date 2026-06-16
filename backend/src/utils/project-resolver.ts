/**
 * Project identifier resolver — Sprint 21 US-21.6
 *
 * The AI assistant tools accept a `projectId` argument, but LLMs frequently
 * pass project NAMES (e.g. "範例項目") instead of UUIDs because that's what
 * users say in natural language. This helper accepts either:
 *   1. A UUID — match `prisma.project.findUnique({where:{id}})` exactly
 *   2. A project NAME — match case-insensitive `equals` first, then
 *      case-insensitive `contains` as fallback
 *
 * Returns the resolved project (id + name) or a structured error. The
 * caller is responsible for membership / admin checks (delegated to
 * `assertProjectAccess` so behavior is identical to the ID-only path).
 */

import { prisma } from './prisma'

export type ResolvedProject = { id: string; name: string }

/**
 * Detect whether a string looks like a UUID. We accept both 8-4-4-4-12 and
 * 8-4-4-4-12 hex format. Any 36-char string with hyphens at positions
 * 8/13/18/23 is treated as an ID attempt.
 */
export function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

export type ResolveResult =
  | { ok: true; project: ResolvedProject; resolvedBy: 'id' | 'name-exact' | 'name-contains' }
  | { ok: false; status: 404 | 400; code: 'NOT_FOUND' | 'INVALID'; message: string }

/**
 * Resolve a project identifier (UUID or name) to a project.
 *
 * @param identifier UUID string, or partial/full project name
 * @param opts.userRole when 'admin', no name disambiguation is needed across
 *                      projects. Non-admin users get case-insensitive match
 *                      restricted to projects they are members of.
 * @param opts.userId   for non-admin scoping to member projects
 */
export async function resolveProjectIdentifier(
  identifier: string,
  opts: { userRole?: string; userId?: string } = {}
): Promise<ResolveResult> {
  if (!identifier || !identifier.trim()) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID',
      message: 'projectId / projectName 不可為空'
    }
  }

  const trimmed = identifier.trim()

  // ── Path 1: UUID-like → try findUnique first ──────────────────────────
  if (isUuidLike(trimmed)) {
    const project = await prisma.project.findUnique({
      where: { id: trimmed },
      select: { id: true, name: true }
    })
    if (project) return { ok: true, project, resolvedBy: 'id' }
    // Fall through to name resolution — LLM might have given a name that
    // happens to look UUID-shaped (rare but possible)
  }

  // ── Path 2: name match ───────────────────────────────────────────────
  // For non-admin, scope to member projects to avoid leaking project names
  // the user shouldn't know about.
  const baseWhere: any = { name: { equals: trimmed, mode: 'insensitive' as const } }
  if (opts.userRole && opts.userRole !== 'admin' && opts.userId) {
    baseWhere.members = { some: { userId: opts.userId } }
  }

  let candidate = await prisma.project.findFirst({
    where: baseWhere,
    select: { id: true, name: true }
  })
  if (candidate) return { ok: true, project: candidate, resolvedBy: 'name-exact' }

  // ── Path 3: contains fallback (partial match) ────────────────────────
  const containsWhere: any = { name: { contains: trimmed, mode: 'insensitive' as const } }
  if (opts.userRole && opts.userRole !== 'admin' && opts.userId) {
    containsWhere.members = { some: { userId: opts.userId } }
  }
  candidate = await prisma.project.findFirst({
    where: containsWhere,
    select: { id: true, name: true },
    orderBy: { name: 'asc' }
  })
  if (candidate) return { ok: true, project: candidate, resolvedBy: 'name-contains' }

  return {
    ok: false,
    status: 404,
    code: 'NOT_FOUND',
    message: `找不到名為「${trimmed}」的項目,亦冇對應 ID。請檢查項目名稱或詢問管理員。`
  }
}

/**
 * List project names accessible to a user — used to build a helpful error
 * message when resolution fails. Admin sees all; non-admin sees only
 * member projects. Capped at 20 to keep error messages readable.
 */
export async function listAccessibleProjectNames(
  userId: string,
  userRole: string,
  limit = 20
): Promise<string[]> {
  if (userRole === 'admin') {
    const projects = await prisma.project.findMany({
      select: { name: true },
      orderBy: { name: 'asc' },
      take: limit
    })
    return projects.map(p => p.name)
  }
  const memberships = await prisma.projectMember.findMany({
    where: { userId },
    select: { project: { select: { name: true } } },
    orderBy: { project: { name: 'asc' } },
    take: limit
  })
  return memberships.map(m => m.project.name)
}
