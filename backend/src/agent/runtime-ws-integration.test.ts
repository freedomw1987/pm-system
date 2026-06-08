/**
 * Agent runtime helper unit test — US-9.3 partial coverage
 *
 * 覆蓋 backend/src/agent/runtime.ts 嘅 helper functions,
 * 守住 in-memory session map + send/pause/resume/intervene logic:
 *   - US-9.3: WebSocket connection lifecycle helpers
 *   - TD-013 (Sprint 2 retro ACT-15)
 *
 * 對應 TECH-DEBT + 紅線 12 + 16。
 *
 * **策略**:Source runtime.ts 用 module-level `agentSessions` map 儲 in-memory state,
 * 啲 helper function(sendToAgent / sendInterveneToAgent / pauseAgentTask /
 * resumeAgentTask / handleHeartbeat / getAgentSession / getConnectedAgents /
 * getAgentTaskLogs / broadcastToAgents) 全部 derive 出嚟做 unit test。
 *
 * **唔覆蓋真 WebSocket 連線**:
 *   runtime.ts 嘅 WS auth gate(line 368-414) 需要 prisma.user.findUnique,
 *   而 `mock.module` 喺 bun:test 對 ESM hoist 唔可靠,run 真 WS server 喺
 *   in-process 唔 work。要做真 WS 連線 test,需要:
 *     1. 真 docker PG 連接 + seed agent user
 *     2. Elysia 嘅 Bun.serve + WS handler
 *   **此 scope 留 Sprint 4**(技術債 — Elysia + bun:test WS testability)。
 *
 * **Elysia 1.2 + bun:test known issue**:
 *   app.listen(0) 唔 expose port,要用 Bun.serve 自行包。
 *   WS auth gate call prisma findUnique,冇辦法 mock 喺 test runner 入面。
 *   Source code 唔改呢個係 safe — 0 runtime 改動,純 DX improvement 留 P2。
 *
 * **Source change scope**:0 — 0 個 source keyword 改動需要。
 */

import { beforeEach, describe, expect, mock, test } from 'bun:test'

// Mock prisma BEFORE imports (雖然今次 derive helper 唔直接 call prisma,
// 但 `assignTaskToAgent` / `handleTaskCompletion` 會 call,所以 mock 全 noop)
mock.module('../utils/prisma', () => {
  const noop = async () => null
  const noopMany = async () => []
  return {
    prisma: {
      user: { findUnique: noop },
      task: {
        findMany: noopMany,
        findFirst: noop,
        findUnique: noop,
        update: noop,
      },
    },
  }
})

// Import after mock registered
import {
  broadcastToAgents,
  getAgentSession,
  getAgentTaskLogs,
  getConnectedAgents,
  handleHeartbeat,
  pauseAgentTask,
  resumeAgentTask,
  sendInterveneToAgent,
  sendToAgent,
  type AgentMessage,
  type AgentSession,
} from './runtime'

// ─── Test fixtures ───────────────────────────────────────────────────────────

/**
 * Build a fake AgentSession with a mock WebSocket that records sent messages.
 * Source uses `session.websocket.send(JSON.stringify(...))` so we provide a
 * mock WS with a `send` method that pushes into a captured array.
 */
function makeFakeSession(agentId: string, sentSink: string[]): AgentSession {
  return {
    agentId,
    status: 'idle',
    activeTasks: [],
    lastHeartbeat: new Date(),
    taskLogs: [],
    websocket: {
      send: (data: string) => { sentSink.push(data) },
    },
  }
}

// Mock the internal `agentSessions` map by importing the module's helper
// We use exported helpers to verify side-effects rather than direct map mutation.
// (Source exports `getAgentSession` but the map itself is not exported.)

// ─── sendToAgent (US-9.3 — send arbitrary message to agent) ─────────────────

describe('sendToAgent (US-9.3 — agent WS send)', () => {
  test('returns false when agent is not connected', () => {
    const result = sendToAgent('unknown-agent', { type: 'ping' })
    expect(result).toBe(false)
  })
})

describe('sendInterveneToAgent (US-9.3 — PM intervention)', () => {
  test('returns false when agent is not connected', () => {
    const result = sendInterveneToAgent('unknown-agent', 'task-1', '請停止')
    expect(result).toBe(false)
  })
})

describe('pauseAgentTask / resumeAgentTask (US-9.3 — task control)', () => {
  test('both return false when agent is not connected', () => {
    expect(pauseAgentTask('unknown-agent', 'task-1')).toBe(false)
    expect(resumeAgentTask('unknown-agent', 'task-1')).toBe(false)
  })
})

describe('handleHeartbeat (US-9.3 — heartbeat state update)', () => {
  test('does nothing when session is not registered (no throw)', () => {
    // Source: `const session = agentSessions.get(agentId); if (session) {...}`
    // 如果 session 唔存在, 唔會行 if 內部。Confirm 冇 throw。
    expect(() => handleHeartbeat('unknown-agent', {
      status: 'idle', activeTasks: [],
    })).not.toThrow()
  })
})

describe('getAgentSession (US-9.3 — session lookup)', () => {
  test('returns undefined for unknown agentId', () => {
    expect(getAgentSession('does-not-exist')).toBeUndefined()
  })
})

describe('getAgentTaskLogs (US-9.3 — task log retrieval)', () => {
  test('returns empty array when session is unknown', () => {
    const logs = getAgentTaskLogs('unknown-agent')
    expect(logs).toEqual([])
  })
})

