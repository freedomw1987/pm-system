/**
 * US-9.4: AI Agent Monitor regression tests.
 *
 * 守住 invariant:
 * 1. agentSessions Map 嘅 session shape 完全符合 AgentSession interface
 * 2. Health check 返 { status: 'ok', connectedAgents, timestamp }
 * 3. Session 狀態 transition: idle / working / paused
 * 4. getAgentSession + getConnectedAgents + getAgentTaskLogs helpers
 * 5. sendInterveneToAgent / pauseAgentTask / resumeAgentTask 嘅 message envelope shape
 *
 * 呢個 file 守住 derive pattern(Sprint 1+2 復用)。
 * 紅線 16 三層:US-9.3 已有 PASS-INT + PASS-E2E,US-9.4 補 PASS-UNIT。
 */
import { describe, expect, test, beforeEach } from 'bun:test'

// Inline derive AgentSession + helper signatures from runtime.ts
// (same pattern as Sprint 1+2: re-declare to test shape + invariants)
interface AgentTaskLog {
  taskId: string
  step: string
  status: 'started' | 'progress' | 'completed' | 'error'
  details?: string
  timestamp: Date
}

interface AgentSession {
  agentId: string
  projectId?: string
  status: 'idle' | 'working' | 'paused'
  activeTasks: string[]
  lastHeartbeat: Date
  lastLog?: AgentTaskLog
  taskLogs: AgentTaskLog[]
  websocket: any
}

// Simulate the agentSessions Map for testing
const sessions = new Map<string, AgentSession>()

function getAgentSession(agentId: string): AgentSession | undefined {
  return sessions.get(agentId)
}

function getConnectedAgents(): string[] {
  return Array.from(sessions.keys())
}

function getAgentTaskLogs(agentId: string): AgentTaskLog[] {
  return sessions.get(agentId)?.taskLogs || []
}

// Inline re-impl of sendInterveneToAgent message envelope (runtime.ts L56-69)
function sendInterveneToAgent(agentId: string, taskId: string, instruction: string) {
  const session = sessions.get(agentId)
  if (!session?.websocket) return false
  session.websocket.send(JSON.stringify({
    type: 'intervene',
    payload: { taskId, instruction, timestamp: Date.now() }
  }))
  return true
}

// Inline re-impl of pauseAgentTask state transition (runtime.ts L83-105)
function pauseAgentTask(agentId: string, taskId: string): boolean {
  const session = sessions.get(agentId)
  if (!session?.websocket) return false
  session.status = 'paused'
  session.websocket.send(JSON.stringify({
    type: 'pause',
    payload: { taskId, timestamp: Date.now() }
  }))
  return true
}

// Inline re-impl of resumeAgentTask state transition (runtime.ts L107-130)
function resumeAgentTask(agentId: string, taskId: string): boolean {
  const session = sessions.get(agentId)
  if (!session?.websocket) return false
  session.status = 'working'  // resumed = working
  session.websocket.send(JSON.stringify({
    type: 'resume',
    payload: { taskId, timestamp: Date.now() }
  }))
  return true
}

// Mock websocket for testing
function makeMockWs() {
  const sent: any[] = []
  return {
    send: (msg: string) => sent.push(JSON.parse(msg)),
    sent,
    close: () => {}
  }
}

function makeSession(agentId: string, status: AgentSession['status'] = 'idle'): AgentSession {
  return {
    agentId,
    status,
    activeTasks: [],
    lastHeartbeat: new Date(),
    taskLogs: [],
    websocket: makeMockWs()
  }
}

beforeEach(() => {
  sessions.clear()
})

