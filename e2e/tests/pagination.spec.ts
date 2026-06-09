/**
 * Pagination E2E tests — Sprint 8 (US-7.x)
 *
 * 涵蓋 server-side pagination 4 個 list endpoint + 5 個 list page:
 *   - GET /api/projects      → ProjectsPage
 *   - GET /api/requirements  → MyRequirementsPage
 *   - GET /api/tasks         → MyTasksPage + BugsPage(parent filter)
 *   - GET /api/bugs          → BugsPage + MyBugsPage
 *
 * 守嘅 invariant:
 *   - response shape: { items: [...], totalCount, page, pageSize, totalPages }
 *   - default page=1, pageSize=20
 *   - pageSize 上限 100
 *   - limit=-1 → 全部(Excel export 模式)
 *   - 「下一頁」按鈕 page+1,「上一頁」page-1
 *   - 改 pageSize → reset page 1
 *   - 揀 status / project filter → reset page 1
 *   - page=1 / page=lastPage 時 prev/next button disabled
 *
 * Test data 策略:
 *   seed data 得 8 個 projects,唔夠 trigger pagination(default pageSize=20)。
 *   每個 test 開頭用 unique suffix 建 N=25 個 projects,測完 cleanup。
 *
 * RG-012 守則:每個 test 用獨立 IP(透過 `loginAs` 自動 inject
 * `X-Forwarded-For`)防 backend 5 attempts/60s rate limit 撞。
 */

import { test, expect, type Page } from '@playwright/test'
import { loginAs, USERS } from './_helpers'

const BACKEND = 'http://localhost:4001'
const FRONTEND = 'http://localhost:8080'

/** 隨機 suffix,避免 retry 撞資料同 cross-test 污染 */
const SUFFIX = `pg${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`

/** API login + 攞 admin token(IP 自動 isolate) */
async function apiLogin(req: Page['request'], testTitle: string): Promise<string> {
  return loginAs(req, 'admin', testTitle)
}

/** 注入 token 入 localStorage,模擬已登入 user(AuthContext 期望 shape) */
async function loginViaStorage(page: Page, token: string) {
  const userPayload = {
    id: 'admin',
    name: '系統管理員',
    email: USERS.admin.email,
    role: 'admin',
  }
  await page.goto(`${FRONTEND}/login`)
  await page.evaluate(
    ({ accessToken, user }) => {
      localStorage.setItem('accessToken', accessToken)
      localStorage.setItem('refreshToken', 'e2e-pagination-refresh')
      localStorage.setItem('user', JSON.stringify(user))
    },
    { accessToken: token, user: userPayload },
  )
}

/** 喺 backend 攞 N 個 projects 嘅 id list(page=1, pageSize=N) */
async function listProjectIds(req: Page['request'], token: string, pageSize: number): Promise<string[]> {
  const res = await req.get(`${BACKEND}/api/projects?page=1&pageSize=${pageSize}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(res.status(), 'list projects should succeed').toBe(200)
  const body = await res.json()
  return (body.projects as Array<{ id: string }>).map(p => p.id)
}

/** 批量建 N 個 projects(後台用,唔等 UI) */
async function createProjects(
  req: Page['request'],
  token: string,
  prefix: string,
  count: number,
): Promise<string[]> {
  const ids: string[] = []
  for (let i = 0; i < count; i++) {
    const res = await req.post(`${BACKEND}/api/projects`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: `${prefix} #${i.toString().padStart(3, '0')}`, description: `seeded by pagination E2E` },
    })
    expect(res.status(), `create project ${i} should succeed`).toBe(200)
    const body = await res.json()
    ids.push(body.project.id)
  }
  return ids
}

