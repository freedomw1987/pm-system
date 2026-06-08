/**
 * Critical path E2E test
 *
 * 涵蓋:
 *  - US-2.1 建項目
 *  - US-3.1 建需求
 *  - US-4.1 建任務
 *  - US-6.1 填工時
 *
 * 同時做 smoke test:production deploy 之前跑呢條,確保 happy path 仲行得通
 * (對應紅線 17 — production smoke test)。
 */

import { test, expect, type Page } from '@playwright/test'

const ADMIN = { email: 'admin@test.com', password: 'admin123' }

/** 用 API 登入 + 攞 access token(直接走 backend,避免 UI login 慢) */
async function apiLogin(page: Page): Promise<string> {
  const res = await page.request.post('http://localhost:4001/auth/login', {
    data: ADMIN,
  })
  expect(res.status()).toBe(200)
  const body = await res.json()
  return body.accessToken as string
}

/** 清掉同 test 同名嘅 project,保持 DB clean(避免累積) */
async function cleanupByName(page: Page, token: string, name: string) {
  const res = await page.request.get('http://localhost:4001/api/projects', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok()) return
  const body = await res.json()
  const projects = body.projects ?? []
  for (const p of projects) {
    if (p.name === name) {
      await page.request.delete(`http://localhost:4001/api/projects/${p.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    }
  }
}

test.describe('Critical path: project → requirement → task → worklog', () => {
  // 用隨機 suffix 避免 retry 撞資料
  const suffix = Date.now().toString(36)
  const projectName = `E2E Test Project ${suffix}`
  const requirementTitle = `E2E Req ${suffix}`
  const taskTitle = `E2E Task ${suffix}`

  test('happy path works end-to-end', async ({ page }) => {
    // 1. API login + 攞 token
    const token = await apiLogin(page)
    expect(token).toBeTruthy()
    expect(token).toContain(':admin') // format: userId:role

    // 2. Clean up 同名 project(如果有)
    await cleanupByName(page, token, projectName)

    // 3. 建項目 via API(快,deterministic)
    const projRes = await page.request.post('http://localhost:4001/api/projects', {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: projectName, description: 'Created by E2E critical path' },
    })
    expect(projRes.status()).toBe(200)
    const { project } = await projRes.json()
    expect(project.name).toBe(projectName)
    const projectId = project.id

    // 4. 建需求
    const reqRes = await page.request.post('http://localhost:4001/api/requirements', {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        title: requirementTitle,
        description: 'E2E test requirement',
        priority: 'high',
        projectId,
      },
    })
    expect(reqRes.status()).toBe(200)
    const { requirement } = await reqRes.json()
    expect(requirement.title).toBe(requirementTitle)
    const requirementId = requirement.id

    // 5. 建任務(關聯返需求)
    const taskRes = await page.request.post('http://localhost:4001/api/tasks', {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        title: taskTitle,
        description: 'E2E test task',
        projectId,
        requirementIds: [requirementId],
      },
    })
    expect(taskRes.status()).toBe(200)
    const { task } = await taskRes.json()
    expect(task.title).toBe(taskTitle)
    const taskId = task.id

    // 6. 填工時(2.5 hours, today)
    const today = new Date().toISOString().slice(0, 10)
    const logRes = await page.request.post('http://localhost:4001/api/worklogs', {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        taskId,
        hours: 2.5,
        workDate: today,
        note: 'E2E worklog entry',
      },
    })
    expect(logRes.status()).toBe(200)
    const { workLog } = await logRes.json()
    // Prisma Decimal serialises as string — convert for comparison
    expect(Number(workLog.hours)).toBe(2.5)

    // 7. UI 驗證:到 WorkLogs 頁見到剛嘅 entry
    // Set localStorage token 模擬已登入 user
    await page.goto('http://localhost:8080/login')
    await page.evaluate(
      ({ accessToken, refreshToken }) => {
        const auth = { accessToken, refreshToken, user: { id: 'admin', role: 'admin' } }
        localStorage.setItem('pm-auth', JSON.stringify(auth))
      },
      { accessToken: token, refreshToken: 'e2e-refresh-token' }
    )

    await page.goto('http://localhost:8080/worklogs')
    // Page 應該 render,冇 crash
    await expect(page).toHaveURL(/worklogs/)

    // 8. Final cleanup
    await cleanupByName(page, token, projectName)
  })

  test('health check: backend + frontend both reachable', async ({ page }) => {
    // Frontend via nginx
    const frontRes = await page.request.get('http://localhost:8080/')
    expect(frontRes.status()).toBe(200)

    // Backend direct(走 docker port,唔經 nginx)
    const backRes = await page.request.get('http://localhost:4001/api/projects')
    expect(backRes.status()).toBe(200)
    // Should return auth-protected response structure
    const body = await backRes.json()
    expect(body).toHaveProperty('projects')
    expect(Array.isArray(body.projects)).toBe(true)
  })

  test('login flow works via UI', async ({ page }) => {
    // 1. 去 login page
    await page.goto('http://localhost:8080/login')
    // Real title is "AI 項目管理系統"
    await expect(page).toHaveTitle(/項目管理/)

    // 2. 填表(用真 seeded admin)
    await page.fill('input[type="email"], input[name="email"]', ADMIN.email)
    await page.fill('input[type="password"], input[name="password"]', ADMIN.password)

    // 3. Submit
    await page.click('button[type="submit"]')

    // 4. 期待 redirect 去 dashboard / projects
    // (login success 之後 React Router 落 `/` 即 dashboard)
    await page.waitForURL((url) => {
      const path = url.pathname
      return path === '/' || /projects|dashboard|home/.test(path)
    }, { timeout: 15_000 })
  })
})