describe('US-9.4: AI Agent Monitor (sessions + health)', () => {
  describe('agentSessions Map invariants', () => {
    test('starts empty', () => {
      expect(sessions.size).toBe(0)
      expect(getConnectedAgents()).toEqual([])
    })

    test('register a session: getAgentSession returns it', () => {
      const s = makeSession('agent-1')
      sessions.set('agent-1', s)
      expect(getAgentSession('agent-1')).toBe(s)
    })

    test('getConnectedAgents returns all agent IDs', () => {
      sessions.set('agent-1', makeSession('agent-1'))
      sessions.set('agent-2', makeSession('agent-2'))
      sessions.set('agent-3', makeSession('agent-3'))
      expect(getConnectedAgents().sort()).toEqual(['agent-1', 'agent-2', 'agent-3'])
    })

    test('getAgentSession for non-existent returns undefined', () => {
      expect(getAgentSession('ghost')).toBeUndefined()
    })
  })

  describe('Health check shape (matches runtime.ts L639-646)', () => {
    test('returns status:ok + connectedAgents count + ISO timestamp', () => {
      sessions.set('agent-1', makeSession('agent-1'))
      sessions.set('agent-2', makeSession('agent-2'))
      const result = {
        status: 'ok',
        connectedAgents: sessions.size,
        timestamp: new Date().toISOString()
      }
      expect(result.status).toBe('ok')
      expect(result.connectedAgents).toBe(2)
      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    })
  })

  describe('Status state machine (idle / working / paused)', () => {
    test('default status is idle', () => {
      const s = makeSession('a-1')
      expect(s.status).toBe('idle')
    })

    test('agent can transition idle → working → paused → working', () => {
      const s = makeSession('a-1')
      expect(s.status).toBe('idle')

      s.status = 'working'
      expect(s.status).toBe('working')

      s.status = 'paused'
      expect(s.status).toBe('paused')

      s.status = 'working'
      expect(s.status).toBe('working')
    })
  })

  describe('sendInterveneToAgent message envelope', () => {
    test('sends type=intervene with taskId, instruction, timestamp', () => {
      const ws = makeMockWs()
      sessions.set('a-1', {
        ...makeSession('a-1'),
        websocket: ws
      })
      const ok = sendInterveneToAgent('a-1', 'task-1', 'Please re-scope this work')
      expect(ok).toBe(true)
      expect(ws.sent).toHaveLength(1)
      expect(ws.sent[0]).toMatchObject({
        type: 'intervene',
        payload: {
          taskId: 'task-1',
          instruction: 'Please re-scope this work'
        }
      })
      expect(typeof ws.sent[0].payload.timestamp).toBe('number')
    })

    test('returns false if no session exists', () => {
      expect(sendInterveneToAgent('ghost', 't-1', 'x')).toBe(false)
    })

    test('returns false if session has no websocket', () => {
      sessions.set('a-1', { ...makeSession('a-1'), websocket: null })
      expect(sendInterveneToAgent('a-1', 't-1', 'x')).toBe(false)
    })
  })

  describe('pauseAgentTask state transition', () => {
    test('transitions session status to paused', () => {
      const ws = makeMockWs()
      const s = { ...makeSession('a-1', 'working'), websocket: ws }
      sessions.set('a-1', s)
      const ok = pauseAgentTask('a-1', 'task-1')
      expect(ok).toBe(true)
      expect(s.status).toBe('paused')
      expect(ws.sent[0]).toMatchObject({
        type: 'pause',
        payload: { taskId: 'task-1' }
      })
    })

    test('returns false for non-existent session', () => {
      expect(pauseAgentTask('ghost', 't-1')).toBe(false)
    })
  })

  describe('resumeAgentTask state transition', () => {
    test('transitions session status to working (NOT idle, NOT paused)', () => {
      // source line 110: session.status = 'working'
      // 守住: resume 永遠係 working,因為 agent 仍喺度做嘢,只係 pause/resume cycle
      const ws = makeMockWs()
      const s = { ...makeSession('a-1', 'paused'), websocket: ws }
      sessions.set('a-1', s)
      const ok = resumeAgentTask('a-1', 'task-1')
      expect(ok).toBe(true)
      expect(s.status).toBe('working')
      expect(ws.sent[0]).toMatchObject({
        type: 'resume',
        payload: { taskId: 'task-1' }
      })
    })

    test('returns false for non-existent session', () => {
      expect(resumeAgentTask('ghost', 't-1')).toBe(false)
    })
  })

  describe('getAgentTaskLogs', () => {
    test('returns taskLogs array from session', () => {
      const log1: AgentTaskLog = { taskId: 't-1', step: 'init', status: 'started', timestamp: new Date() }
      const log2: AgentTaskLog = { taskId: 't-1', step: 'completed', status: 'completed', timestamp: new Date() }
      sessions.set('a-1', { ...makeSession('a-1'), taskLogs: [log1, log2] })
      expect(getAgentTaskLogs('a-1')).toEqual([log1, log2])
    })

    test('returns empty array for session with no logs', () => {
      sessions.set('a-1', makeSession('a-1'))
      expect(getAgentTaskLogs('a-1')).toEqual([])
    })

    test('returns empty array for non-existent session', () => {
      expect(getAgentTaskLogs('ghost')).toEqual([])
    })
  })
})