/** 批量刪 projects(用 name prefix match,最穩陣) */
async function cleanupProjectsByPrefix(
  req: Page['request'],
  token: string,
  prefix: string,
) {
  // 先攞晒所有 projects,pageSize=100 一次過(MAX 100)
  let page = 1
  const matched: string[] = []
  while (true) {
    const res = await req.get(`${BACKEND}/api/projects?page=${page}&pageSize=100`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok()) break
    const body = await res.json()
    const projects: Array<{ id: string; name: string }> = body.projects
    for (const p of projects) {
      if (p.name.startsWith(prefix)) matched.push(p.id)
    }
    if (page >= body.totalPages) break
    page++
  }
  // 逐個刪
  for (const id of matched) {
    await req.delete(`${BACKEND}/api/projects/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  }
}

// ─── 測試 ─────────────────────────────────────────────────────

test.describe('Sprint 8 — Server-side Pagination', () => {
  // 用 1 個 describe-level setup 建 25 個 projects,所有 test 共享
  // page-level cleanup
  const createdIds: string[] = []
  const projectPrefix = `E2E-PG-${SUFFIX}`

  test.beforeAll(async ({ request }, testInfo) => {
    const token = await apiLogin(request, testInfo.title + '-setup')
    createdIds.push(...await createProjects(request, token, projectPrefix, 25))
    expect(createdIds.length, 'should have created 25 test projects').toBe(25)
  })

  test.afterAll(async ({ request }, testInfo) => {
    const token = await apiLogin(request, testInfo.title + '-cleanup')
    await cleanupProjectsByPrefix(request, token, projectPrefix)
  })

  // ─── T1: Server response shape ────────────────────────────────
  test('GET /api/projects returns { projects, totalCount, page, pageSize, totalPages }', async ({ request }, testInfo) => {
    const token = await apiLogin(request, testInfo.title)
    const res = await request.get(`${BACKEND}/api/projects?page=1&pageSize=10`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()

    // 向後兼容:keep 原 array name
    expect(Array.isArray(body.projects)).toBe(true)
    // 新 pagination fields
    expect(typeof body.totalCount).toBe('number')
    expect(typeof body.page).toBe('number')
    expect(typeof body.pageSize).toBe('number')
    expect(typeof body.totalPages).toBe('number')

    // 至少我哋新建嘅 25 個
    expect(body.totalCount).toBeGreaterThanOrEqual(25)
    expect(body.page).toBe(1)
    expect(body.pageSize).toBe(10)
    // Math.ceil(totalCount / 10) >= 3
    expect(body.totalPages).toBeGreaterThanOrEqual(3)
  })

  // ─── T2: Default pageSize=20 ─────────────────────────────────
  test('default pageSize is 20 (no params → pageSize=20, take 20)', async ({ request }, testInfo) => {
    const token = await apiLogin(request, testInfo.title)
    const res = await request.get(`${BACKEND}/api/projects`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.pageSize).toBe(20)
    expect(body.page).toBe(1)
    // 攞到嘅 array 唔可以超過 pageSize
    expect(body.projects.length).toBeLessThanOrEqual(20)
  })

  // ─── T3: pageSize 100 (MAX), 然後 pageSize > 100 截斷 ───────
  test('pageSize=100 works, pageSize=500 caps at 100 (MAX)', async ({ request }, testInfo) => {
    const token = await apiLogin(request, testInfo.title)

    const ok = await request.get(`${BACKEND}/api/projects?pageSize=100`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(ok.json().then((b: { pageSize: number }) => b.pageSize)).resolves.toBe(100)

    const cap = await request.get(`${BACKEND}/api/projects?pageSize=500`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const capBody = await cap.json()
    expect(capBody.pageSize).toBe(100) // 截斷到 MAX
  })

  // ─── T4: page=2 returns different items than page=1 ─────────
  test('page=2 returns the next slice (no overlap with page=1)', async ({ request }, testInfo) => {
    const token = await apiLogin(request, testInfo.title)
    const p1 = await (await request.get(`${BACKEND}/api/projects?page=1&pageSize=10`, {
      headers: { Authorization: `Bearer ${token}` },
    })).json()
    const p2 = await (await request.get(`${BACKEND}/api/projects?page=2&pageSize=10`, {
      headers: { Authorization: `Bearer ${token}` },
    })).json()

    const ids1 = new Set((p1.projects as Array<{ id: string }>).map(p => p.id))
    const ids2 = (p2.projects as Array<{ id: string }>).map(p => p.id)
    expect(p2.page).toBe(2)
    // 兩個 page 唔可以有 overlap
    for (const id of ids2) {
      expect(ids1.has(id), `id ${id} should not appear in both page 1 and page 2`).toBe(false)
    }
    expect(p2.totalCount).toBe(p1.totalCount) // totalCount 唔受 page 影響
  })

  // ─── T5: UI ProjectsPage 顯示「共 N 個」+ pagination controls ─
  test('UI ProjectsPage shows pagination controls + correct total count', async ({ page }, testInfo) => {
    const token = await apiLogin(page.request, testInfo.title)
    await loginViaStorage(page, token)

    await page.goto(`${FRONTEND}/projects`)
    await page.waitForLoadState('networkidle')

    // 25+ 個 project 應該有 pagination
    // Label: "第 1–20 筆,共 N 筆"
    await expect(page.getByText(/第 1–20 筆/)).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText(/共 \d+ 個項目/)).toBeVisible()

    // 「下一頁」button 必須 enabled(page 1 < totalPages)
    const nextBtn = page.getByRole('button', { name: '下一頁' })
    await expect(nextBtn).toBeVisible()
    await expect(nextBtn).toBeEnabled()

    // 「上一頁」button page 1 時 disabled
    const prevBtn = page.getByRole('button', { name: '上一頁' })
    await expect(prevBtn).toBeDisabled()
  })

  // ─── T6: UI 點「下一頁」會 load page 2 ──────────────────────
  test('clicking 下一頁 on ProjectsPage navigates to page 2', async ({ page }, testInfo) => {
    const token = await apiLogin(page.request, testInfo.title)
    await loginViaStorage(page, token)

    await page.goto(`${FRONTEND}/projects`)
    await page.waitForLoadState('networkidle')

    // 攞 page 1 第一個 project name(用來對比 page 2 唔同)
    const firstCardPage1 = await page.locator('a[href^="/projects/"] h3').first().textContent()

    // 點下一頁
    await page.getByRole('button', { name: '下一頁' }).click()
    await page.waitForLoadState('networkidle')

    // URL 唔一定有 page 喺 URL(page state 而家係 in-memory),但
    // 顯示「第 2 / N 頁」即可
    await expect(page.getByText(/第 2 \/ \d+ 頁/)).toBeVisible({ timeout: 5_000 })

    // 「上一頁」依家 enabled
    await expect(page.getByRole('button', { name: '上一頁' })).toBeEnabled()

    // page 2 第一張 card 應該同 page 1 唔同
    const firstCardPage2 = await page.locator('a[href^="/projects/"] h3').first().textContent()
    expect(firstCardPage2).not.toBe(firstCardPage1)
  })

  // ─── T7: UI 改 pageSize 會 reset page 1 + reload ────────────
  test('changing pageSize resets to page 1 and reloads with new size', async ({ page }, testInfo) => {
    const token = await apiLogin(page.request, testInfo.title)
    await loginViaStorage(page, token)

    await page.goto(`${FRONTEND}/projects`)
    await page.waitForLoadState('networkidle')

    // 先去 page 2
    await page.getByRole('button', { name: '下一頁' }).click()
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(/第 2 \/ \d+ 頁/)).toBeVisible()

    // 改 pageSize 50
    const pageSizeSelect = page.locator('select').filter({ hasText: '20' }).first()
    await pageSizeSelect.selectOption('50')
    await page.waitForLoadState('networkidle')

    // 應該 reset 去 page 1
    await expect(page.getByText(/第 1 \/ \d+ 頁/)).toBeVisible({ timeout: 5_000 })
    // 顯示「第 1–N 筆」(N = min(50, totalCount))
    await expect(page.getByText(/第 1–\d+ 筆/)).toBeVisible()
    // 確認 pageSize 已經變咗做 50:「上一頁」disabled
    await expect(page.getByRole('button', { name: '上一頁' })).toBeDisabled()
  })

  // ─── T8: BugsPage status filter 觸發 server reload + page 1 ─────
  test('BugsPage: switching status filter triggers a server reload', async ({ page }, testInfo) => {
    const token = await apiLogin(page.request, testInfo.title)
    await loginViaStorage(page, token)

    // 監聽 /api/bugs 嘅 request
    const apiCalls: string[] = []
    page.on('request', (req) => {
      const url = req.url()
      if (url.includes('/api/bugs') && !url.includes('/bugs/')) {
        apiCalls.push(url)
      }
    })

    await page.goto(`${FRONTEND}/bugs`)
    await page.waitForLoadState('networkidle')

    // 預設 filter = 'all',一定有 request
    expect(apiCalls.length, 'expected initial /api/bugs call').toBeGreaterThan(0)
    const initialCalls = apiCalls.length

    // 揀 status tab「待處理」(open)— 應該 trigger 新嘅 server request
    await page.getByRole('button', { name: '待處理' }).click()
    await page.waitForLoadState('networkidle')

    // 揀咗 filter 應該有新嘅 request 入到(帶 status=open)
    expect(apiCalls.length, 'expected new /api/bugs call after filter change').toBeGreaterThan(initialCalls)
    const lastCall = apiCalls[apiCalls.length - 1]
    expect(lastCall, 'filter request should include status=open').toMatch(/status=open/)
  })

  // ─── T9: limit=-1 returns everything (Excel export 模式) ────
  test('limit=-1 returns all projects in one page (Excel export mode)', async ({ request }, testInfo) => {
    const token = await apiLogin(request, testInfo.title)
    const res = await request.get(`${BACKEND}/api/projects?limit=-1`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    // limit=-1 → pageSize 自動 = totalCount
    expect(body.pageSize).toBe(body.totalCount)
    expect(body.page).toBe(1)
    expect(body.totalPages).toBe(1)
    // 拎到嘅 array 數量 = totalCount(全部)
    expect(body.projects.length).toBe(body.totalCount)
  })
})

// ═══════════════════════════════════════════════════════════════════
// Sprint 9 — Sub-list pagination + report stats consistency
// ═══════════════════════════════════════════════════════════════════

/** 同 SUFFIX 區分(Sprint 9 唔同 test scope) */
const SUFFIX_S9 = `s9${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`

/** 建一個 project for Sprint 9 sub-list 測試 */
async function createProject(req: Page['request'], token: string, name: string): Promise<string> {
  const res = await req.post(`${BACKEND}/api/projects`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { name, description: 'Sprint 9 sub-list pagination test' },
  })
  expect(res.status(), `create project ${name} should succeed`).toBe(200)
  const body = await res.json()
  return body.project.id
}

/** 建 N 個 requirements 落 project(projectId) */
async function createRequirements(
  req: Page['request'], token: string, projectId: string, prefix: string, count: number,
): Promise<string[]> {
  const ids: string[] = []
  for (let i = 0; i < count; i++) {
    const res = await req.post(`${BACKEND}/api/projects/${projectId}/requirements`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { title: `${prefix} #${i.toString().padStart(3, '0')}` },
    })
    expect(res.status(), `create req ${i} should succeed`).toBe(200)
    const body = await res.json()
    ids.push(body.requirement.id)
  }
  return ids
}

