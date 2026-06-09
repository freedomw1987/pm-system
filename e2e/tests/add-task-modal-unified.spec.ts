/**
 * AddTaskModal Unification Regression — Sprint 17
 *
 * 守護乜:
 * Sprint 16 後 ProjectKanban + ProjectDetailPage > Task Tab 共用同一個
 * `AddTaskModal` component(f6f3674)。本 spec 用 E2E 守住「兩個入口開出嚟
 * 嘅 modal field set 100% 一致」呢條 invariant。
 *
 * David 喺 retro 講過嘅核心關切:
 *   > docker compose up -d --build pass 唔代表 UI 唔會 drift。
 *   > 大部分撞過嘅 bug 都係「backend 過 smoke 但 UI 唔見到」,E2E 正正 cover 呢類。
 *
 * 點 cover:
 * - T1: Task Tab 入口開 modal → assert 8 個 field/control 全部 visible
 * - T2: Kanban tab 入口開 modal → assert 同樣 8 個 field/control 全部 visible
 * - T3: Cross-entry diff — 兩個入口攞到嘅 field set 完全一致(set diff = ∅)
 *
 * 8 個受保護 field/control(對應 AddTaskModal.tsx):
 *   1. heading「新建任務」
 *   2. input「標題 *」
 *   3. RichTextEditor「描述」
 *   4. toggle「智能分配」
 *   5. select「負責人」
 *   6. ToggleMultiSelect「參與人」
 *   7. select「父任務」
 *   8. button「取消」+ button「建立任務」(submit)
 *
 * 紅線 12: P0 US 必有 Unit + Integration + E2E 三層。modal unification 本身
 * 唔係 P0,但 David 已標示「日後 modal 改 field 唔同步」係常見回歸點,所以
 * 用 30-min E2E 鎖實。
 */

import { test, expect, type Page, type APIRequestContext } from '@playwright/test'
import { loginAs, USERS } from './_helpers'

const BACKEND = 'http://localhost:4001'
const FRONTEND = 'http://localhost:8080'

