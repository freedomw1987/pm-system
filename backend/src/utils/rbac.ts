import { prisma } from '../utils/prisma'

/**
 * Check if a user has a specific role in a specific project.
 * Admin bypasses all project-level checks.
 */
export async function checkProjectRole(
  userId: string,
  userRole: string,
  projectId: string,
  requiredRoles: string[]
): Promise<boolean> {
  // Admin bypass
  if (userRole === 'admin') return true

  // Check project membership
  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } }
  })

  if (!membership) return false
  return requiredRoles.includes(membership.role)
}

/**
 * Get user's role in a specific project (or their global role if admin)
 */
export async function getUserProjectRole(userId: string, userRole: string, projectId: string): Promise<string | null> {
  if (userRole === 'admin') return 'admin'

  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } }
  })

  return membership?.role || null
}