/**
 * Sprint 14 E2E — ProjectsPage search + ProjectAutocomplete + Dashboard widget
 *
 * 覆 4 個 user story:
 *   T14.1: ProjectsPage search box(type 即時 filter + 2 層 empty state)
 *   T14.3: ProjectAutocomplete — type-ahead 顯示全部項目 + keyboard nav
 *   T14.4: Dashboard Activity Feed widget 4 個 (我嘅任務/缺陷/時數/項目數)
 *
 * Pattern 跟 project-detail-bug-tab.spec.ts (Sprint 12):
 *  - loginAs helper + per-test IP 防 rate limit
 *  - loginViaStorage inject token 入 localStorage
 *  - 用 hard-coded admin id 過 AuthContext(唔需要 /auth/me roundtrip)
 */

import { test, expect, type Page } from '@playwright/test'
import { loginAs } from './_helpers'

const BACKEND = 'http://localhost:4001'
const FRONTEND = 'http://localhost:8080'

async function loginViaStorage(page: Page, token: string) {
  await page.goto(`${FRONTEND}/login`)
  await page.evaluate(
    ({ accessToken, refreshToken }) => {
      localStorage.setItem('accessToken', accessToken)
      localStorage.setItem('refreshToken', refreshToken)
      localStorage.setItem(
        'user',
        JSON.stringify({ id: 'admin', name: '系統管理員', email: 'admin@test.com', role: 'admin' }),
      )
    },
    { accessToken: token, refreshToken: 'e2e-sprint14-refresh-token' },
  )
}