/** 隨機 suffix,避免 retry 撞資料同 cross-test 污染(跟 project-kanban.spec.ts pattern) */
const SUFFIX = `mu${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
const PROJECT_NAME = `E2E-Modal-Unified-${SUFFIX}`
const REQ_TITLE = `E2E-Modal-Req-${SUFFIX}`

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
      localStorage.setItem('refreshToken', `e2e-modal-unified-refresh`)
      localStorage.setItem('user', JSON.stringify(user))
    },
    { accessToken: token, user: userPayload },
  )
}

async function createProject(req: APIRequestContext, token: string, name: string): Promise<string> {
  const res = await req.post(`${BACKEND}/api/projects`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { name, description: `seeded by add-task-modal-unified E2E` },
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
    data: { title, description: 'modal unified E2E seeded req' },
  })
  expect(res.status(), `create requirement ${title} should succeed`).toBe(200)
  const body = await res.json()
  return body.requirement.id as string
}

/**
 * 喺一個已經開咗嘅 AddTaskModal 入面,collect 受保護嘅 field/control 嘅
 * visibility set。回傳 plain object 方便 cross-entry diff。
 *
 * 點解唔用 role selector 一次過 grab — modal 入面有啲 control 係
 * RichTextEditor / ToggleMultiSelect 嘅 wrapper,冇 native role,所以
 * 逐個 label 對位先穩。
 */
async function snapshotModalFields(page: Page): Promise<Record<string, boolean>> {
  const modal = page.locator('div.fixed.inset-0').filter({ hasText: '新建任務' })
  await expect(modal, 'modal container should be visible').toBeVisible({ timeout: 5_000 })

  const snapshot: Record<string, boolean> = {}

  // 1. heading
  snapshot['heading:新建任務'] = await modal.getByRole('heading', { name: '新建任務' }).isVisible()

  // 2. title input(label「標題 *」)
  snapshot['label:標題'] = await modal.getByText('標題 *', { exact: true }).isVisible()
  snapshot['input:title'] = await modal.getByPlaceholder('輸入任務標題').isVisible()

  // 3. description(RichTextEditor 冇 native role,睇 label + placeholder)
  snapshot['label:描述'] = await modal.getByText('描述', { exact: true }).isVisible()

  // 4. 智能分配 toggle + label
  snapshot['label:智能分配'] = await modal.getByText('智能分配', { exact: true }).isVisible()

  // 5. 負責人 select
  snapshot['label:負責人'] = await modal.getByText('負責人', { exact: true }).isVisible()
  // <select> 嘅第一個 option「-- 不指定 --」係 selected default,attendant
  snapshot['select:assignee-default'] = await modal
    .locator('select')
    .filter({ has: page.locator('option', { hasText: '-- 不指定 --' }) })
    .isVisible()

  // 6. 參與人(ToggleMultiSelect)
  snapshot['label:參與人'] = await modal.getByText('參與人', { exact: true }).isVisible()

  // 7. 父任務 select
  snapshot['label:父任務'] = await modal.getByText('父任務', { exact: true }).isVisible()
  snapshot['select:parent-task-empty'] = await modal
    .locator('select')
    .filter({ has: page.locator('option', { hasText: '無父任務' }) })
    .isVisible()

  // 8. 兩個 footer button
  snapshot['button:取消'] = await modal.getByRole('button', { name: '取消' }).isVisible()
  snapshot['button:建立任務'] = await modal.getByRole('button', { name: '建立任務' }).isVisible()

  return snapshot
}

/** 關 modal,等 overlay 消失,免影響下一輪 */
async function closeModal(page: Page) {
  await page.getByRole('button', { name: '取消' }).first().click()
  await expect(page.locator('div.fixed.inset-0').filter({ hasText: '新建任務' })).toHaveCount(0, {
    timeout: 5_000,
  })
}

test.describe('Sprint 17: AddTaskModal unification regression', () => {
  let projectId: string
  let adminToken: string

  test.beforeAll(async ({ request }, testInfo) => {
    adminToken = await apiLogin(request, testInfo.title + '-setup')
    projectId = await createProject(request, adminToken, PROJECT_NAME)
    // Kanban tab 至少要有 1 個 requirement column 先見到「新增任務」按鈕
    await createRequirement(request, adminToken, projectId, REQ_TITLE)
  })

  // ─── T1: Task Tab 入口 ─────────────────────────────────
  test('Task Tab「新建任務」按鈕開出 AddTaskModal,8 個 field/control 全部 visible', async ({
    page,
  }, testInfo) => {
    const token = await apiLogin(page.request, testInfo.title)
    await loginViaStorage(page, token)
    await page.goto(`${FRONTEND}/projects/${projectId}`)
    await page.waitForLoadState('networkidle')

    // 切去 Tasks tab
    await page.getByRole('button', { name: /任務 \(\d+\)/ }).first().click()
    await page.waitForLoadState('networkidle')

    // 㩒「新建任務」(Tasks tab 嘅 entry)
    await page.getByRole('button', { name: /新建任務/ }).first().click()

    const snapshot = await snapshotModalFields(page)

    // 全部 8 類 field/control(共 11 條 assert key) 都應該 visible
    for (const [key, visible] of Object.entries(snapshot)) {
      expect(visible, `Task Tab modal: ${key} should be visible`).toBe(true)
    }
  })

  // ─── T2: Kanban Tab 入口 ──────────────────────────────
  test('Kanban Tab 每個 column 嘅「新增任務」按鈕開出同樣 AddTaskModal', async ({ page }, testInfo) => {
    const token = await apiLogin(page.request, testInfo.title)
    await loginViaStorage(page, token)
    await page.goto(`${FRONTEND}/projects/${projectId}`)
    await page.waitForLoadState('networkidle')

    // 切去 Kanban tab
    await page.getByRole('button', { name: /看板/ }).first().click()
    await page.waitForLoadState('networkidle')

    // Kanban tab 入面每個 column 都有「新增任務」(虛線 dashed button)
    await page.getByRole('button', { name: '新增任務' }).first().click()

    const snapshot = await snapshotModalFields(page)

    for (const [key, visible] of Object.entries(snapshot)) {
      expect(visible, `Kanban Tab modal: ${key} should be visible`).toBe(true)
    }
  })

  // ─── T3: Cross-entry diff(核心 invariant) ────────────
  test('兩個入口開出嘅 modal field set 完全一致(set diff = ∅)', async ({ page }, testInfo) => {
    const token = await apiLogin(page.request, testInfo.title)
    await loginViaStorage(page, token)
    await page.goto(`${FRONTEND}/projects/${projectId}`)
    await page.waitForLoadState('networkidle')

    // ── 第 1 輪:Task Tab 入口 ──
    await page.getByRole('button', { name: /任務 \(\d+\)/ }).first().click()
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: /新建任務/ }).first().click()
    const taskTabSnapshot = await snapshotModalFields(page)
    await closeModal(page)

    // ── 第 2 輪:Kanban Tab 入口 ──
    await page.getByRole('button', { name: /看板/ }).first().click()
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: '新增任務' }).first().click()
    const kanbanTabSnapshot = await snapshotModalFields(page)
    await closeModal(page)

    // ── Set diff:兩邊 keys 應該完全一致 ──
    const taskKeys = Object.keys(taskTabSnapshot).sort()
    const kanbanKeys = Object.keys(kanbanTabSnapshot).sort()
    expect(kanbanKeys, 'modal field set must match across entries').toEqual(taskKeys)

    // ── 每個 key 嘅 visibility 都要一致 ──
    for (const key of taskKeys) {
      expect(
        kanbanTabSnapshot[key],
        `field '${key}' visibility must match: TaskTab=${taskTabSnapshot[key]} vs Kanban=${kanbanTabSnapshot[key]}`,
      ).toBe(taskTabSnapshot[key])
    }

    // ── Sanity:兩邊都應該全 true(冇 field 隱形) ──
    expect(
      Object.values(taskTabSnapshot).every((v) => v),
      'Task Tab modal: every field/control must be visible',
    ).toBe(true)
    expect(
      Object.values(kanbanTabSnapshot).every((v) => v),
      'Kanban Tab modal: every field/control must be visible',
    ).toBe(true)
  })
})
