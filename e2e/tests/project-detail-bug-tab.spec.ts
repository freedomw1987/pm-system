/**
 * ProjectDetailPage bug tab E2E — Sprint 12 (T15a + T15b)
 *
 * 覆 US-5.6 嘅 ProjectDetailPage 入口(拎走 `/bugs` standalone page 之後):
 *   T15a: bug tab 新建缺陷(create) + rich text(Tiptap `.ProseMirror`)
 *         + image paste(`<img>` embed after paste event)
 *   T15b: bug tab 嘅 client-side search filter(`aria-label="搜尋缺陷"`
 *         即時 filter `bugs` array,清空後還原)
 *
 * **2026-06-09 retro decision (Sprint 11 B closure)**: 原來 US-5.6 嘅 E2E
 * 5 個 test(skip 咗,標 DEPRECATED)喺 `bugs-fix.spec.ts` 嘅
 * `Create bug modal` describe 入面。拎走 `/bugs` page 之後 entry 廢,
 * 改去 ProjectDetailPage → Bugs tab 補返。Sprint 12 出呢個 file。
 *
 * **2026-06-10 plan divergence (Sprint 12)**: T15b tracker row 寫住
 * 「server-side status / severity 過濾 + reset page 1」,但實際
 * ProjectDetailPage 嘅 bug tab search 係 **client-side filter**
 * (見 `frontend/src/pages/ProjectDetailPage.tsx:302-305` 嘅
 * `filteredBugs = useMemo(..., [bugs, searchBug])`)。以下 spec 對應
 * 實際 implementation 做 client-side filter E2E。Server-side filter
 * 留俾將來 pagination 重構嗰陣順手補(屆時再 patch 此 spec)。
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
 * 將 admin token 注入 localStorage(模擬已登入 user),模擬 AuthContext
 * 期望嘅 localStorage shape,然後 reload。
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
      refreshToken: 'e2e-bugtab-refresh-token',
      u: user,
    },
  )
}

/**
 * 攞 sample project id(seeded by docker entrypoint)。
 *
 * 2026-06-10 T15a 觀察:backend 嘅 seed 已經冇「範例」項目(Sprint 8+
 * docker entrypoint 重做咗),只係有 E2E-PG-* 自動 gen 嘅 fixture projects。
 * 跟 rbac-negative.spec.ts:173 嘅 graceful pattern:
 *   - 嘗試搵「範例」項目
 *   - 冇就 fallback 去 projects[0](E2E-PG-* 其中一個)
 *   - 連 fallback 都冇(listing 返 0 projects)就自己建一個 fresh project
 *
 * 咁樣 spec 唔需要靠特定 seed data 都 pass,跟 docker entrypoint
 * 嘅 seed 演進保持 loose coupling。
 */
async function getSampleProjectId(req: Page['request'], token: string): Promise<string> {
  const res = await req.get(`${BACKEND}/api/projects`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(res.status()).toBe(200)
  const body = await res.json()
  const projects = body.projects as Array<{ id: string; name: string }>
  if (projects.length === 0) {
    // 冇任何 project — 自己建一個(罕見,e.g. fresh docker volume)
    const createRes = await req.post(`${BACKEND}/api/projects`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: `E2E-T15a-fixture-${Date.now().toString(36)}`, description: 'auto-created for T15a spec' },
    })
    expect(createRes.status(), 'auto-create fixture project').toBe(200)
    const created = await createRes.json()
    return created.project.id as string
  }
  // 優先搵「範例」,冇就 fallback projects[0]
  const sample = projects.find((p) => p.name.includes('範例')) ?? projects[0]
  return sample.id as string
}

/** ProjectDetailPage 嘅 bugs tab 嘅「搜尋缺陷」input(對應 L940 aria-label)。 */
function bugSearchInput(page: Page) {
  return page.getByLabel('搜尋缺陷')
}