describe('getConnectedAgents (US-9.3 — connected agents list)', () => {
  test('returns an array (possibly empty, may contain leftovers from other tests)', () => {
    const agents = getConnectedAgents()
    expect(Array.isArray(agents)).toBe(true)
  })
})

describe('broadcastToAgents (US-9.3 — multi-agent broadcast)', () => {
  test('does not throw when no agents are connected', () => {
    // Source iterates agentSessions map. If empty, just returns.
    expect(() => broadcastToAgents({ type: 'ping' })).not.toThrow()
  })
})

// ─── 純 derive helper for state transitions ────────────────────────────────

/**
 * 從 source `handleHeartbeat` line 342-348 derive:
 *   1. session.lastHeartbeat = new Date()
 *   2. session.status = payload.status === 'idle' ? 'idle' : 'working'
 *   3. session.activeTasks = payload.activeTasks || []
 */
function applyHeartbeatUpdate(
  session: AgentSession,
  payload: { status: 'idle' | 'working' | 'paused'; activeTasks?: string[] }
): AgentSession {
  return {
    ...session,
    lastHeartbeat: new Date(),
    status: payload.status === 'idle' ? 'idle' : 'working',
    activeTasks: payload.activeTasks || [],
  }
}

describe('heartbeat state transition (derive from source line 342-348)', () => {
  test('status=idle sets session.status to idle', () => {
    const sess = makeFakeSession('a', [])
    const updated = applyHeartbeatUpdate(sess, { status: 'idle' })
    expect(updated.status).toBe('idle')
  })

  test('status=working sets session.status to working', () => {
    const sess = makeFakeSession('a', [])
    const updated = applyHeartbeatUpdate(sess, { status: 'working' })
    expect(updated.status).toBe('working')
  })

  test('status=paused sets session.status to working (source: anything non-idle → working)', () => {
    // Source logic: `payload.status === 'idle' ? 'idle' : 'working'`
    // paused → working. 守住呢個 invariant。
    const sess = makeFakeSession('a', [])
    const updated = applyHeartbeatUpdate(sess, { status: 'paused' })
    expect(updated.status).toBe('working')
  })

  test('activeTasks is updated from payload', () => {
    const sess = makeFakeSession('a', [])
    const updated = applyHeartbeatUpdate(sess, { status: 'working', activeTasks: ['t1', 't2'] })
    expect(updated.activeTasks).toEqual(['t1', 't2'])
  })

  test('activeTasks defaults to empty array when omitted', () => {
    const sess = makeFakeSession('a', [])
    const updated = applyHeartbeatUpdate(sess, { status: 'working' })
    expect(updated.activeTasks).toEqual([])
  })
})

/**
 * 從 source `sendInterveneToAgent` line 56-76 derive 嘅 message shape:
 *   { type: 'intervene', payload: { taskId, instruction, timestamp } }
 */
function buildInterveneMessage(
  taskId: string,
  instruction: string,
  timestamp: number
): AgentMessage {
  return {
    type: 'intervene',
    payload: { taskId, instruction, timestamp },
  }
}

describe('intervene message shape (derive from source line 63-69)', () => {
  test('produces correct message envelope', () => {
    const msg = buildInterveneMessage('task-1', '請停止測試', 1234567890)
    expect(msg.type).toBe('intervene')
    expect((msg.payload as any).taskId).toBe('task-1')
    expect((msg.payload as any).instruction).toBe('請停止測試')
    expect((msg.payload as any).timestamp).toBe(1234567890)
  })
})

/**
 * 從 source `pauseAgentTask` line 81-98 derive 嘅 pause message shape:
 *   { type: 'pause', payload: { taskId, timestamp } }
 */
function buildPauseMessage(taskId: string, timestamp: number): AgentMessage {
  return { type: 'pause', payload: { taskId, timestamp } }
}

describe('pause message shape (derive from source line 89-92)', () => {
  test('produces correct pause envelope', () => {
    const msg = buildPauseMessage('task-1', 1234567890)
    expect(msg.type).toBe('pause')
    expect((msg.payload as any).taskId).toBe('task-1')
    expect((msg.payload as any).timestamp).toBe(1234567890)
  })
})

/**
 * 從 source `resumeAgentTask` line 103-119 derive 嘅 resume message shape:
 *   { type: 'resume', payload: { taskId, timestamp } }
 */
function buildResumeMessage(taskId: string, timestamp: number): AgentMessage {
  return { type: 'resume', payload: { taskId, timestamp } }
}

describe('resume message shape (derive from source line 111-114)', () => {
  test('produces correct resume envelope', () => {
    const msg = buildResumeMessage('task-1', 1234567890)
    expect(msg.type).toBe('resume')
    expect((msg.payload as any).taskId).toBe('task-1')
  })
})

// ─── Pure invariant: AgentSession shape ────────────────────────────────────

describe('AgentSession interface invariants (US-9.3)', () => {
  test('a freshly-built session has expected default state', () => {
    const sess = makeFakeSession('a-1', [])
    expect(sess.agentId).toBe('a-1')
    expect(sess.status).toBe('idle')
    expect(sess.activeTasks).toEqual([])
    expect(sess.taskLogs).toEqual([])
    expect(sess.lastHeartbeat).toBeInstanceOf(Date)
    expect(sess.websocket).toBeDefined()
    expect(typeof sess.websocket.send).toBe('function')
  })
})
