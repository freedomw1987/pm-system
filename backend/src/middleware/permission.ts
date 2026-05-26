/**
 * Permission middleware for PM System
 * 
 * All permission checks go through this module.
 * The `user.permissions` array is loaded from the DB Role.permissions
 * in the auth derive hook (index.ts) and cached in-memory.
 * 
 * Usage in routes:
 *   if (!hasPermission(user, 'projects.create')) { ... }
 *   return requirePermission(user, 'reports.view', set)
 */

export type Permission =
  | 'projects.view' | 'projects.create' | 'projects.edit' | 'projects.delete'
  | 'requirements.view' | 'requirements.create' | 'requirements.edit' | 'requirements.delete'
  | 'tasks.view' | 'tasks.create' | 'tasks.edit' | 'tasks.delete' | 'tasks.assign' | 'tasks.claim'
  | 'bugs.view' | 'bugs.create' | 'bugs.edit' | 'bugs.delete' | 'bugs.resolve'
  | 'worklogs.view' | 'worklogs.create' | 'worklogs.edit' | 'worklogs.delete' | 'worklogs.export'
  | 'reports.view' | 'reports.export'
  | 'users.view' | 'users.create' | 'users.edit' | 'users.delete' | 'users.assign_roles'
  | 'roles.view' | 'roles.create' | 'roles.edit' | 'roles.delete'
  | 'agents.view' | 'agents.create' | 'agents.edit' | 'agents.delete'
  | 'tokenlogs.view' | 'tokenlogs.create'

export interface AuthUser {
  id: string
  role: string
  permissions?: string[]
  isAgent?: boolean
  agentConfig?: any
}

/**
 * Global cache for role permissions. Exported so index.ts can manage it.
 * Map<roleName, permissions[]>
 */
export const rolePermissionCache = new Map<string, string[]>()

export function setRolePermissions(roleName: string, permissions: string[]) {
  rolePermissionCache.set(roleName, permissions)
}

export function invalidateRolePermissions(roleName?: string) {
  if (roleName) {
    rolePermissionCache.delete(roleName)
  } else {
    rolePermissionCache.clear()
  }
}

/**
 * Check if the user has a specific permission.
 * Falls back to true for admin role (admin has all permissions).
 */
export function hasPermission(user: AuthUser | null | undefined, permission: Permission | string): boolean {
  if (!user) return false
  if (user.role === 'admin') return true
  return user.permissions?.includes(permission) ?? false
}

/**
 * Check if user has ALL of the given permissions.
 */
export function hasAllPermissions(user: AuthUser | null | undefined, permissions: string[]): boolean {
  return permissions.every(p => hasPermission(user, p))
}

/**
 * Check if user has ANY of the given permissions.
 */
export function hasAnyPermission(user: AuthUser | null | undefined, permissions: string[]): boolean {
  return permissions.some(p => hasPermission(user, p))
}

/**
 * Returns an error response if permission check fails.
 * Use as: `const denied = requirePermission(user, 'reports.view', set); if (denied) return denied`
 */
export function requirePermission(
  user: AuthUser | null | undefined,
  permission: Permission | string,
  set: any
): { error: { code: string; message: string } } | null {
  if (!hasPermission(user, permission)) {
    set.status = 403
    return {
      error: {
        code: 'FORBIDDEN',
        message: `Permission denied: '${permission}' is required`
      }
    }
  }
  return null
}

/**
 * Require any one of the given permissions.
 */
export function requireAnyPermission(
  user: AuthUser | null | undefined,
  permissions: string[],
  set: any
): { error: { code: string; message: string } } | null {
  if (!hasAnyPermission(user, permissions)) {
    set.status = 403
    return {
      error: {
        code: 'FORBIDDEN',
        message: `One of these permissions is required: ${permissions.join(', ')}`
      }
    }
  }
  return null
}