/**
 * Profile page E2E test
 *
 * 涵蓋 US-1.4 (P0) 「作為已登入用戶,我可以喺 /profile 修改自己嘅密碼」
 *
 * 守嘅 invariant:
 *  - /profile 必須 render 用戶資料(name / email / role / id)
 *  - 「修改密碼」form 必須有 client-side validation(length >= 6 + 確認密碼)
 *  - 後端要擋錯誤 currentPassword(INVALID_PASSWORD 400)
 *  - Happy path 寫入 DB → 跟住用新密碼可重新登入
 *  - 一定要還原密碼(其他 test 用同一個 seeded admin)
 *  - 未登入 user 訪問 /profile → redirect 去 /login(ProtectedRoute)
 *
 * RG-012 守則:每個 test 用獨立 IP(透過 `loginAs` 自動 inject
 * `X-Forwarded-For`)防 backend 5 attempts/60s rate limit 撞。
 */

import { expect } from '@playwright/test'
import { test, loginAs, USERS } from './_helpers'

const BACKEND = 'http://localhost:4001'
const FRONTEND = 'http://localhost:8080'
const ADMIN = USERS.admin // admin@test.com / admin123
const NEW_PASSWORD = 'newPass123' // 至少 6 字元,符合 validation

/**
 * 將 admin token 注入 localStorage(模擬已登入 user),跟住去 /profile。
 * 用 real token format `userId:role`(由 backend 簽發),AuthContext 讀得到。
 */
async function gotoProfileAsAdmin(page: import('@playwright/test').Page, token: string) {
  await page.goto(`${FRONTEND}/login`)
  await page.evaluate(
    ({ accessToken, refreshToken, user }) => {
      // 模擬 AuthContext 期望嘅 localStorage shape
      // 來源:frontend/src/context/AuthContext.tsx (accessToken / refreshToken / user)
      localStorage.setItem('accessToken', accessToken)
      localStorage.setItem('refreshToken', refreshToken)
      localStorage.setItem('user', JSON.stringify(user))
    },
    {
      accessToken: token,
      refreshToken: 'e2e-profile-refresh-token',
      user: { id: 'admin', name: '系統管理員', email: ADMIN.email, role: 'admin' },
    },
  )
  await page.goto(`${FRONTEND}/profile`)
}

