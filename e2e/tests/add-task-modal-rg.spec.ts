/**
 * AddTaskModal Regression Guards — Sprint 17 follow-up
 *
 * 守住 commit f6f3674 unify modal 之後曝光嘅兩個 bug:
 *
 * RG-016: ProjectKanban `handleAddTask` 簽名漏 `FormEvent` 參數
 *   - Before unify: inline `<form onSubmit={(e) => { e.preventDefault(); fn() }}>` swallow event,callee 0 args OK
 *   - After unify: 共用 component `<form onSubmit={onSubmit}>` 直接 forward event,callee 必須 accept + preventDefault
 *   - 唔守:form native submit → browser navigate → modal 消失,task 冇 create
 *
 * RG-017: ProjectDetailPage `assigneeOptions` 由 JSX.Element[] 過共用 component contract
 *   - Before unify: `assigneeOptions = members.map(m => <option>...)` JSX 數組,inline spread OK
 *   - After unify: 共用 component 入面再 `.map(m => <option key={m.id} value={m.id}>{m.name}</option>)`,但 JSX 冇 `.id` / `.name` field → render 空 / 撞 undefined
 *   - 唔守:select 冇 option 或 option value 係 undefined / "[object Object]"
 *
 * 對應紅線 13(每個 bug fix 必有 RG-XXX entry + regression test)。
 *
 * Spec 設計原則:
 * - 用真 docker stack 跑(假設 stack 已起,跟其他 spec 一樣)
 * - 用 admin login + 自己 seed 一個 project + requirement(避免依賴 fixture)
 * - Submit 流程用淺度 assert(URL 唔變 + modal 自動關 + task 出現),唔深入驗 task field
 *   (深度 verify 由 add-task-modal-unified.spec.ts 嘅 set-diff guard 處理)
 */

import { test, expect, type Page, type APIRequestContext } from '@playwright/test'
import { loginAs, USERS } from './_helpers'

const BACKEND = 'http://localhost:4001'
const FRONTEND = 'http://localhost:8080'

