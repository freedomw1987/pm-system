/**
 * Shared permission utilities for PM System.
 * Centralizes all role-based UI checks — uses user.permissions from backend.
 */

import type { User } from '../types'

export function getUserPermissions(user: User | null | undefined): string[] {
  if (!user) return []
  if (user.permissions && Array.isArray(user.permissions)) return user.permissions
  return []
}

export function hasAnyPermission(user: User | null | undefined, permissions: string[]): boolean {
  if (!permissions || permissions.length === 0) return true
  if (!user) return false
  if (user.role === 'admin') return true
  const userPerms = getUserPermissions(user)
  return permissions.some(p => userPerms.includes(p))
}

export function hasPermission(user: User | null | undefined, permission: string): boolean {
  return hasAnyPermission(user, [permission])
}
