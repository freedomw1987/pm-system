/**
 * AddTaskModal Edit-mode unification — Sprint 18 TD-NEW-7 guard
 *
 * 守 Sprint 18 嘅 EditTaskModal 改用 AddTaskModal 共用 component(extraFields
 * slot pattern)後,Edit mode 嘅 behaviour 唔 drift。
 *
 * 三個 invariant:
 * - T1: Edit mode 開出 modal 嘅 heading 應該係「編輯任務」(唔係「新建任務」)
 * - T2: Edit mode 個 submit button label 應該係「保存」(唔係「建立任務」)
 * - T3: Edit mode 多咗「狀態」dropdown(extraFields slot)— 4 個 status option
 *       (待處理 / 進行中 / 測試中 / 已完成),同 AddTaskModal 嗰 8 個 field 一齊 render
 *
 * 點解呢 3 條 invariant 重要:
 * - T1 + T2:如果將來有人改 AddTaskModal 嘅 default heading / submit label,
 *   Edit mode 會跟住 default 走而漂走自己嘅 i18n/spec
 * - T3:extraFields slot 將來容易畀人拎走(eg.「Edit 用唔到 status?」誤刪)
 *
 * 跟 add-task-modal-unified.spec.ts 同一個 IP isolation + admin seed pattern。
 */

import { test, expect, type Page, type APIRequestContext } from '@playwright/test'
import { loginAs, USERS } from './_helpers'

const BACKEND = 'http://localhost:4001'
const FRONTEND = 'http://localhost:8080'

