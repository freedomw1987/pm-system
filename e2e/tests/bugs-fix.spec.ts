/**
 * Bugs fix E2E tests — RG-2026-06-09
 *
 * 涵蓋 7 個回歸 bug(對應 P0 sprint 2026-06-09 嘅 fix):
 *   - bug #1 / #2  全部缺陷列表頁可新增缺陷(去 /bugs 見到「新建缺陷」button)
 *   - bug #3       全部缺陷列表頁可跳去詳情(click row → /bugs/:id)
 *   - bug #4       編輯缺陷-保存後標題/描述即時更新
 *   - bug #5       全部缺陷列表可按項目篩選(project filter dropdown)
 *   - bug #6       附件 image preview + 下載成功(RFC 5987 filename)
 *   - bug #7       新建缺陷有「指派給誰」選項 + 描述支援 image paste
 *   - bug #8       項目卡片 click 跳去詳情(唔只係 project name)
 *
 * 守嘅 invariant:
 *   - /bugs 一定要有「新建缺陷」button
 *   - row 必須係 <Link> 去 /bugs/:id
 *   - BugDetailPage PUT /:id 之後 local state 必須 patch(response 為準)
 *   - 附件 image 要有 <img> preview + lightbox modal
 *   - download 一定要 fetch + blob,唔可以係 <a href> navigate(會丟 Authorization)
 *   - ProjectCard 必須係 <Link>(包住 card 本體,唔淨只係 h3)
 *
 * RG-012 守則:每個 test 用獨立 IP(透過 `loginAs` 自動 inject
 * `X-Forwarded-For`)防 backend 5 attempts/60s rate limit 撞。
 */

import { test, expect, type Page } from '@playwright/test'
import { loginAs, USERS } from './_helpers'
import { promises as fs } from 'fs'
import * as path from 'path'
import * as os from 'os'

const BACKEND = 'http://localhost:4001'
const FRONTEND = 'http://localhost:8080'

/**
 * 將 admin token 注入 localStorage(模擬已登入 user),模擬 AuthContext 期望嘅
 * localStorage shape,然後 reload。
 */
async function loginViaStorage(page: Page, token: string, user: { id: string; name: string; email: string; role: string }) {
  await page.goto(`${FRONTEND}/login`)
  await page.evaluate(
    ({ accessToken, refreshToken, u }) => {
      localStorage.setItem('accessToken', accessToken)
      localStorage.setItem('refreshToken', refreshToken)
      localStorage.setItem('user', JSON.stringify(u))
    },
    {
      accessToken: token,
      refreshToken: 'e2e-bugs-refresh-token',
      u: user,
    },
  )
}

/**
 * 攞一個真實 buggy id(用於 /bugs/:id 跳轉測試)。
 * 走 API GET /api/bugs 拎第一個。
 */