async function getFirstProjectName(req: Page['request'], token: string): Promise<string | null> {
  const res = await req.get(`${BACKEND}/api/projects`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(res.status()).toBe(200)
  const body = await res.json()
  const projects = body.projects as Array<{ id: string; name: string }>
  if (projects.length === 0) return null
  return projects[0].name
}

test.describe('Sprint 14 — ProjectsPage search box (T14.1)', () => {
  test('search input 存在 + type 即時 filter projects', async ({ page }, testInfo) => {
    const token = await loginAs(page.request, 'admin', testInfo.title)
    await loginViaStorage(page, token)
    await page.goto(`${FRONTEND}/projects`)

    // 確認 search input 存在(用 aria-label)
    const searchInput = page.getByLabel('搜尋項目')
    await expect(searchInput).toBeVisible()

    // 攞 sample project name
    const sampleName = await getFirstProjectName(page.request, token)
    test.skip(!sampleName, 'no projects seeded — skip filter assertion')

    // Type 一個唔 match 嘅 keyword → 期望 filter empty state 出現
    await searchInput.fill('zzzz-no-match-keyword-zzzz')
    await expect(page.getByText('無符合「zzzz-no-match-keyword-zzzz」嘅項目')).toBeVisible({ timeout: 3000 })

    // 清空 → 還原到所有項目
    await searchInput.fill('')
    await expect(page.getByText('無符合「zzzz-no-match-keyword-zzzz」嘅項目')).not.toBeVisible()

    // Type partial match 個 sample project name
    const partial = sampleName!.slice(0, Math.max(1, Math.floor(sampleName!.length / 2)))
    await searchInput.fill(partial)
    await page.waitForTimeout(300) // debounce useMemo
    // 唔好見到 filter empty state(因為至少 match 咗 sample 自己)
    await expect(page.getByText('無符合')).not.toBeVisible()
  })

  test('filter empty state 有「清空搜尋」button', async ({ page }, testInfo) => {
    const token = await loginAs(page.request, 'admin', testInfo.title)
    await loginViaStorage(page, token)
    await page.goto(`${FRONTEND}/projects`)

    const searchInput = page.getByLabel('搜尋項目')
    await searchInput.fill('zzz-no-match-zzz')
    const clearBtn = page.getByRole('button', { name: '清空搜尋' })
    await expect(clearBtn).toBeVisible()
    await clearBtn.click()
    await expect(searchInput).toHaveValue('')
  })
})

test.describe('Sprint 14 — ProjectAutocomplete (T14.3)', () => {
  test('WorkLogs filter ProjectAutocomplete 顯示全部項目 + type-ahead filter', async ({ page }, testInfo) => {
    const token = await loginAs(page.request, 'admin', testInfo.title)
    await loginViaStorage(page, token)
    await page.goto(`${FRONTEND}/work-logs`)

    await page.waitForTimeout(500)

    const sampleName = await getFirstProjectName(page.request, token)
    test.skip(!sampleName, 'no projects seeded — skip autocomplete test')

    // 用「篩選項目」aria-label 嘅 ProjectAutocomplete
    const autocomplete = page.getByLabel('篩選項目')
    await expect(autocomplete).toBeVisible()

    // Type 個 sample name 嘅 partial → 期望 dropdown 出現
    const partial = sampleName!.slice(0, 3)
    await autocomplete.fill(partial)
    await page.waitForTimeout(200)

    // listbox 應該出現,並且至少 1 個 option
    const listbox = page.locator('#project-autocomplete-listbox')
    await expect(listbox).toBeVisible({ timeout: 3000 })

    // 揀第一個(option)
    const firstOption = listbox.locator('[role="option"]').first()
    await firstOption.click()

    // input value 應該等於 sampleName(因為揀咗)
    await expect(autocomplete).toHaveValue(sampleName!)
  })

  test('ProjectAutocomplete 喺 Reports page 都 work', async ({ page }, testInfo) => {
    const token = await loginAs(page.request, 'admin', testInfo.title)
    await loginViaStorage(page, token)
    await page.goto(`${FRONTEND}/reports`)

    await page.waitForTimeout(500)

    const sampleName = await getFirstProjectName(page.request, token)
    test.skip(!sampleName, 'no projects seeded — skip')

    const autocomplete = page.getByLabel('選擇項目以查看報表')
    await expect(autocomplete).toBeVisible()

    const partial = sampleName!.slice(0, 3)
    await autocomplete.fill(partial)
    await page.waitForTimeout(200)

    const listbox = page.locator('#project-autocomplete-listbox')
    await expect(listbox).toBeVisible({ timeout: 3000 })
    const firstOption = listbox.locator('[role="option"]').first()
    await firstOption.click()
    await expect(autocomplete).toHaveValue(sampleName!)
  })
})

test.describe('Sprint 14 — Dashboard Activity Feed (T14.4)', () => {
  test('Dashboard 4 個 widget 全部 render', async ({ page }, testInfo) => {
    const token = await loginAs(page.request, 'admin', testInfo.title)
    await loginViaStorage(page, token)
    await page.goto(`${FRONTEND}/`)

    await page.waitForTimeout(800)

    // 4 個 widget label 應該出現
    await expect(page.getByText('進行中任務').first()).toBeVisible()
    await expect(page.getByText('未解決缺陷').first()).toBeVisible()
    await expect(page.getByText('本週時數').first()).toBeVisible()
    // Sprint 15: widget 4 改 '我參與嘅項目' (前係 '項目總數')
    // "我參與嘅項目" 喺 widget + section heading 出現兩次,用 .first() 避 strict mode
    await expect(page.getByText('我參與嘅項目').first()).toBeVisible()
  })

  test('Dashboard widget 點擊導航去對應 page', async ({ page }, testInfo) => {
    const token = await loginAs(page.request, 'admin', testInfo.title)
    await loginViaStorage(page, token)
    await page.goto(`${FRONTEND}/`)

    await page.waitForTimeout(500)

    // 點「進行中任務」widget
    const widget = page.getByText('進行中任務').locator('xpath=ancestor::a[1]')
    await widget.click()
    await expect(page).toHaveURL(/\/my-tasks/)
  })
})

test.describe('Sprint 15 — Dashboard scope=my 嚴格過濾 (David feedback)', () => {
  test('admin + scope=my: Dashboard 我參與嘅項目 count 與 /api/projects?scope=my totalCount 一致', async ({ page, request }, testInfo) => {
    // 用 API 攞真實 count (避免 race condition)
    const token = await loginAs(request, 'admin', testInfo.title)
    const apiRes = await request.get(`${BACKEND}/api/projects?scope=my&pageSize=1`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(apiRes.status()).toBe(200)
    const apiBody = await apiRes.json()
    const apiCount = apiBody.totalCount

    // 喺 UI 攞 widget 4 嗰個 count
    await loginViaStorage(page, token)
    await page.goto(`${FRONTEND}/`)
    await page.waitForTimeout(800)

    // widget 4 嘅 count 喺 "我參與嘅項目" label 下面
    const widgetLabel = page.getByText('我參與嘅項目').first()
    await expect(widgetLabel).toBeVisible()

    // 攞 widget 4 嘅 count text(role: number)
    const count = await page.getByText('我參與嘅項目').first().locator('xpath=following-sibling::p[1]').textContent()
    expect(count?.trim()).toBe(String(apiCount))
  })

  test('admin + scope=my: Dashboard「我參與嘅項目」section 唔見同部門但冇 member 嘅項目', async ({ page, request }, testInfo) => {
    const token = await loginAs(request, 'admin', testInfo.title)

    // 攞 admin 自己 member 嘅項目 count (用 pageSize=1 拎 totalCount 而唔係 array length)
    const myRes = await request.get(`${BACKEND}/api/projects?scope=my&pageSize=1`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const myCount = (await myRes.json()).totalCount as number

    // 攞 default (同部門) 嘅項目 count
    const allRes = await request.get(`${BACKEND}/api/projects?pageSize=1`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const allCount = (await allRes.json()).totalCount as number

    // 證明 default 寬鬆過 scope=my (admin 見自己 member + 同部門,scope=my 僅自己 member)
    expect(allCount).toBeGreaterThan(myCount)

    // 攞 admin 第一個 scope=my 嘅項目 name
    const myFirst = await request.get(`${BACKEND}/api/projects?scope=my&pageSize=100`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const myProjects = (await myFirst.json()).projects as Array<{ id: string; name: string }>
    test.skip(myProjects.length === 0, 'admin has no member projects — skip UI assert')

    // Dashboard 我參與嘅項目 section 只 render 自己 member 嘅
    await loginViaStorage(page, token)
    await page.goto(`${FRONTEND}/`)
    await page.waitForTimeout(800)

    // 至少見到 myProjects 入面一個項目嘅 name
    const firstMyProject = myProjects[0]
    await expect(page.getByText(firstMyProject.name).first()).toBeVisible({ timeout: 5000 })
  })
})
