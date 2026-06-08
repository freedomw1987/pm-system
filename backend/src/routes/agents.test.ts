/**
 * Agent claim-task logic test
 *
 * 涵蓋 US-9.2 (P0): "作為 Agent,我可以自動認領可執行嘅任務"
 * 同 RG-001 (commit 3938a2d) regression guard。
 *
 * 從 routes/agents.ts claim-task handler derive 嘅 pure validation logic:
 *   - 認領前先 check status=pending
 *   - 認領前先 check assigneeId=null
 *   - 認領 user 必須係 agent(擁有 isAgent=true)或擁有 tasks.claim permission
 *
 * Pure function,唔 mock DB,守住 invariant 即可。
 */

import { describe, expect, test } from 'bun:test'
import { hasPermission, type AuthUser } from '../middleware/permission'

/** 模擬 task 嘅最小 subset */
interface TaskSnapshot {
  status: string
  assigneeId: string | null
}

/** 決定一個 user 係咪可以 claim task */
export function canClaimTask(
  user: AuthUser | null,
  isAgentFlag: boolean | null | undefined,
  task: TaskSnapshot
): { ok: true } | { ok: false; code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'BAD_REQUEST'; message: string } {
  if (!user) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Authentication required' }
  }
  if (!isAgentFlag && !hasPermission(user, 'tasks.claim')) {
    return {
      ok: false,
      code: 'FORBIDDEN',
      message: 'Only agents can claim tasks or tasks.claim permission required',
    }
  }
  if (task.status !== 'pending') {
    return {
      ok: false,
      code: 'BAD_REQUEST',
      message: `Task is not available. Current status: ${task.status}`,
    }
  }
  if (task.assigneeId) {
    return { ok: false, code: 'BAD_REQUEST', message: 'Task is already assigned' }
  }
  return { ok: true }
}

describe('Agent claim-task validation (US-9.2, RG-001 guard)', () => {
  test('agent with isAgent=true can claim a pending unassigned task', () => {
    const agent: AuthUser = { id: 'a-1', role: 'developer', isAgent: true }
    const task: TaskSnapshot = { status: 'pending', assigneeId: null }
    expect(canClaimTask(agent, true, task)).toEqual({ ok: true })
  })

  test('non-agent user with tasks.claim permission can claim', () => {
    const pm: AuthUser = {
      id: 'p-1',
      role: 'pm',
      permissions: ['tasks.claim'],
    }
    const task: TaskSnapshot = { status: 'pending', assigneeId: null }
    expect(canClaimTask(pm, false, task)).toEqual({ ok: true })
  })

  test('non-agent user without tasks.claim permission is forbidden', () => {
    const viewer: AuthUser = {
      id: 'v-1',
      role: 'visitor',
      permissions: ['projects.view'],
    }
    const task: TaskSnapshot = { status: 'pending', assigneeId: null }
    const result = canClaimTask(viewer, false, task)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('FORBIDDEN')
    }
  })

  test('null user gets UNAUTHORIZED', () => {
    const task: TaskSnapshot = { status: 'pending', assigneeId: null }
    const result = canClaimTask(null, null, task)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('UNAUTHORIZED')
    }
  })

  test('cannot claim task in_progress (regression for double-claim race)', () => {
    const agent: AuthUser = { id: 'a-2', role: 'developer', isAgent: true }
    const task: TaskSnapshot = { status: 'in_progress', assigneeId: null }
    const result = canClaimTask(agent, true, task)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('BAD_REQUEST')
      expect(result.message).toContain('in_progress')
    }
  })

  test('cannot claim already-assigned task even if pending (regression)', () => {
    const agent: AuthUser = { id: 'a-3', role: 'developer', isAgent: true }
    const task: TaskSnapshot = { status: 'pending', assigneeId: 'someone-else' }
    const result = canClaimTask(agent, true, task)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('BAD_REQUEST')
      expect(result.message).toContain('already assigned')
    }
  })

  test('cannot claim completed task', () => {
    const agent: AuthUser = { id: 'a-4', role: 'developer', isAgent: true }
    const task: TaskSnapshot = { status: 'completed', assigneeId: null }
    const result = canClaimTask(agent, true, task)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('BAD_REQUEST')
    }
  })

  /**
   * Agent user 嘅 isAgent 來自 DB lookup 結果,有可能查唔到(null)。
   * Source code 嘅 hasPermission 喺 admin 會 bypass,所以 admin 永遠 can claim
   * (因為 hasPermission 內部 admin → true)。呢個 case 守住:
   * 「即使 isAgent 查唔到,admin 仍然可以 claim」(graceful degradation)
   */
  test('admin user bypasses isAgent check via hasPermission admin bypass', () => {
    // admin role → hasPermission returns true 喺任何 permission → canClaimTask 過
    const admin: AuthUser = { id: 'admin-1', role: 'admin' }
    const task: TaskSnapshot = { status: 'pending', assigneeId: null }
    const result = canClaimTask(admin, null, task)
    expect(result.ok).toBe(true) // admin bypass
  })

  /**
   * User with isAgent=true but role !== 'admin' 仍然可以 claim
   * (因為 canClaimTask 第一個 check: isAgent 為 true 即過)
   */
  test('agent flag (isAgent=true) is sufficient regardless of role', () => {
    const agent: AuthUser = { id: 'a-5', role: 'visitor', isAgent: true } // role=visitor 但係 agent
    const task: TaskSnapshot = { status: 'pending', assigneeId: null }
    expect(canClaimTask(agent, true, task)).toEqual({ ok: true })
  })
})