/** 建 N 個 tasks 落 project(可選 requirementIds) */
async function createTasks(
  req: Page['request'], token: string, projectId: string, prefix: string, count: number,
  extra: Record<string, unknown> = {},
): Promise<string[]> {
  const ids: string[] = []
  for (let i = 0; i < count; i++) {
    const res = await req.post(`${BACKEND}/api/tasks`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { title: `${prefix} #${i.toString().padStart(3, '0')}`, projectId, ...extra },
    })
    expect(res.status(), `create task ${i} should succeed`).toBe(200)
    const body = await res.json()
    ids.push(body.task.id)
  }
  return ids
}

/** 建 N 個 bugs 落 project(可選 requirementId) */
async function createBugs(
  req: Page['request'], token: string, projectId: string, prefix: string, count: number,
  extra: Record<string, unknown> = {},
): Promise<string[]> {
  const ids: string[] = []
  for (let i = 0; i < count; i++) {
    const res = await req.post(`${BACKEND}/api/bugs`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { title: `${prefix} #${i.toString().padStart(3, '0')}`, projectId, severity: 'medium', ...extra },
    })
    expect(res.status(), `create bug ${i} should succeed`).toBe(200)
    const body = await res.json()
    ids.push(body.bug.id)
  }
  return ids
}