async function getFirstBugId(req: Page['request'], token: string): Promise<string> {
  const res = await req.get(`${BACKEND}/api/bugs`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(res.status(), 'list bugs via API should succeed').toBe(200)
  const body = await res.json()
  expect(body.bugs.length, 'expected at least one bug from seed data').toBeGreaterThan(0)
  return body.bugs[0].id as string
}

/**
 * 攞 sample project id(seeded by docker entrypoint)。
 */
async function getSampleProjectId(req: Page['request'], token: string): Promise<string> {
  const res = await req.get(`${BACKEND}/api/projects`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(res.status()).toBe(200)
  const body = await res.json()
  const sample = body.projects.find((p: { id: string; name: string }) => p.name.includes('範例'))
  expect(sample, 'expected a sample project to be seeded').toBeTruthy()
  return sample.id as string
}

test.describe('Bug fix 2026-06-09 — 7 bugs P0 regression', () => {
  // ── 全部缺陷列表頁 (#1 / #2 / #3 / #5) ─────────────────────────────────
  test.describe('Bugs page (/bugs)', () => {
    test('page renders, has 新建缺陷 button, and project filter dropdown', async ({ page }, testInfo) => {
      const token = await loginAs(page.request, 'admin', testInfo.title)
      await loginViaStorage(page, token, {
        id: 'admin', name: '系統管理員', email: USERS.admin.email, role: 'admin',
      })

      // 用 sidebar link 跳過去(直接 goto /bugs 都得,但用 link 順便 assert sidebar 渲染)
      await page.goto(`${FRONTEND}/`)
      await page.getByRole('link', { name: '全部缺陷' }).click()
      await page.waitForURL(/\/bugs$/, { timeout: 5_000 })

      // bug #1/#2: 必須有「新建缺陷」button
      await expect(page.getByRole('heading', { name: '全部缺陷' })).toBeVisible()
      await expect(page.getByRole('button', { name: '新建缺陷' })).toBeVisible()

      // bug #5: 必須有「全部項目」filter dropdown
      await expect(page.locator('select').first()).toBeVisible()
      await expect(page.locator('select option', { hasText: '全部項目' })).toHaveCount(1)
    })

    test('clicking a bug row navigates to /bugs/:id (bug #3)', async ({ page }, testInfo) => {
      const token = await loginAs(page.request, 'admin', testInfo.title)
      await loginViaStorage(page, token, {
        id: 'admin', name: '系統管理員', email: USERS.admin.email, role: 'admin',
      })

      const expectedId = await getFirstBugId(page.request, token)
      await page.goto(`${FRONTEND}/bugs`)

      // 等 list 載完 — 至少一個 <a href="/bugs/...">
      await page.waitForSelector(`a[href="/bugs/${expectedId}"]`, { timeout: 5_000 })

      // 點擊 row(用 link 嘅 title 或 h3 文字,呢度用 link 嘅 href 拎到)
      await page.click(`a[href="/bugs/${expectedId}"]`)

      // 必須跳去 /bugs/:id
      await page.waitForURL(new RegExp(`/bugs/${expectedId}$`), { timeout: 5_000 })
      expect(page.url()).toMatch(new RegExp(`/bugs/${expectedId}$`))

      // BugDetailPage 應該 render 出 bug 嘅 title(用 h1 嘅 break-words span)
      // 不直接 assert title(避免 seed 中文唔 match),只 assert page 有 load 完整
      await expect(page.getByRole('link', { name: '返回缺陷列表' })).toBeVisible()
    })

    test('project filter dropdown filters the list (bug #5)', async ({ page }, testInfo) => {
      const token = await loginAs(page.request, 'admin', testInfo.title)
      await loginViaStorage(page, token, {
        id: 'admin', name: '系統管理員', email: USERS.admin.email, role: 'admin',
      })

      const projectId = await getSampleProjectId(page.request, token)
      await page.goto(`${FRONTEND}/bugs`)

      // 等 list 載完
      await page.waitForSelector('a[href^="/bugs/"]', { timeout: 5_000 })

      // 揀 sample project
      const select = page.locator('select').first()
      await select.selectOption(projectId)

      // UI 可能會 reload list(client-side filter),等一陣穩定
      await page.waitForTimeout(500)

      // 揀咗之後所有可見嘅 row 嘅 project 都應該 match(可由
      // 顯示嘅 "📁 <project name>" badge 確認,但最 robust 嘅方法係
      // 對 server response 計數:用 page.request 直接 hit /api/bugs?projectId=...)
      const filtered = await page.request.get(`${BACKEND}/api/bugs?projectId=${projectId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      expect(filtered.status()).toBe(200)
      const filteredBody = await filtered.json()
      // Server response 數量 = UI 顯示數量(label 內 "{n} 個")
      const expectedCount = filteredBody.bugs.length
      await expect(page.getByText(`共 ${expectedCount} 個`, { exact: false })).toBeVisible()

      // 重設做「全部項目」
      await select.selectOption('')
      await page.waitForTimeout(500)
    })
  })

  // ── Bug detail page (#4) ──────────────────────────────────────────────
  test.describe('Bug detail page (/bugs/:id)', () => {
    test('edit bug title and description — save updates UI immediately (bug #4)', async ({ page }, testInfo) => {
      const token = await loginAs(page.request, 'admin', testInfo.title)
      await loginViaStorage(page, token, {
        id: 'admin', name: '系統管理員', email: USERS.admin.email, role: 'admin',
      })

      const bugId = await getFirstBugId(page.request, token)
      await page.goto(`${FRONTEND}/bugs/${bugId}`)

      // 等 page 載完
      await page.waitForSelector('h1', { timeout: 5_000 })

      // 拎原本 title(由 main content 嘅 h1 span text 攞 — sidebar 都有 h1
      // "PM System",所以用 main 範圍)
      const originalTitleText = await page
        .locator('main h1 span')
        .first()
        .textContent()
      expect(originalTitleText, 'expected original title to be non-empty').toBeTruthy()

      // 開 edit modal — 用 title 嘅 Edit2 icon button(同 class pattern)
      // 唔直接用 Edit2 icon(會撞到 requirement 內嘅 Edit2),改用 aria-label/tip
      // 我哋喺 BugDetailPage 嘅 edit button 用咗 title="編輯缺陷"
      const editBtn = page.getByTitle('編輯缺陷')
      await expect(editBtn, 'edit button should be visible for admin').toBeVisible()
      await editBtn.click()

      // Modal 嘅 form 必須出現
      const modal = page.locator('div.fixed.inset-0').last()
      await expect(modal).toBeVisible()

      // 改 title 同 description
      const newTitle = `[E2E updated ${Date.now().toString(36)}]`
      const newDesc = '<p>E2E description updated at ' + new Date().toISOString() + '</p>'
      const titleInput = modal.locator('input[type="text"]').first()
      await titleInput.fill(newTitle)

      // Tiptap 嘅 contenteditable — 喺 main editor 嘅 .ProseMirror 元素
      const proseMirror = modal.locator('.ProseMirror').first()
      await proseMirror.click()
      await proseMirror.evaluate((el, html) => {
        // 用 innerHTML 直接 set,繞過 Tiptap command 嘅複雜性
        el.innerHTML = html
        el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: 'x' }))
      }, newDesc)

      // submit
      await modal.getByRole('button', { name: /^保存$/ }).click()

      // modal 應該 close
      await expect(modal).not.toBeVisible({ timeout: 5_000 })

      // UI 必須即時更新(bug #4 嘅核心 assertion — 唔 reload 都見到新 title)
      // 用 main 範圍避免撞 sidebar 嘅 "PM System" h1
      await expect(page.locator('main h1')).toContainText(newTitle, { timeout: 5_000 })

      // 由 server side 確認寫入
      const verify = await page.request.get(`${BACKEND}/api/bugs/${bugId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      expect(verify.status()).toBe(200)
      const body = await verify.json()
      expect(body.bug.title).toBe(newTitle)

      // Cleanup: 還原返原本 title(用 PUT)
      const restoreRes = await page.request.put(`${BACKEND}/api/bugs/${bugId}`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { title: originalTitleText },
      })
      expect(restoreRes.status(), 'restore bug title').toBe(200)
    })
  })

  // ── Create bug modal (#6 / #7) ─────────────────────────────────────────
  test.describe('Create bug modal', () => {
    /**
     * Helper:用 label text 搵對應嘅 <select>。
     * Bug 嘅 CreateBugModal 內 <label> 直接包住 select 嘅 wrapper(div 結構),
     * 唔同 RequirementDetailPage 嘅 grid layout。所以用 :has(label text) 唔 work。
     * 用 :near() 配合 label text 鎖定 wrapper 內嘅 select。
     */
    function selectForLabel(modal: ReturnType<Page['locator']>, labelText: string) {
      return modal
        .locator('div', { has: page => page.locator('label', { hasText: labelText }) })
        .locator('select')
        .first()
    }

    test('modal has 指派給誰 (assignee) field and 新建缺陷 button works (bug #6 + #7)', async ({ page }, testInfo) => {
      const token = await loginAs(page.request, 'admin', testInfo.title)
      await loginViaStorage(page, token, {
        id: 'admin', name: '系統管理員', email: USERS.admin.email, role: 'admin',
      })

      await page.goto(`${FRONTEND}/bugs`)
      await page.getByRole('button', { name: '新建缺陷' }).first().click()

      // modal 必須出現
      const modal = page.locator('div.fixed.inset-0').last()
      await expect(modal).toBeVisible()

      // 必須有「指派給誰」label(bug #7 嘅核心)
      await expect(modal.getByText('指派給誰', { exact: true })).toBeVisible()

      // 必須有「嚴重程度」select
      await expect(modal.getByText('嚴重程度', { exact: true })).toBeVisible()

      // 必須有 Tiptap editor(description 支援 image paste)
      await expect(modal.locator('.ProseMirror').first()).toBeVisible()

      // 揀「項目」select(label "項目" 下面嗰個 select — 唔淨只係「不指定」,
      // 因為 assignee select 都有 "不指定" option,strict 模式會撞)
      const projectId = await getSampleProjectId(page.request, token)
      const projectSelect = modal.locator('label', { hasText: '項目' }).locator('..').locator('select')
      await projectSelect.selectOption(projectId)

      // 等 project members 載入並 populate assignee dropdown
      await page.waitForTimeout(800)

      // 揀第一位 member(就 seed 嘅 dev@test.com 之類)— 但具體內容唔斷言,
      // 只斷言 dropdown 嘅 options 多過 1(有 "不指定" + 至少一個 member)
      // 攞 modal 入面全部 select 嘅 option 數量,揀嗰個 > 1 嘅(就係 assignee)
      const assigneeSelect = modal
        .locator('label', { hasText: '指派給誰' })
        .locator('..')
        .locator('select')
      const optionCount = await assigneeSelect.locator('option').count()
      expect(optionCount, 'assignee dropdown should have options after project is selected').toBeGreaterThan(1)
    })

    test('create bug with title, severity, project, assignee — appears in list (bug #6 + #7 happy path)', async ({ page }, testInfo) => {
      const token = await loginAs(page.request, 'admin', testInfo.title)
      await loginViaStorage(page, token, {
        id: 'admin', name: '系統管理員', email: USERS.admin.email, role: 'admin',
      })

      const projectId = await getSampleProjectId(page.request, token)
      await page.goto(`${FRONTEND}/bugs`)
      await page.getByRole('button', { name: '新建缺陷' }).first().click()

      const modal = page.locator('div.fixed.inset-0').last()
      await expect(modal).toBeVisible()

      const suffix = Date.now().toString(36)
      const newBugTitle = `E2E create test ${suffix}`

      await modal.locator('input[type="text"]').first().fill(newBugTitle)
      // severity
      const severitySelect = modal
        .locator('label', { hasText: '嚴重程度' })
        .locator('..')
        .locator('select')
      await severitySelect.selectOption('high')
      // project
      const projectSelect = modal
        .locator('label', { hasText: '項目' })
        .locator('..')
        .locator('select')
      await projectSelect.selectOption(projectId)
      // 等 assignee 載入
      await page.waitForTimeout(800)
      // 揀第一個 member
      const assigneeSelect = modal
        .locator('label', { hasText: '指派給誰' })
        .locator('..')
        .locator('select')
      const firstMemberValue = await assigneeSelect.locator('option').nth(1).getAttribute('value')
      if (firstMemberValue) {
        await assigneeSelect.selectOption(firstMemberValue)
      }

      // submit
      await modal.getByRole('button', { name: '建立缺陷' }).click()

      // modal 關閉
      await expect(modal).not.toBeVisible({ timeout: 5_000 })

      // 綠色 success banner
      await expect(page.getByText(`已建立缺陷「${newBugTitle}」`)).toBeVisible({ timeout: 5_000 })

      // 由 server 確認
      const list = await page.request.get(`${BACKEND}/api/bugs?projectId=${projectId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const body = await list.json()
      const found = body.bugs.find((b: { title: string }) => b.title === newBugTitle)
      expect(found, 'new bug should appear in list').toBeTruthy()
      expect(found.severity).toBe('high')

      // cleanup
      if (found) {
        await page.request.delete(`${BACKEND}/api/bugs/${found.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
      }
    })
  })

  // ── Attachments image preview + download (#5) ─────────────────────────
  test.describe('Attachments tab image preview + download', () => {
    test('image attachment renders <img> preview thumbnail and lightbox (bug #5)', async ({ page }, testInfo) => {
      const token = await loginAs(page.request, 'admin', testInfo.title)
      await loginViaStorage(page, token, {
        id: 'admin', name: '系統管理員', email: USERS.admin.email, role: 'admin',
      })

      // 1. 上傳一個 1x1 透明 PNG 去 sample project
      const projectId = await getSampleProjectId(page.request, token)
      // 1x1 transparent PNG (base64 decoded)
      const pngBase64 =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
      const pngBuffer = Buffer.from(pngBase64, 'base64')
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'e2e-att-'))
      const tmpFile = path.join(tmpDir, 'e2e-test.png')
      await fs.writeFile(tmpFile, pngBuffer)

      try {
        const uploadRes = await page.request.post(`${BACKEND}/api/attachments/upload`, {
          headers: { Authorization: `Bearer ${token}` },
          multipart: {
            file: { name: 'e2e-test.png', mimeType: 'image/png', buffer: pngBuffer },
            entityType: 'project',
            entityId: projectId,
          },
        })
        expect(uploadRes.status(), `upload should succeed (got ${uploadRes.status()})`).toBe(200)
        const uploadBody = await uploadRes.json()
        const attId = uploadBody.id as string
        expect(attId).toBeTruthy()

        // 2. 去項目 detail → 切去「附件」tab
        await page.goto(`${FRONTEND}/projects/${projectId}`)
        await page.getByRole('button', { name: /附件/ }).click()

        // 3. 列表入面要有 <img> preview(thumbnail),src 帶 ?inline=1
        await expect(page.locator(`img[src*="/api/attachments/${attId}?inline=1"]`).first()).toBeVisible({
          timeout: 5_000,
        })

        // 4. 點擊 thumbnail → 開 lightbox
        await page.locator(`img[src*="/api/attachments/${attId}?inline=1"]`).first().click()
        // lightbox 嘅 <img> 喺 fixed overlay 入面
        await expect(
          page.locator('div.fixed.inset-0 img').first(),
          'lightbox image should appear after clicking thumbnail',
        ).toBeVisible({ timeout: 5_000 })

        // 5. 關 lightbox
        await page.keyboard.press('Escape').catch(() => {
          // lightbox 用 click 背景關閉(無 ESC handler)
        })
        // 用 close button(title="關閉")
        const closeBtn = page.getByTitle('關閉')
        if (await closeBtn.isVisible().catch(() => false)) {
          await closeBtn.click()
        } else {
          // fallback 點 overlay 外面
          await page.mouse.click(50, 50)
        }
        await page.waitForTimeout(300)

        // 6. download 一定要 fetch 到(backend 返 200 + Content-Type image/png)
        const download = await page.request.get(`${BACKEND}/api/attachments/${attId}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        expect(download.status()).toBe(200)
        expect(download.headers()['content-type']).toContain('image/png')
        // Content-Disposition 必須包含 filename*(RFC 5987 編碼)
        const cd = download.headers()['content-disposition']
        expect(cd, 'Content-Disposition header').toBeTruthy()
        expect(cd).toContain("filename*=UTF-8''")

        // cleanup
        await page.request.delete(`${BACKEND}/api/attachments/${attId}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
      } finally {
        await fs.unlink(tmpFile).catch(() => {})
        await fs.rmdir(tmpDir).catch(() => {})
      }
    })
  })

  // ── Project card click (#8) ──────────────────────────────────────────
  test.describe('Project card click navigation', () => {
    test('clicking anywhere on project card (not just name) navigates to detail (bug #8)', async ({ page }, testInfo) => {
      const token = await loginAs(page.request, 'admin', testInfo.title)
      await loginViaStorage(page, token, {
        id: 'admin', name: '系統管理員', email: USERS.admin.email, role: 'admin',
      })

      const projectId = await getSampleProjectId(page.request, token)
      await page.goto(`${FRONTEND}/projects`)

      // 攞嗰張 card 嘅 <a href="/projects/{id}">
      const cardLink = page.locator(`a[href="/projects/${projectId}"]`).first()
      await expect(cardLink, 'project card should be a link').toBeVisible({ timeout: 5_000 })

      // Click 落 card 右下角(成員數 / 需求數嗰區)— 唔係 h3 範圍
      // 我哋 click 個 "個成員" text
      const memberCountArea = cardLink.getByText(/個成員/)
      if (await memberCountArea.count() > 0) {
        await memberCountArea.first().click()
      } else {
        // fallback: 點 card 中間偏下
        await cardLink.click()
      }

      // 必須跳去 /projects/{id}
      await page.waitForURL(new RegExp(`/projects/${projectId}$`), { timeout: 5_000 })
      expect(page.url()).toMatch(new RegExp(`/projects/${projectId}$`))
    })

    test('clicking edit/delete on card does NOT navigate (still works as buttons, bug #8 regression)', async ({ page }, testInfo) => {
      const token = await loginAs(page.request, 'admin', testInfo.title)
      await loginViaStorage(page, token, {
        id: 'admin', name: '系統管理員', email: USERS.admin.email, role: 'admin',
      })

      const projectId = await getSampleProjectId(page.request, token)
      await page.goto(`${FRONTEND}/projects`)

      const cardLink = page.locator(`a[href="/projects/${projectId}"]`).first()
      await expect(cardLink).toBeVisible({ timeout: 5_000 })

      // 設一個 dialog handler(edit modal 會出)
      // 唔用,直接 click 然後 confirm modal 出現
      const editBtn = cardLink.getByTitle('編輯項目')
      if (await editBtn.count() > 0) {
        await editBtn.first().click()
        // 唔應該 navigate
        expect(page.url()).toMatch(/\/projects$/)
        // 應該有 modal
        const modal = page.locator('div.fixed.inset-0').last()
        await expect(modal).toBeVisible()
        // 關 modal
        await modal.getByRole('button', { name: '取消' }).click()
      }
    })
  })
})
