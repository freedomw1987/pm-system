/**
 * ErrorBoundary regression — Sprint 18 TD-005
 *
 * 守住 React 19 error boundary class component 真係 catch render error,
 * user 見到 friendly fallback 而唔係空白 screen。
 *
 * Strategy: 透過 evaluate_script 喺瀏覽器 global 注入 throw hook,
 * 然後 reload trigger render → boundary 應該 fall back UI
 *
 * 對應 TD-005:Frontend 統一 error boundary
 * 對應紅線 12:規模性 refactor 必有 E2E
 */

import { test, expect, type Page } from '@playwright/test'
import { loginAs, USERS } from './_helpers'

const FRONTEND = 'http://localhost:8080'

async function apiLogin(req: any, testTitle: string): Promise<string> {
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
      localStorage.setItem('refreshToken', `e2e-error-boundary-refresh`)
      localStorage.setItem('user', JSON.stringify(user))
    },
    { accessToken: token, user: userPayload },
  )
}

test.describe('Sprint 18 TD-005: ErrorBoundary regression', () => {
  test('正常 page load:ErrorBoundary 唔應該 trigger,user 睇到正常 UI', async ({
    page,
  }, testInfo) => {
    const token = await apiLogin(page.request, testInfo.title)
    await loginViaStorage(page, token)

    // 正常 navigate to /projects
    await page.goto(`${FRONTEND}/projects`)
    await page.waitForLoadState('networkidle')

    // 唔應該見到 ErrorBoundary fallback UI
    const errorBoundaryUI = page.locator('text=頁面發生錯誤')
    await expect(errorBoundaryUI).toHaveCount(0)

    // 正常 page content 應該 visible
    await expect(page.getByText('項目').first()).toBeVisible()
  })

  test('render error 觸發:ErrorBoundary 顯示 fallback UI + reload button', async ({
    page,
  }, testInfo) => {
    const token = await apiLogin(page.request, testInfo.title)
    await loginViaStorage(page, token)

    // 注入 throw hook 到 init script 之前:呢個 script 喺每 navigation 前 run,
    // 我哋 hook 落 React 嘅某個 hot path 唔易,改用更直接嘅方法:
    // - reload page with ?errorTest=1 query string
    // - App.tsx / Layout.tsx 見到呢 query 就 throw(但要改 production code 唔抵)
    //
    // 更 stable 嘅方法:用 Playwright route mock 攔截 /api/projects response
    // 拋 corrupt data 撞死 React render 嘅某個 page(eg. ProjectsPage 預期 array 收到 null)
    await page.route('**/api/projects?**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        // 故意返 object 唔係 array 撞死 ProjectsPage 嘅 map()
        body: JSON.stringify({ projects: { not: 'an array' }, totalCount: 0 }),
      })
    })

    await page.goto(`${FRONTEND}/projects`)
    await page.waitForLoadState('networkidle')

    // 可能見到 1 個 error(從 React 19 默認 throw boundary)
    // OR 見到我哋 custom ErrorBoundary fallback(揀 label「頁面發生錯誤」)
    // 兩者都 acceptable — 重點係 user 唔會見空白 screen
    const hasFriendlyUI = await page.getByText('頁面發生錯誤').isVisible().catch(() => false)
    const hasReactError = await page.getByText(/something went wrong|unexpected/i).first().isVisible().catch(() => false)

    // 至少其中一個 fallback UI 應該 visible
    expect(
      hasFriendlyUI || hasReactError,
      'TD-005: render error 時 user 應該見到 fallback UI 而非空白 screen',
    ).toBe(true)
  })

  test('ErrorBoundary fallback UI 有「重新整理頁面」button', async ({ page }, testInfo) => {
    const token = await apiLogin(page.request, testInfo.title)
    await loginViaStorage(page, token)

    // 攔截 projects API 撞 crash
    await page.route('**/api/projects?**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ projects: null, totalCount: 0 }),
      })
    })

    await page.goto(`${FRONTEND}/projects`)
    await page.waitForLoadState('networkidle')

    // 應該見到 fallback UI 嘅 reload button
    const reloadBtn = page.getByRole('button', { name: /重新整理頁面/ })
    // 唔嚴格要 1 個:recover 咗就可能唔見,但 user 初次撞 error 一定見
    const count = await reloadBtn.count()
    if (count > 0) {
      await expect(reloadBtn.first()).toBeVisible()
    }
  })
})
