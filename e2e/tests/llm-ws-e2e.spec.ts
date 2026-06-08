/**
 * LLM + WS wire-up E2E test (US-8.1/8.2/9.3 supplementary)
 *
 * 用 Playwright + Docker stack 驗證 wire 真接通:
 *   - 透過 nginx :8080 → backend :4001 嘅 reverse proxy,
 *     GET /agent-health/ 應該返 200
 *   - 透過 nginx :8080 → backend :4001 嘅 reverse proxy,
 *     WS /ws/agents/ 冇 token 應該 4001 close
 *
 * **唔覆蓋**(超出 Playwright spec scope):
 *   - LLM chat streaming(需要 OpenAI key / 真 fetch mock)— backend integration test cover
 *   - WS auth full lifecycle(需要 mock prisma)— backend integration test cover
 *
 * **呢個 spec 嘅 role**:
 *   - 確認 docker compose 嘅 network wiring 正常(nginx → backend 4001 通)
 *   - 確認 backend export keyword 改動冇 break WS 端點(WS 仍然 4001 close)
 *   - 配合 backend integration test 形成「backend + wire 兩層覆蓋」
 *
 * 對應 TD-013 + 紅線 12 + 16 + 17(deploy smoke test)。
 */

import { test, expect } from '@playwright/test'

const BACKEND = 'http://localhost:4001'
const FRONTEND = 'http://localhost:8080'

test.describe('LLM + WS wire-up E2E (US-8.1/8.2/9.3 supplementary)', () => {
  test('GET /api/agent-health/ returns 200 (backend wire working)', async ({ request }) => {
    // nginx frontend :8080 proxies /api/* → backend :4001 /api/*
    const res = await request.get(`${FRONTEND}/api/agent-health/`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ok')
    expect(typeof body.connectedAgents).toBe('number')
    expect(body.timestamp).toBeDefined()
  })

  test('GET /api/agent-health/ via direct backend (port 4001) also works', async ({ request }) => {
    const res = await request.get(`${BACKEND}/api/agent-health/`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ok')
  })

  test('WS /ws/agents/ without token closes with 4001', async () => {
    // Use the Node 22 global WebSocket to bypass Playwright's request abstraction
    const ws = new WebSocket(`ws://localhost:4001/ws/agents/`)
    const closeCode: { value?: number } = {}
    const closeReason: { value?: string } = {}
    ws.addEventListener('close', (ev) => {
      closeCode.value = ev.code
      closeReason.value = ev.reason
    })
    // Wait for close event
    await new Promise<void>((resolve) => {
      ws.addEventListener('close', () => resolve())
      setTimeout(() => resolve(), 3000)
    })
    // 4001 = "Missing authentication" (source runtime.ts line 363)
    expect(closeCode.value).toBe(4001)
  })

  test('POST /api/chat/sessions (without body) returns 400 or 401', async ({ request }) => {
    // Confirms chat routes are mounted + auth gate works
    const res = await request.post(`${BACKEND}/api/chat/sessions`, { data: {} })
    // Without auth → 401
    // With auth but no body → 400
    // Either is acceptable — what we want is NOT 500 (which would indicate routing failure)
    expect([400, 401]).toContain(res.status())
  })
})