test.describe('Profile page (US-1.4: change password)', () => {
  // ── Render ───────────────────────────────────────────────────────────────
  test('page renders user info from auth context', async ({ page }, testInfo) => {
    const token = await loginAs(page.request, 'admin', testInfo.title)
    await gotoProfileAsAdmin(page, token)

    // 標題
    await expect(page.getByRole('heading', { name: '用戶設定' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '個人資料' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '修改密碼' })).toBeVisible()

    // 用戶資料 card 顯示 seeded admin 嘅 name / email / role
    // 用 main 範圍篩掉 sidebar(sidebar 都有同一個名字,strict mode 會撞)
    const main = page.getByRole('main')
    await expect(main.getByText('系統管理員').first()).toBeVisible()
    await expect(main.getByText(ADMIN.email)).toBeVisible()
    // 'admin' 同時出現喺「角色」同「ID」兩個 <p> 度,strict mode 會撞 → 用 .first()
    await expect(main.getByText('admin', { exact: true }).first()).toBeVisible()

    // 修改密碼 form 嘅 3 個 input 都要喺度
    await expect(page.locator('input[type="password"]')).toHaveCount(3)
    await expect(page.getByRole('button', { name: '更新密碼' })).toBeVisible()
  })

  // ── 路由保護 ──────────────────────────────────────────────────────────────
  test('unauthenticated user is redirected to /login', async ({ page }) => {
    // 清 localStorage,確保冇 token
    await page.goto(`${FRONTEND}/login`)
    await page.evaluate(() => localStorage.clear())

    // 直接打 /profile → ProtectedRoute 應該 Navigate to /login
    await page.goto(`${FRONTEND}/profile`)
    await page.waitForURL(/\/login/, { timeout: 5_000 })
    expect(page.url()).toMatch(/\/login/)
  })

  // ── Show / hide password toggle ──────────────────────────────────────────
  test('show/hide password toggles work for both current and new password', async ({ page }, testInfo) => {
    const token = await loginAs(page.request, 'admin', testInfo.title)
    await gotoProfileAsAdmin(page, token)

    // ⚠️ 唔好用 `input[type="password"].nth(N)` 嚟鎖定 input:
    // toggle 完之後嗰個 input 變咗 type="text",selector 唔再 match,
    // 然後 .nth(0) 會指住「下一個」password input(搞錯咗 target)。
    // 改用 form 嘅 structural selector(label 對應嘅 wrapper div)。
    // 兩個 toggle button 都有 class `absolute`(放喺 input 右 padding 區域),
    // form submit button 冇 `absolute`,so 呢個 selector 安全。
    const currentToggle = page.locator('button.absolute').first()
    const newToggle = page.locator('button.absolute').nth(1)

    // 預設 2 個 toggle 都顯示「closed eye」icon(Eye 而唔係 EyeOff)
    await expect(currentToggle.locator('svg')).toBeVisible()
    await expect(newToggle.locator('svg')).toBeVisible()

    // 點擊 current toggle → 對應 input type 變 text
    // 用 evaluate 喺 React 嘅 controlled button 上面 trigger native click,
    // 避開 Playwright stability check 嘅「button 蓋住 input」投訴。
    await currentToggle.evaluate((el: HTMLElement) => el.click())
    await page.waitForFunction(
      () => {
        // 攞 form 內「當前密碼」嗰個 input,睇佢 type
        const labels = Array.from(document.querySelectorAll('label'))
        const currentLabel = labels.find((l) => l.textContent?.includes('當前密碼'))
        const input = currentLabel?.parentElement?.querySelector('input')
        return input?.getAttribute('type') === 'text'
      },
      { timeout: 5_000 }
    )

    // 再點擊 → 變返 password
    await currentToggle.evaluate((el: HTMLElement) => el.click())
    await page.waitForFunction(
      () => {
        const labels = Array.from(document.querySelectorAll('label'))
        const currentLabel = labels.find((l) => l.textContent?.includes('當前密碼'))
        const input = currentLabel?.parentElement?.querySelector('input')
        return input?.getAttribute('type') === 'password'
      },
      { timeout: 5_000 }
    )

    // 「新密碼」toggle 同一套路
    await newToggle.evaluate((el: HTMLElement) => el.click())
    await page.waitForFunction(
      () => {
        const labels = Array.from(document.querySelectorAll('label'))
        const newLabel = labels.find((l) => l.textContent?.includes('新密碼'))
        const input = newLabel?.parentElement?.querySelector('input')
        return input?.getAttribute('type') === 'text'
      },
      { timeout: 5_000 }
    )
    await newToggle.evaluate((el: HTMLElement) => el.click())
    await page.waitForFunction(
      () => {
        const labels = Array.from(document.querySelectorAll('label'))
        const newLabel = labels.find((l) => l.textContent?.includes('新密碼'))
        const input = newLabel?.parentElement?.querySelector('input')
        return input?.getAttribute('type') === 'password'
      },
      { timeout: 5_000 }
    )
  })

  // ── Client-side validation: 短密碼被擋(HTML5 minLength + 自訂 check) ─────
  test('new password shorter than 6 chars shows validation error', async ({ page }, testInfo) => {
    const token = await loginAs(page.request, 'admin', testInfo.title)
    await gotoProfileAsAdmin(page, token)

    // HTML5 minLength=6 喺 input element 上,會喺 form submit 之前擋住 submission
    // (即係 browser 自己 block 個 submit event,handleChangePassword 唔會 fire)。
    // 為咗行 client-side `if (newPassword.length < 6)` 嘅 fallback check,
    // 用 native setter + dispatch input event 繞過 React controlled input + minLength。
    const currentInput = page.locator('input[type="password"]').nth(0)
    const newInput = page.locator('input[type="password"]').nth(1)
    const confirmInput = page.locator('input[type="password"]').nth(2)
    await currentInput.fill(ADMIN.password)
    await newInput.evaluate((el, val) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
      setter.call(el, val)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, 'abc')
    await confirmInput.evaluate((el, val) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
      setter.call(el, val)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, 'abc')

    await page.getByRole('button', { name: '更新密碼' }).click()

    // client-side guard:`if (!newPassword || newPassword.length < 6)`
    await expect(page.getByText('新密碼至少需要 6 個字元')).toBeVisible()
  })

  // ── Client-side validation: 確認密碼唔符 ─────────────────────────────────
  test('confirm password mismatch shows validation error', async ({ page }, testInfo) => {
    const token = await loginAs(page.request, 'admin', testInfo.title)
    await gotoProfileAsAdmin(page, token)

    await page.locator('input[type="password"]').nth(0).fill(ADMIN.password)
    await page.locator('input[type="password"]').nth(1).fill('abcdef')
    await page.locator('input[type="password"]').nth(2).fill('xyz789') // 唔符

    await page.getByRole('button', { name: '更新密碼' }).click()

    await expect(page.getByText('新密碼與確認密碼不符')).toBeVisible()
  })

  // ── Server-side: 錯誤 currentPassword → 400 INVALID_PASSWORD ────────────
  test('wrong current password shows server error message', async ({ page }, testInfo) => {
    const token = await loginAs(page.request, 'admin', testInfo.title)
    await gotoProfileAsAdmin(page, token)

    await page.locator('input[type="password"]').nth(0).fill('definitely-wrong-password')
    await page.locator('input[type="password"]').nth(1).fill(NEW_PASSWORD)
    await page.locator('input[type="password"]').nth(2).fill(NEW_PASSWORD)

    await page.getByRole('button', { name: '更新密碼' }).click()

    // backend 會 set.status = 400 + 丟 INVALID_PASSWORD → client setError → render
    await expect(page.getByText('當前密碼不正確')).toBeVisible({ timeout: 10_000 })

    // 重要:不應出現成功訊息
    await expect(page.getByText('密碼已成功更新')).not.toBeVisible()
  })

  // ── Happy path: 改密碼 → 重新用新密碼登入 → 還原 ─────────────────────────
  test('happy path: change password, login with new password, then restore', async ({ page }, testInfo) => {
    const token = await loginAs(page.request, 'admin', testInfo.title)
    await gotoProfileAsAdmin(page, token)

    // 1. 改密碼
    await page.locator('input[type="password"]').nth(0).fill(ADMIN.password)
    await page.locator('input[type="password"]').nth(1).fill(NEW_PASSWORD)
    await page.locator('input[type="password"]').nth(2).fill(NEW_PASSWORD)

    await page.getByRole('button', { name: '更新密碼' }).click()

    // 2. 等成功訊息(綠色 banner)
    await expect(page.getByText('密碼已成功更新')).toBeVisible({ timeout: 10_000 })

    // 3. 3 個 input 應該被清空(success 時清 state)
    await expect(page.locator('input[type="password"]').nth(0)).toHaveValue('')
    await expect(page.locator('input[type="password"]').nth(1)).toHaveValue('')
    await expect(page.locator('input[type="password"]').nth(2)).toHaveValue('')

    try {
      // 4. 用新密碼經 API 登入成功(證明 DB 真係 write 了)
      const loginRes = await page.request.post(`${BACKEND}/auth/login`, {
        headers: { 'X-Forwarded-For': `127.0.0.${ipSuffixForTitle(testInfo.title + '-verify-new')}` },
        data: { email: ADMIN.email, password: NEW_PASSWORD },
      })
      expect(loginRes.status(), 'login with new password should succeed').toBe(200)

      // 5. 用舊密碼登入失敗(防 false positive)
      //    backend /auth/login 對 invalid email/password 返 401 UNAUTHORIZED
      //    (auth.ts:34 — `if (!validPassword) set.status = 401`)
      const oldRes = await page.request.post(`${BACKEND}/auth/login`, {
        headers: { 'X-Forwarded-For': `127.0.0.${ipSuffixForTitle(testInfo.title + '-verify-old')}` },
        data: { email: ADMIN.email, password: ADMIN.password },
      })
      expect(oldRes.status(), 'login with old password should fail').toBe(401)
    } finally {
      // 6. 還原密碼(其他 test 仲用緊 admin@test.com)
      //    用新密碼當 current,將密碼改返去原裝 admin123
      const restoreRes = await page.request.post(`${BACKEND}/auth/change-password`, {
        headers: {
          'X-Forwarded-For': `127.0.0.${ipSuffixForTitle(testInfo.title + '-restore')}`,
          Authorization: `Bearer ${token}`,
        },
        data: { currentPassword: NEW_PASSWORD, newPassword: ADMIN.password },
      })
      expect(
        restoreRes.status(),
        `password restore should succeed (got ${restoreRes.status()} body=${await restoreRes.text().catch(() => '<unreadable>')})`,
      ).toBe(200)
    }
  })
})

/**
 * 從 test title derive 1-200 嘅 IP suffix(同 _helpers.ts 嘅 hash 一致),
 * 等 change-password flow 內部每個 sub-request 都用獨立 IP,防 撞 rate limit。
 */
function ipSuffixForTitle(testTitle: string): number {
  let h = 0
  for (let i = 0; i < testTitle.length; i++) {
    h = (h * 31 + testTitle.charCodeAt(i)) | 0
  }
  return (Math.abs(h) % 200) + 1
}
