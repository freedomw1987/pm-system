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
    await expect(page.getByText('進行中任務')).toBeVisible()
    await expect(page.getByText('未解決缺陷')).toBeVisible()
    await expect(page.getByText('本週時數')).toBeVisible()
    await expect(page.getByText('項目總數')).toBeVisible()
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