test.describe('Sprint 9 — Sub-list pagination', () => {
  let projectId: string
  const projectName = `E2E-S9-${SUFFIX_S9}`

  test.beforeAll(async ({ request }, testInfo) => {
    const token = await apiLogin(request, testInfo.title + '-setup')
    projectId = await createProject(request, token, projectName)
    // Pre-create 25 each of reqs/tasks/bugs
    await createRequirements(request, token, projectId, `E2E-S9-REQ-${SUFFIX_S9}`, 25)
    await createTasks(request, token, projectId, `E2E-S9-TSK-${SUFFIX_S9}`, 25)
    await createBugs(request, token, projectId, `E2E-S9-BUG-${SUFFIX_S9}`, 25)
  })

  test.afterAll(async ({ request }, testInfo) => {
    const token = await apiLogin(request, testInfo.title + '-cleanup')
    await request.delete(`${BACKEND}/api/projects/${projectId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  })

  // ─── T14a: /api/projects/:id/requirements paginated response shape ──
  test('GET /api/projects/:id/requirements returns paginated shape', async ({ request }, testInfo) => {
    const token = await apiLogin(request, testInfo.title)
    const res = await request.get(`${BACKEND}/api/projects/${projectId}/requirements?page=1&pageSize=10`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.requirements)).toBe(true)
    expect(typeof body.totalCount).toBe('number')
    expect(typeof body.page).toBe('number')
    expect(typeof body.pageSize).toBe('number')
    expect(typeof body.totalPages).toBe('number')
    expect(body.totalCount).toBeGreaterThanOrEqual(25)
    expect(body.page).toBe(1)
    expect(body.pageSize).toBe(10)
    expect(body.totalPages).toBeGreaterThanOrEqual(3)
    expect(body.requirements.length).toBe(10)
  })

  // ─── T14b: ProjectDetailPage Requirements tab UI pagination ──
  test('ProjectDetailPage Requirements tab: shows pagination + navigates to page 2', async ({ page }, testInfo) => {
    const token = await apiLogin(page.request, testInfo.title)
    await loginViaStorage(page, token)
    await page.goto(`${FRONTEND}/projects/${projectId}`)
    await page.waitForLoadState('networkidle')

    // Requirements tab 係 default
    await expect(page.getByText(/第 1–\d+ 筆/)).toBeVisible({ timeout: 5_000 })
    const nextBtn = page.getByRole('button', { name: '下一頁' })
    await expect(nextBtn).toBeEnabled()
    const prevBtn = page.getByRole('button', { name: '上一頁' })
    await expect(prevBtn).toBeDisabled()

    // Click 下一頁
    await nextBtn.click()
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(/第 2 \/ \d+ 頁/)).toBeVisible({ timeout: 5_000 })
    await expect(prevBtn).toBeEnabled()
  })

  // ─── T14c: ProjectDetailPage Tasks tab UI pagination ──
  test('ProjectDetailPage Tasks tab: shows pagination + navigates to page 2', async ({ page }, testInfo) => {
    const token = await apiLogin(page.request, testInfo.title)
    await loginViaStorage(page, token)
    await page.goto(`${FRONTEND}/projects/${projectId}`)
    await page.waitForLoadState('networkidle')

    // Click Tasks tab — header 寫 "任務"
    await page.getByRole('button', { name: /任務/ }).first().click()
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(/第 1–\d+ 筆/)).toBeVisible({ timeout: 5_000 })

    const nextBtn = page.getByRole('button', { name: '下一頁' })
    await expect(nextBtn).toBeEnabled()
    await nextBtn.click()
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(/第 2 \/ \d+ 頁/)).toBeVisible({ timeout: 5_000 })
  })

  // ─── T14d: ProjectDetailPage Bugs tab UI pagination ──
  test('ProjectDetailPage Bugs tab: shows pagination + navigates to page 2', async ({ page }, testInfo) => {
    const token = await apiLogin(page.request, testInfo.title)
    await loginViaStorage(page, token)
    await page.goto(`${FRONTEND}/projects/${projectId}`)
    await page.waitForLoadState('networkidle')

    // Click Bugs tab
    await page.getByRole('button', { name: /缺陷/ }).first().click()
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(/第 1–\d+ 筆/)).toBeVisible({ timeout: 5_000 })

    const nextBtn = page.getByRole('button', { name: '下一頁' })
    await expect(nextBtn).toBeEnabled()
    await nextBtn.click()
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(/第 2 \/ \d+ 頁/)).toBeVisible({ timeout: 5_000 })
  })
})

// ─── T14e + T14f: RequirementDetailPage sub-lists ─────────────────

test.describe('Sprint 9 — RequirementDetailPage sub-list pagination', () => {
  let projectId: string
  let requirementId: string
  const projectName = `E2E-S9-REQ-PJ-${SUFFIX_S9}`

  test.beforeAll(async ({ request }, testInfo) => {
    const token = await apiLogin(request, testInfo.title + '-setup')
    projectId = await createProject(request, token, projectName)
    // 建 1 個 requirement
    const reqRes = await request.post(`${BACKEND}/api/projects/${projectId}/requirements`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { title: `E2E-S9-REQ-HEAD-${SUFFIX_S9}` },
    })
    const reqBody = await reqRes.json()
    requirementId = reqBody.requirement.id
    // 落 25 個 tasks(全部 link 落呢個 requirement)+ 25 個 bugs(全部 link 落呢個 requirement)
    await createTasks(request, token, projectId, `E2E-S9-RT-${SUFFIX_S9}`, 25, { requirementIds: [requirementId] })
    await createBugs(request, token, projectId, `E2E-S9-RB-${SUFFIX_S9}`, 25, { requirementId })
  })

  test.afterAll(async ({ request }, testInfo) => {
    const token = await apiLogin(request, testInfo.title + '-cleanup')
    await request.delete(`${BACKEND}/api/projects/${projectId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  })

  test('RequirementDetailPage Tasks sub-list: shows pagination', async ({ page }, testInfo) => {
    const token = await apiLogin(page.request, testInfo.title)
    await loginViaStorage(page, token)
    await page.goto(`${FRONTEND}/requirements/${requirementId}`)
    await page.waitForLoadState('networkidle')

    // Tasks 係 default tab
    await expect(page.getByText(/第 1–\d+ 筆/)).toBeVisible({ timeout: 5_000 })
    const nextBtn = page.getByRole('button', { name: '下一頁' })
    await expect(nextBtn).toBeEnabled()
    await nextBtn.click()
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(/第 2 \/ \d+ 頁/)).toBeVisible({ timeout: 5_000 })
  })

  test('RequirementDetailPage Bugs sub-list: shows pagination', async ({ page }, testInfo) => {
    const token = await apiLogin(page.request, testInfo.title)
    await loginViaStorage(page, token)
    await page.goto(`${FRONTEND}/requirements/${requirementId}`)
    await page.waitForLoadState('networkidle')

    // Click Bugs tab
    await page.getByRole('button', { name: /缺陷/ }).first().click()
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(/第 1–\d+ 筆/)).toBeVisible({ timeout: 5_000 })

    const nextBtn = page.getByRole('button', { name: '下一頁' })
    await expect(nextBtn).toBeEnabled()
    await nextBtn.click()
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(/第 2 \/ \d+ 頁/)).toBeVisible({ timeout: 5_000 })
  })
})