test.describe('Sprint 12 — ProjectDetailPage Bugs tab (T15a + T15b)', () => {
  // ── T15a: 新建缺陷 + rich text + image paste ───────────────────────
  test.describe('T15a — create bug + rich text + image paste', () => {
    test('新建缺陷 modal has rich text editor + assignee field (T15a setup)', async ({ page }, testInfo) => {
      const token = await loginAs(page.request, 'admin', testInfo.title)
      await loginViaStorage(page, token, {
        id: 'admin', name: '系統管理員', email: USERS.admin.email, role: 'admin',
      })

      const projectId = await getSampleProjectId(page.request, token)
      await page.goto(`${FRONTEND}/projects/${projectId}`)

      // 切去 Bugs tab(button text 包含「缺陷」)
      await page.getByRole('button', { name: /缺陷/ }).click()
      await expect(page.getByRole('button', { name: /新建缺陷/ })).toBeVisible({ timeout: 5_000 })

      // 開「新建缺陷」modal
      await page.getByRole('button', { name: /新建缺陷/ }).click()

      // modal 必須出現
      const modal = page.locator('div.fixed.inset-0').last()
      await expect(modal).toBeVisible()

      // 必須有 Tiptap editor(rich text)
      await expect(modal.locator('.ProseMirror').first()).toBeVisible()

      // 必須有「負責人」select(對應 L1740 label,等同舊版指派給誰)
      await expect(modal.getByText('負責人', { exact: true })).toBeVisible()

      // 必須有「嚴重程度」select
      await expect(modal.getByText('嚴重程度', { exact: true })).toBeVisible()

      // submit button 必須叫「建立缺陷」
      await expect(modal.getByRole('button', { name: '建立缺陷' })).toBeVisible()
    })

    test('create bug with rich text description + image paste — appears in list (T15a happy path)', async ({ page }, testInfo) => {
      const token = await loginAs(page.request, 'admin', testInfo.title)
      await loginViaStorage(page, token, {
        id: 'admin', name: '系統管理員', email: USERS.admin.email, role: 'admin',
      })

      const projectId = await getSampleProjectId(page.request, token)
      await page.goto(`${FRONTEND}/projects/${projectId}`)

      // 切去 Bugs tab
      await page.getByRole('button', { name: /缺陷/ }).click()
      await page.getByRole('button', { name: /新建缺陷/ }).click()

      const modal = page.locator('div.fixed.inset-0').last()
      await expect(modal).toBeVisible()

      // 用 unique suffix 避免撞 seed data
      const suffix = Date.now().toString(36)
      const newBugTitle = `E2E T15a bug ${suffix}`
      // rich text 描述(無 image — Tiptap schema 對 inline data URL <img> 喺
      // setContent path 會 drop 個 <img> tag,真實 image paste 要經 `handlePaste`
      // event + `handleImageFile` upload path,L85-99。見下面 step 2b)
      const richDesc = `<p>E2E <strong>rich text</strong> description ${suffix}</p>`

      // 1. 填 title
      await modal.locator('input[type="text"]').first().fill(newBugTitle)

      // 2. 填 rich text description — Tiptap 嘅 contenteditable,用 innerHTML 直接 set
      //    繞過 Tiptap command 嘅複雜性(same pattern as `bugs-fix.spec.ts` #4)
      //    第一次 innerHTML set 會觸發 React useEffect → setContent → onUpdate
      //    → onChange 同步 React state(等同 edit mode 嘅 pattern)
      const proseMirror = modal.locator('.ProseMirror').first()
      await proseMirror.click()
      await proseMirror.evaluate((el, html) => {
        el.innerHTML = html
        el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: 'x' }))
      }, richDesc)

      // 2b. Image paste — 真正 trigger Tiptap 嘅 `handlePaste` handler(L85-99):
      //   event.clipboardData 帶 image/* File → handleImageFile(file) →
      //   (冇 uploadEntity) → FileReader.readAsDataURL → editor.commands.setImage({src: dataUrl})
      //   → onUpdate → onChange → 最終 <img src="data:image/png;base64,..."> 落 React state
      // 用 1x1 透明 PNG(同 `bugs-fix.spec.ts` #5 一樣嘅 fixture)
      const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
      const pngBuffer = Buffer.from(pngBase64, 'base64')
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'e2e-t15a-'))
      const tmpFile = path.join(tmpDir, 'paste.png')
      await fs.writeFile(tmpFile, pngBuffer)
      try {
        // 喺 Tiptap 嘅 contenteditable focus 落去,再 dispatch paste event
        // 帶 clipboardData.items[0].type = 'image/png' + getAsFile() = File
        await proseMirror.evaluate((el, b64) => {
          // 喺 browser 入面將 base64 → Uint8Array → File,再 paste
          const bin = atob(b64)
          const bytes = new Uint8Array(bin.length)
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
          const file = new File([bytes], 'paste.png', { type: 'image/png' })
          const dt = new DataTransfer()
          dt.items.add(file)
          el.focus()
          el.dispatchEvent(new ClipboardEvent('paste', {
            bubbles: true,
            cancelable: true,
            clipboardData: dt,
          }))
        }, pngBase64)
        // 等 FileReader async + Tiptap onUpdate + React state sync(1-2 round trips)
        await page.waitForTimeout(500)
      } finally {
        await fs.unlink(tmpFile).catch(() => {})
        await fs.rmdir(tmpDir).catch(() => {})
      }

      // 3. 揀 severity = high
      const severitySelect = modal
        .locator('label', { hasText: '嚴重程度' })
        .locator('..')
        .locator('select')
      await severitySelect.selectOption('high')

      // 4. submit
      await modal.getByRole('button', { name: '建立缺陷' }).click()

      // modal 必須 close
      await expect(modal).not.toBeVisible({ timeout: 5_000 })

      // 5. Bug 必須出現喺 list(ProjectDetailPage 用 <h4> render bug title L965,
      //    唔用 /bugs/:id link,只有 inline status select + edit/delete button)
      await expect(
        page.getByRole('heading', { name: newBugTitle, level: 4 }),
        'newly created bug should appear in ProjectDetailPage bug list',
      ).toBeVisible({ timeout: 5_000 })

      // 6. 由 server 確認(GET /api/bugs/:id 拎返 detail,確認 description 保留 rich text + img)
      const list = await page.request.get(`${BACKEND}/api/bugs?projectId=${projectId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const body = await list.json()
      const found = body.bugs.find((b: { title: string }) => b.title === newBugTitle)
      expect(found, 'new bug should appear in list').toBeTruthy()
      expect(found.severity).toBe('high')

      // detail endpoint 確認 description 包含 rich text 標記(<strong>)
      // 同 image paste 嘅 data URL(<img src="data:image/png;base64,...)
      const detail = await page.request.get(`${BACKEND}/api/bugs/${found.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const detailBody = await detail.json()
      expect(detailBody.bug.description).toContain('<strong>')
      expect(detailBody.bug.description).toContain(suffix)
      // image paste 經 handleImageFile → data URL inline,description 一定要 <img
      expect(detailBody.bug.description).toMatch(/<img[^>]+data:image\/png/)

      // cleanup
      await page.request.delete(`${BACKEND}/api/bugs/${found.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    })
  })

  // ── T15b: client-side search filter ────────────────────────────────
  test.describe('T15b — bug tab client-side search filter', () => {
    /**
     * Helper: 喺 ProjectDetailPage 嘅 Bugs tab 起咗 N 個 unique bug,
     * 全部 cleanup 喺 finally block 做。
     */
    async function seedBugsAndOpenTab(
      page: Page,
      req: Page['request'],
      token: string,
      projectId: string,
      titles: string[],
    ): Promise<string[]> {
      const ids: string[] = []
      for (const title of titles) {
        const res = await req.post(`${BACKEND}/api/bugs`, {
          headers: { Authorization: `Bearer ${token}` },
          data: {
            title,
            description: `<p>seed for T15b ${title}</p>`,
            severity: 'medium',
            projectId,
          },
        })
        expect(res.status(), `seed bug "${title}" should succeed`).toBe(200)
        const body = await res.json()
        ids.push(body.bug.id as string)
      }
      // 重新載入 page 拎新 bug
      await page.goto(`${FRONTEND}/projects/${projectId}`)
      await page.getByRole('button', { name: /缺陷/ }).click()
      // 等 list 載完 — 起碼一個 row 出現(<h4> 拎到 title,L965)
      await expect(page.getByRole('heading', { name: titles[0], level: 4 })).toBeVisible({ timeout: 5_000 })
      return ids
    }

    test('search input 即時 filter list by title keyword (T15b)', async ({ page }, testInfo) => {
      const token = await loginAs(page.request, 'admin', testInfo.title)
      await loginViaStorage(page, token, {
        id: 'admin', name: '系統管理員', email: USERS.admin.email, role: 'admin',
      })

      const projectId = await getSampleProjectId(page.request, token)
      const suffix = `t15b-${Date.now().toString(36)}`
      const matchTitle = `${suffix}-MATCH-login-button-broken`
      const noMatchTitle = `${suffix}-NOMATCH-totally-different`

      const ids = await seedBugsAndOpenTab(page, page.request, token, projectId, [matchTitle, noMatchTitle])
      try {
        // 1. 冇 filter 之前,2 個 seed bug 都應該喺 list
        //    ProjectDetailPage 嘅 bug row 用 <h4> render title(L965),冇 /bugs/:id link
        await expect(page.getByRole('heading', { name: matchTitle, level: 4 })).toBeVisible()
        await expect(page.getByRole('heading', { name: noMatchTitle, level: 4 })).toBeVisible()

        // 2. 打 keyword "MATCH-login" — list 即時 filter(client-side useMemo L302-305)
        await bugSearchInput(page).fill('MATCH-login')
        await expect(page.getByRole('heading', { name: matchTitle, level: 4 })).toBeVisible()
        await expect(page.getByRole('heading', { name: noMatchTitle, level: 4 })).not.toBeVisible({ timeout: 3_000 })

        // 3. 改 keyword 做 "NOMATCH" — 結果反轉
        await bugSearchInput(page).fill('NOMATCH')
        await expect(page.getByRole('heading', { name: noMatchTitle, level: 4 })).toBeVisible()
        await expect(page.getByRole('heading', { name: matchTitle, level: 4 })).not.toBeVisible({ timeout: 3_000 })

        // 4. 清空 keyword — 2 個都返晒出嚟
        await bugSearchInput(page).fill('')
        await expect(page.getByRole('heading', { name: matchTitle, level: 4 })).toBeVisible()
        await expect(page.getByRole('heading', { name: noMatchTitle, level: 4 })).toBeVisible()
      } finally {
        // cleanup
        for (const id of ids) {
          await page.request.delete(`${BACKEND}/api/bugs/${id}`, {
            headers: { Authorization: `Bearer ${token}` },
          }).catch(() => {})
        }
      }
    })

    test('search input no-match keyword 顯示 empty state 「無符合...嘅缺陷」 (T15b edge)', async ({ page }, testInfo) => {
      const token = await loginAs(page.request, 'admin', testInfo.title)
      await loginViaStorage(page, token, {
        id: 'admin', name: '系統管理員', email: USERS.admin.email, role: 'admin',
      })

      const projectId = await getSampleProjectId(page.request, token)
      const suffix = `t15b-empty-${Date.now().toString(36)}`
      const seedTitle = `${suffix}-seed`

      const ids = await seedBugsAndOpenTab(page, page.request, token, projectId, [seedTitle])
      try {
        // 打一個肯定冇 match 嘅 keyword
        await bugSearchInput(page).fill('this-keyword-will-never-match-any-bug')
        // empty state message 必須出現(ProjectDetailPage L954)
        await expect(page.getByText(/無符合「.*」嘅缺陷/)).toBeVisible({ timeout: 3_000 })
        // seed 嘅 bug heading 唔應該可見(filtered 咗出去)
        await expect(page.getByRole('heading', { name: seedTitle, level: 4 })).not.toBeVisible({ timeout: 3_000 })
      } finally {
        for (const id of ids) {
          await page.request.delete(`${BACKEND}/api/bugs/${id}`, {
            headers: { Authorization: `Bearer ${token}` },
          }).catch(() => {})
        }
      }
    })
  })
})