const SUFFIX = `edit${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
const PROJECT_NAME = `E2E-Edit-Modal-${SUFFIX}`
const REQ_TITLE = `E2E-Edit-Req-${SUFFIX}`

async function apiLogin(req: APIRequestContext, testTitle: string): Promise<string> {
  return loginAs(req, 'admin', testTitle)
}

async function loginViaStorage(page: Page, token: string, role: keyof typeof USERS = 'admin') {
  const userPayload = {
    id: role,
    name: role === 'admin' ? '系統管理員' : role,
    email: USERS[role].email,
    role,
  }
  await page.goto(`${FRONTEND}/login`)
  await page.evaluate(
    ({ accessToken, user }) => {
      localStorage.setItem('accessToken', accessToken)
      localStorage.setItem('refreshToken', `e2e-edit-modal-refresh`)
      localStorage.setItem('user', JSON.stringify(user))
    },
    { accessToken: token, user: userPayload },
  )
}

async function createProject(req: APIRequestContext, token: string, name: string): Promise<string> {
  const res = await req.post(`${BACKEND}/api/projects`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { name, description: `seeded by Edit-task-modal E2E` },
  })
  expect(res.status(), `create project ${name} should succeed`).toBe(200)
  const body = await res.json()
  return body.project.id as string
}

async function createRequirement(
  req: APIRequestContext,
  token: string,
  projectId: string,
  title: string,
): Promise<string> {
  const res = await req.post(`${BACKEND}/api/projects/${projectId}/requirements`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { title, description: 'Edit modal E2E seeded req' },
  })
  expect(res.status(), `create requirement ${title} should succeed`).toBe(200)
  const body = await res.json()
  return body.requirement.id as string
}

async function createTask(
  req: APIRequestContext,
  token: string,
  requirementId: string,
  title: string,
): Promise<string> {
  const res = await req.post(`${BACKEND}/api/tasks`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      title,
      description: 'Edit modal E2E seeded task',
      requirementIds: [requirementId],
      estimatedHours: 1,
    },
  })
  expect(res.status(), `create task ${title} should succeed`).toBe(200)
  const body = await res.json()
  return body.task.id as string
}

test.describe('Sprint 18 TD-NEW-7: AddTaskModal Edit-mode unify regression', () => {
  let projectId: string
  let requirementId: string
  let adminToken: string

  test.beforeAll(async ({ request }, testInfo) => {
    adminToken = await apiLogin(request, testInfo.title + '-setup')
    projectId = await createProject(request, adminToken, PROJECT_NAME)
    requirementId = await createRequirement(request, adminToken, projectId, REQ_TITLE)
    // Seed a task for Edit-mode tests
    await createTask(request, adminToken, requirementId, `E2E-Edit-Existing-Task-${SUFFIX}`)
  })

  // ─── T1: heading override ───
  test('T1: Edit mode heading 應該係「編輯任務」(唔係 default「新建任務」)', async ({
    page,
  }, testInfo) => {
    const token = await apiLogin(page.request, testInfo.title)
    await loginViaStorage(page, token)
    await page.goto(`${FRONTEND}/projects/${projectId}`)
    await page.waitForLoadState('networkidle')

    // 切去 Tasks tab
    await page.getByRole('button', { name: /任務 \(\d+\)/ }).first().click()
    await page.waitForLoadState('networkidle')

    // 揾到個 task row 嘅「編輯任務」button(Lucide Edit2 icon button)
    // 跟 ProjectDetailPage.tsx pattern,Edit button 用 Edit2 icon
    const taskRow = page.locator('h4', { hasText: 'E2E-Edit-Existing-Task-' + SUFFIX }).first()
    await expect(taskRow).toBeVisible({ timeout: 5_000 })
    // 揾 row 內嘅 Edit2 button(aria-label 唔 set,fallback 用 SVG sibling heuristic)
    const editButton = page
      .locator('div').filter({ has: taskRow })
      .first()
      .locator('button').filter({ has: page.locator('svg.lucide-pen, svg.lucide-edit-2, svg.lucide-edit') })
      .first()
    await editButton.click({ timeout: 5_000 }).catch(async () => {
      // Fallback: click 任何 button 喺 task row 入面
      const allBtns = await page
        .locator('div').filter({ has: taskRow })
        .first()
        .locator('button').all()
      for (const btn of allBtns) {
        const html = await btn.innerHTML().catch(() => '')
        if (html.includes('pen') || html.includes('edit')) {
          await btn.click()
          return
        }
      }
      throw new Error('No Edit button found in task row')
    })

    // 等 modal 出
    const modal = page.locator('div.fixed.inset-0').filter({ hasText: '編輯任務' })
    await expect(modal).toBeVisible({ timeout: 5_000 })

    // ✓ T1 core assert:heading 應該係「編輯任務」
    await expect(modal.getByRole('heading', { name: '編輯任務' })).toBeVisible()

    // Sanity: 唔應該有「新建任務」heading
    const newTaskHeadings = await page.getByRole('heading', { name: '新建任務' }).count()
    expect(newTaskHeadings, 'T1: Edit mode 不應該見到「新建任務」heading').toBe(0)
  })

  // ─── T2: submit label override ───
  test('T2: Edit mode submit button label 應該係「保存」(唔係「建立任務」)', async ({
    page,
  }, testInfo) => {
    const token = await apiLogin(page.request, testInfo.title)
    await loginViaStorage(page, token)
    await page.goto(`${FRONTEND}/projects/${projectId}`)
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: /任務 \(\d+\)/ }).first().click()
    await page.waitForLoadState('networkidle')

    // 用同一個 pattern 開 Edit modal
    const taskRow = page.locator('h4', { hasText: 'E2E-Edit-Existing-Task-' + SUFFIX }).first()
    await expect(taskRow).toBeVisible({ timeout: 5_000 })
    const editButton = page
      .locator('div').filter({ has: taskRow })
      .first()
      .locator('button').filter({ has: page.locator('svg.lucide-pen, svg.lucide-edit-2, svg.lucide-edit') })
      .first()
    await editButton.click({ timeout: 5_000 })

    const modal = page.locator('div.fixed.inset-0').filter({ hasText: '編輯任務' })
    await expect(modal).toBeVisible({ timeout: 5_000 })

    // ✓ T2 core assert:submit button 應該係「保存」
    const saveButton = modal.getByRole('button', { name: '保存' })
    await expect(saveButton, 'T2: Edit mode submit button 應該係「保存」').toBeVisible()

    // Sanity: 唔應該有「建立任務」submit button
    const createTaskButtons = await modal.getByRole('button', { name: '建立任務' }).count()
    expect(createTaskButtons, 'T2: Edit mode 不應該見到「建立任務」submit button').toBe(0)
  })

  // ─── T3: extraFields slot — Status dropdown present + 4 options ───
  test('T3: Edit mode 多咗「狀態」dropdown (extraFields slot),4 個 status option', async ({
    page,
  }, testInfo) => {
    const token = await apiLogin(page.request, testInfo.title)
    await loginViaStorage(page, token)
    await page.goto(`${FRONTEND}/projects/${projectId}`)
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: /任務 \(\d+\)/ }).first().click()
    await page.waitForLoadState('networkidle')

    const taskRow = page.locator('h4', { hasText: 'E2E-Edit-Existing-Task-' + SUFFIX }).first()
    await expect(taskRow).toBeVisible({ timeout: 5_000 })
    const editButton = page
      .locator('div').filter({ has: taskRow })
      .first()
      .locator('button').filter({ has: page.locator('svg.lucide-pen, svg.lucide-edit-2, svg.lucide-edit') })
      .first()
    await editButton.click({ timeout: 5_000 })

    const modal = page.locator('div.fixed.inset-0').filter({ hasText: '編輯任務' })
    await expect(modal).toBeVisible({ timeout: 5_000 })

    // ✓ T3 core assert:「狀態」label + 跟住嘅 select
    const statusLabel = modal.getByText('狀態', { exact: true })
    await expect(statusLabel, 'T3: Edit mode 應該有「狀態」label (extraFields slot)').toBeVisible()

    // Status select 應該有 4 個 option
    const statusSelect = modal.locator('select').filter({ has: page.locator('option', { hasText: '待處理' }) })
    await expect(statusSelect, 'T3: Status select 應該存在').toBeVisible()
    const optionValues = await statusSelect.locator('option').evaluateAll((nodes) =>
      nodes.map((n) => ({ value: (n as HTMLOptionElement).value, text: n.textContent?.trim() })),
    )
    expect(optionValues.length, 'T3: Status select 應該有 4 個 option').toBe(4)
    expect(optionValues.map((o) => o.value).sort()).toEqual(
      ['completed', 'in_progress', 'pending', 'testing'].sort(),
    )
  })
})