// ─── T14g: UsersPage pagination ───────────────────────────────────

test.describe('Sprint 9 — UsersPage pagination', () => {
  // 25 個 test users 用嚟 trigger pagination
  const userPrefix = `E2E-S9-USR-${SUFFIX_S9}`

  test.beforeAll(async ({ request }, testInfo) => {
    const token = await apiLogin(request, testInfo.title + '-setup', 'admin')
    for (let i = 0; i < 25; i++) {
      const res = await request.post(`${BACKEND}/api/users`, {
        headers: { Authorization: `Bearer ${token}` },
        data: {
          name: `${userPrefix} #${i.toString().padStart(3, '0')}`,
          email: `${userPrefix}-${i}@e2e.test`,
          password: 'test1234',
          role: 'developer',
        },
      })
      expect(res.status(), `create user ${i} should succeed`).toBe(200)
    }
  })

  test.afterAll(async ({ request }, testInfo) => {
    const token = await apiLogin(request, testInfo.title + '-cleanup', 'admin')
    // 攞所有 users 然後逐個刪
    let page = 1
    const matched: string[] = []
    while (true) {
      const res = await request.get(`${BACKEND}/api/users?page=${page}&pageSize=100`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok()) break
      const body = await res.json()
      for (const u of body.users as Array<{ id: string; email: string }>) {
        if (u.email.startsWith(userPrefix)) matched.push(u.id)
      }
      if (page >= body.totalPages) break
      page++
    }
    for (const id of matched) {
      await request.delete(`${BACKEND}/api/users/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    }
  })

  test('GET /api/users returns paginated shape', async ({ request }, testInfo) => {
    const token = await apiLogin(request, testInfo.title)
    const res = await request.get(`${BACKEND}/api/users?page=1&pageSize=10`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.users)).toBe(true)
    expect(typeof body.totalCount).toBe('number')
    expect(typeof body.page).toBe('number')
    expect(typeof body.pageSize).toBe('number')
    expect(typeof body.totalPages).toBe('number')
    expect(body.pageSize).toBe(10)
    expect(body.page).toBe(1)
  })

  test('UsersPage UI: shows pagination controls + navigates to page 2', async ({ page }, testInfo) => {
    const token = await apiLogin(page.request, testInfo.title)
    await loginViaStorage(page, token)
    await page.goto(`${FRONTEND}/users`)
    await page.waitForLoadState('networkidle')

    // 25 個 users 應該 trigger pagination
    await expect(page.getByText(/第 1–\d+ 筆/)).toBeVisible({ timeout: 5_000 })
    const nextBtn = page.getByRole('button', { name: '下一頁' })
    await expect(nextBtn).toBeEnabled()
    await nextBtn.click()
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(/第 2 \/ \d+ 頁/)).toBeVisible({ timeout: 5_000 })
  })
})

// ─── T14h: /api/reports/cost — 守 Sprint 9 report fix ─────────────

test.describe('Sprint 9 — /api/reports/cost consistency (T14h)', () => {
  let projectA: string
  let projectB: string
  // 3 個 worklogs 喺 project-A:
  //   - task-no-req: task 冇 requirement(舊 code 會 miss)
  //   - task-with-req: task 有 requirement(舊 code OK)
  //   - bug-only: bug worklog(舊 code 會 miss)
  // project-B: 冇 worklog — 確保唔 leak
  let taskNoReq: string, taskWithReq: string, bugOnly: string

  test.beforeAll(async ({ request }, testInfo) => {
    const token = await apiLogin(request, testInfo.title + '-setup', 'admin')
    projectA = await createProject(request, token, `E2E-S9-COST-A-${SUFFIX_S9}`)
    projectB = await createProject(request, token, `E2E-S9-COST-B-${SUFFIX_S9}`)

    // 建 requirement 喺 project-A
    const reqARes = await request.post(`${BACKEND}/api/projects/${projectA}/requirements`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { title: `E2E-S9-REQ-A-${SUFFIX_S9}` },
    })
    const reqA = (await reqARes.json()).requirement.id

    // task-no-req: project-A,冇 requirement
    const t1 = await request.post(`${BACKEND}/api/tasks`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { title: `TaskNoReq-${SUFFIX_S9}`, projectId: projectA },
    })
    taskNoReq = (await t1.json()).task.id

    // task-with-req: project-A,有 requirement
    const t2 = await request.post(`${BACKEND}/api/tasks`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { title: `TaskWithReq-${SUFFIX_S9}`, projectId: projectA, requirementIds: [reqA] },
    })
    taskWithReq = (await t2.json()).task.id

    // bug-only: project-A
    const b = await request.post(`${BACKEND}/api/bugs`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { title: `BugOnly-${SUFFIX_S9}`, projectId: projectA, severity: 'medium' },
    })
    bugOnly = (await b.json()).bug.id

    // Worklogs: 3 × 1 hour — tasks + bug
    for (const target of [
      { taskId: taskNoReq, hours: 1, workDate: '2026-06-09' },
      { taskId: taskWithReq, hours: 1, workDate: '2026-06-09' },
      { bugId: bugOnly, hours: 1, workDate: '2026-06-09' },
    ]) {
      const res = await request.post(`${BACKEND}/api/worklogs`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { ...target, note: 'sprint9-cost-test' },
      })
      expect(res.status(), `create worklog`).toBe(200)
    }
  })

  test.afterAll(async ({ request }, testInfo) => {
    const token = await apiLogin(request, testInfo.title + '-cleanup', 'admin')
    for (const pid of [projectA, projectB]) {
      await request.delete(`${BACKEND}/api/projects/${pid}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    }
  })

  test('GET /api/reports/cost?projectId=A: counts worklogs on task-no-req, task-with-req AND bug-only', async ({ request }, testInfo) => {
    const token = await apiLogin(request, testInfo.title)
    const res = await request.get(`${BACKEND}/api/reports/cost?projectId=${projectA}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    // 3 個 worklogs × 1 hour = 3
    expect(body.totalHours).toBe(3)
    expect(body.members).toHaveLength(1)
    expect(body.members[0].totalHours).toBe(3)
    // tasks array 入面應該有 2 個 task(bug worklog 唔會入 tasks array)
    expect(body.members[0].tasks).toHaveLength(2)
    const taskIds = body.members[0].tasks.map((t: { taskId: string }) => t.taskId)
    expect(taskIds).toContain(taskNoReq)
    expect(taskIds).toContain(taskWithReq)
  })

  test('GET /api/reports/cost?projectId=B: returns 0 hours (no leak)', async ({ request }, testInfo) => {
    const token = await apiLogin(request, testInfo.title)
    const res = await request.get(`${BACKEND}/api/reports/cost?projectId=${projectB}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    // project-B 冇 worklog
    expect(body.totalHours).toBe(0)
    expect(body.members).toHaveLength(0)
  })
})
