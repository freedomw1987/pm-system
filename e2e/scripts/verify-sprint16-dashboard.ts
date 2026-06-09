/**
 * Sprint 16 — Dashboard minimal layout verify
 *
 * Verify:
 * - 4 widgets present (進行中任務 / 未解決缺陷 / 本週時數 / 我參與嘅項目)
 * - "最近訪問" Recent Projects section NOT present
 * - 我參與嘅項目 grid present (scope=my)
 * - iPhone 14 RWD: overflow=0
 */
import { chromium, devices } from '@playwright/test'

const BASE = 'http://localhost:8080'

async function login(page: any, email: string, password: string) {
  await page.goto(`${BASE}/login`)
  await page.waitForLoadState('networkidle')
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  await page.click('button[type="submit"]')
  // login success 之後 React Router navigate('/') 落 dashboard (Route index)
  await page.waitForURL((url: URL) => url.pathname === '/', { timeout: 15_000 })
  await page.waitForLoadState('networkidle')
  // 等 dashboard 4 個 widget 嘅 API load 完,wait 進行中任務 text
  await page.locator('text=進行中任務').waitFor({ timeout: 15_000 })
  // 等埋我參與嘅項目 grid heading
  await page.locator('h2:has-text("我參與嘅項目")').first().waitFor({ timeout: 15_000 })
}

async function main() {
  const browser = await chromium.launch()

  // === Desktop 1440x900 ===
  const ctx1 = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page1 = await ctx1.newPage()
  await login(page1, 'admin@test.com', 'admin123')

  const body = await page1.content()
  const checks = {
    recent_section_absent: !body.includes('最近訪問'),
    widget_tasks: body.includes('進行中任務'),
    widget_bugs: body.includes('未解決缺陷'),
    widget_hours: body.includes('本週時數'),
    widget_my_projects: body.includes('我參與嘅項目'),
    my_projects_grid: (body.match(/我參與嘅項目/g) || []).length >= 1,
  }

  await page1.screenshot({ path: '/tmp/sprint16-dashboard-desktop.png', fullPage: false })
  await ctx1.close()

  // === iPhone 14 RWD ===
  const ctx2 = await browser.newContext({
    ...devices['iPhone 14'],
  })
  const page2 = await ctx2.newPage()
  await login(page2, 'admin@test.com', 'admin123')
  const overflow = await page2.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  )
  const bodyWidth = await page2.evaluate(() => document.body.scrollWidth)
  const viewportWidth = await page2.evaluate(() => document.documentElement.clientWidth)

  await page2.screenshot({ path: '/tmp/sprint16-dashboard-iphone14.png', fullPage: false })
  await ctx2.close()

  await browser.close()

  // Report
  console.log('[Desktop 1440x900]')
  console.log(`  ❌ Recent Projects section present: ${!checks.recent_section_absent} (expected False)`)
  console.log(`  ✅ Widget 進行中任務:        ${checks.widget_tasks}`)
  console.log(`  ✅ Widget 未解決缺陷:        ${checks.widget_bugs}`)
  console.log(`  ✅ Widget 本週時數:          ${checks.widget_hours}`)
  console.log(`  ✅ Widget 我參與嘅項目:      ${checks.widget_my_projects}`)
  console.log(`  ✅ 我參與嘅項目 grid heading: ${checks.my_projects_grid}`)
  console.log(`  📸 /tmp/sprint16-dashboard-desktop.png`)

  console.log('\n[iPhone 14 390x844]')
  console.log(`  overflow-x: ${overflow}px (expected 0)`)
  console.log(`  body width: ${bodyWidth}px, viewport: ${viewportWidth}px`)
  console.log(`  📸 /tmp/sprint16-dashboard-iphone14.png`)

  const pass =
    checks.recent_section_absent &&
    checks.widget_tasks &&
    checks.widget_bugs &&
    checks.widget_hours &&
    checks.widget_my_projects &&
    checks.my_projects_grid &&
    overflow === 0

  console.log(`\n${pass ? '✅ PASS' : '❌ FAIL'}: Sprint 16 Dashboard minimal layout`)
  process.exit(pass ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