const SUFFIX = `rg${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
const PROJECT_NAME = `E2E-RG-016-017-${SUFFIX}`
const REQ_TITLE = `E2E-RG-Req-${SUFFIX}`

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
      localStorage.setItem('refreshToken', `e2e-rg-016-017-refresh`)
      localStorage.setItem('user', JSON.stringify(user))
    },
    { accessToken: token, user: userPayload },
  )
}

async function createProject(req: APIRequestContext, token: string, name: string): Promise<string> {
  const res = await req.post(`${BACKEND}/api/projects`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { name, description: `seeded by RG-016/017 E2E` },
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
    data: { title, description: 'RG-016/017 E2E seeded req' },
  })
  expect(res.status(), `create requirement ${title} should succeed`).toBe(200)
  const body = await res.json()
  return body.requirement.id as string
}

test.describe('Sprint 17 RG-016/017: AddTaskModal post-unify guards', () => {
  let projectId: string
  let adminToken: string

  test.beforeAll(async ({ request }, testInfo) => {
    adminToken = await apiLogin(request, testInfo.title + '-setup')
    projectId = await createProject(request, adminToken, PROJECT_NAME)
    await createRequirement(request, adminToken, projectId, REQ_TITLE)
  })

  // ─── RG-016: handleAddTask form submit 唔可以 native submit / navigate 走 ───
  test('RG-016: Kanban 入口 submit modal 唔會 native submit + 唔會 navigate 走', async ({
    page,
  }, testInfo) => {
    const token = await apiLogin(page.request, testInfo.title)
    await loginViaStorage(page, token)
    const targetUrl = `${FRONTEND}/projects/${projectId}`
    await page.goto(targetUrl)
    await page.waitForLoadState('networkidle')

    // 切去 Kanban tab
    await page.getByRole('button', { name: /看板/ }).first().click()
    await page.waitForLoadState('networkidle')

    // 開 modal(Kanban 入口)
    await page.getByRole('button', { name: '新增任務' }).first().click()
    const modal = page.locator('div.fixed.inset-0').filter({ hasText: '新建任務' })
    await expect(modal).toBeVisible({ timeout: 5_000 })

    // Capture URL 入 modal 之後
    const urlBeforeSubmit = page.url()

    // 填標題
    const taskTitle = `RG-016 ${SUFFIX}`
    await page.getByPlaceholder('輸入任務標題').fill(taskTitle)

    // Submit — 直接 click「建立任務」(form 嘅 type="submit" button)
    // 如果 handleAddTask 簽名漏 e arg + 冇 preventDefault → browser 會
    // 嘗試 form GET / POST,URL 會變(/projects/:id?... 或 navigate)
    await page.getByRole('button', { name: '建立任務' }).click()

    // 等 server roundtrip:modal 應該關
    await expect(modal).toHaveCount(0, { timeout: 10_000 })

    // ✓ RG-016 核心 assert:URL 冇變(form 冇 native submit)
    expect(
      page.url(),
      'RG-016: form submit 唔可以 native submit / navigate — URL 應該保持 /projects/:id',
    ).toBe(urlBeforeSubmit)

    // 任務應該出現喺 Kanban(pending column)。用 getByText 容易,如果見唔到
    // 證明 submit 個 path 整體唔 work(可能 e.preventDefault 後面 throw 咗)
    await expect(page.getByText(taskTitle).first()).toBeVisible({ timeout: 5_000 })
  })

  // ─── RG-017: assigneeOptions 必須真係 data,select 必須有合法 option ───
  test('RG-017: Task Tab 入口 modal 嘅「負責人」select 有合法 option(value truthy + text visible)', async ({
    page,
  }, testInfo) => {
    const token = await apiLogin(page.request, testInfo.title)
    await loginViaStorage(page, token)
    await page.goto(`${FRONTEND}/projects/${projectId}`)
    await page.waitForLoadState('networkidle')

    // 切去 Tasks tab
    await page.getByRole('button', { name: /任務 \(\d+\)/ }).first().click()
    await page.waitForLoadState('networkidle')

    // 開 modal(Tasks tab 入口)
    await page.getByRole('button', { name: /新建任務/ }).first().click()
    const modal = page.locator('div.fixed.inset-0').filter({ hasText: '新建任務' })
    await expect(modal).toBeVisible({ timeout: 5_000 })

    // 抽「負責人」select(label 「負責人」之後嗰個 select)
    const assigneeSelect = modal.locator('select').filter({
      has: page.locator('option', { hasText: '-- 不指定 --' }),
    })
    await expect(assigneeSelect, 'RG-017: 負責人 select 應該存在').toBeVisible()

    // ✓ RG-017 核心 assert:options 應該係真 <option>(唔係 JSX.Element[] cache,
    //    亦唔係 [object Object]),value attribute 應該係 string(唔係 undefined)
    const optionValues = await assigneeSelect.locator('option').evaluateAll((nodes) =>
      nodes.map((n) => ({
        value: (n as HTMLOptionElement).value,
        text: n.textContent?.trim() ?? '',
      })),
    )

    // 至少要有「-- 不指定 --」option(value="" 係合法)+ admin member option
    expect(optionValues.length, 'RG-017: 負責人 select 應該至少有 2 個 option (-- 不指定 -- + admin)').toBeGreaterThanOrEqual(
      2,
    )

    // 第一個應該係「-- 不指定 --」(value="")
    expect(optionValues[0]).toEqual({ value: '', text: '-- 不指定 --' })

    // 由第二個開始:value 必須係 truthy string + text 必須非空
    for (const opt of optionValues.slice(1)) {
      expect(
        opt.value,
        `RG-017: option value 必須係 truthy string,唔可以係 undefined / "[object Object]"。實際: ${JSON.stringify(opt)}`,
      ).toBeTruthy()
      expect(
        opt.value,
        `RG-017: option value 唔可以係 "[object Object]"(代表 JSX.Element 被 toString)`,
      ).not.toBe('[object Object]')
      expect(opt.text.length, `RG-017: option text 必須非空,實際 = ${JSON.stringify(opt)}`).toBeGreaterThan(0)
    }
  })

  // ─── RG-017 衍生:participantOptions 都應該係 data,ToggleMultiSelect 至少有 1 個 chip ───
  test('RG-017: Task Tab modal 嘅「參與人」(ToggleMultiSelect)至少 render 1 個 member chip', async ({
    page,
  }, testInfo) => {
    const token = await apiLogin(page.request, testInfo.title)
    await loginViaStorage(page, token)
    await page.goto(`${FRONTEND}/projects/${projectId}`)
    await page.waitForLoadState('networkidle')

    // 開 modal
    await page.getByRole('button', { name: /任務 \(\d+\)/ }).first().click()
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: /新建任務/ }).first().click()
    const modal = page.locator('div.fixed.inset-0').filter({ hasText: '新建任務' })
    await expect(modal).toBeVisible({ timeout: 5_000 })

    // ToggleMultiSelect 喺「參與人」label 下面,每個 member 係一個 toggle button
    // (跟 ToggleMultiSelect.tsx 嘅 render),點 button 會 toggle 加入
    const labelLocator = modal.getByText('參與人', { exact: true })
    await expect(labelLocator).toBeVisible()

    // ToggleMultiSelect 嘅 buttons 喺 ProjectDetailPage 嘅 project 入面起碼有 admin(creator)
    // 所以 modal 內任何一個 admin name 嘅 toggle button 都係 valid sign
    // 用比較寬鬆嘅 assert:modal 入面有起碼 1 個有 type="button" 嘅 chip 出現喺
    // 「參與人」label 之後(唔包括 footer 嘅取消 / 建立任務 button)
    //
    // 簡化嘅 assert:整個 modal 入面有 ≥3 個 button(關閉 X + 取消 + 建立任務,任何
    // 多嘅 button 就係 toggle chip)
    const allButtons = await modal.locator('button').count()
    expect(
      allButtons,
      `RG-017: modal 入面 button 數應該 ≥4 (X close + cancel + submit + 至少 1 個 participant chip),實際 = ${allButtons}`,
    ).toBeGreaterThanOrEqual(4)
  })
})
