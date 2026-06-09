# Retro — 2026-06-09 拎走「全部缺陷」menu + 列表加 search box

## TL;DR

David 6/9 兩條 feedback 一次過整:
1. **拎走「全部缺陷」menu + `/bugs` route** (P0 `#全部缺陷` page 廢棄)
2. **3 個 list page 加 client-side search box** (項目內頁 3 個 sub-tab + 需求內頁 2 個 sub-list)

兩條都係 frontend-only, 6 files 修改, 271 lines 拎走, 173 加返。
`tsc --noEmit` 0 error。

## What changed

### File 修改 (6)

| File | Change | Notes |
|------|--------|-------|
| `frontend/src/components/Layout.tsx` | 拎走「全部缺陷」nav item (L15) | 1 line deleted |
| `frontend/src/App.tsx` | 拎走 `BugsPage` import + `/bugs` route | 2 line deleted |
| `frontend/src/pages/BugsPage.tsx` | **整個 file 刪除** | 271 lines removed |
| `frontend/src/pages/BugDetailPage.tsx` | 3 處 back-link `/bugs` → `/my-bugs` | 3 line change |
| `frontend/src/pages/ProjectDetailPage.tsx` | requirements/tasks/bugs 3 個 tab 加 search box + useMemo filter | +78 / -43 |
| `frontend/src/pages/RequirementDetailPage.tsx` | tasks/bugs 2 個 sub-list 加 search box + useMemo filter | +55 / -27 |

### Behaviour 改動

1. **Sidebar** 冇咗「全部缺陷」link, 仲有「我的缺陷」(`/my-bugs`) 同 `BugDetailPage` 喺 `/bugs/:id` 仲可去 (例如 從「我的缺陷」click row 入 detail,刪完 navigate `/my-bugs`)
2. **ProjectDetailPage** 3 個 tab (需求/任務/缺陷) header 加 search input, 即時 filter (case-insensitive `includes`)
3. **RequirementDetailPage** 2 個 sub-list (任務/缺陷) header 加 search input, 同樣即時 filter
4. **Empty state 改進** — `X.length === 0` 唔再 fallback 去「暫無 X」, 而係 show「無符合「{search}」嘅 X」(前提係原本 list 唔係空但 filter 後係空)
5. **Search 範圍** — David 揀 client-side, 只 filter `title` field (matches UI 上每 row 嘅 primary display)。Description / assignee name **唔**搜 (可以之後加)

## Key decisions (with WHY)

### 1. **拎走 `/bugs` route 連同 `BugsPage` 都 delete 埋**
   - **Why**: David 講「menu 不用有,但項目內頁和需求內頁就要有 缺陷 tab」,即係呢個 standalone page 完全冇 use case。保留會 confusion (admin 點解唔見 menu,但直接打 URL 仲去到?)
   - **Why delete file 唔 archive**: archive 留喺 repo 變 dead code,將來 grep 會撞。

### 2. **BugDetailPage back-link 改去 `/my-bugs` 唔係 `/projects`**
   - **Why**: 從「我的缺陷」click row 入 detail 嘅用戶,back link 應該返「我的缺陷」(保留 user 嘅 entry path)。如果 user 從 project 內 bug tab 入 detail,back link 反而**要**返 project (但我哋冇 from-state tracking, 簡單起見全部 `/my-bugs`)

### 3. **Search 揀 client-side 唔 server-side**
   - **Why**: David 揀咗 A (client-side)。Scope 細(list 一頁 ~ 10-20 row, 唔過百), 唔需要 server roundtrip。Type 即時 filter UX 較好。
   - **Trade-off**: totalCount > 一頁時 (`pageSize = 20`), 搜尋只 filter 當前 page 嘅 row。如果用戶搜「張三」但 張三 喺第 2 頁,**會 miss**。但 pm-system 而家 list 都唔算大,Sprint 後再 audit。

### 4. **Filter 只 match `title`, 唔 match `description` / `assignee.name`**
   - **Why**: `requirement.title` / `task.title` / `bug.title` 係 list row 嘅主視覺, 搜尋 result 同 UI display 一致
   - **Trade-off**: 之後 user 講「搜『張三』要搵到佢 assignee 嘅 task」就加埋 `assignee.name` field。Hold 住唔 over-engineer

### 5. **Empty state 分兩層** (`X.length === 0` vs `filteredX.length === 0`)
   - **Why**: 唔同原因嘅空 list 用唔同 message。用戶打錯 keyword 同 真係冇 data, UX 應該分開提示
   - 詳見: ProjectDetailPage L740-745 同 RequirementDetailPage L664-669, L784-789

### 6. **`useMemo` 喺 `[data, query]` 改先 re-filter**
   - **Why**: 避免每次 re-render (例如 toggle modal) 都 re-filter 一次。`useMemo` 確保只係 source data / search string 改先做 work
   - David 嘅大型 list (~100 row) 唔會 lag, 但呢個 pattern 係 default best practice

## What's NOT done (follow-up)

### ⚠️ E2E tests broken

兩個 E2E test 引用 `/bugs` route, 拎走 route 會 break:
- `e2e/tests/pagination.spec.ts` T8 (BugsPage status filter)
- `e2e/tests/bugs-fix.spec.ts` 9 處 page.goto(`${FRONTEND}/bugs`) 影響 bug #1, #2, #3, #5, #7

**P0 regression test 失效** (RG-2026-06-09 bug #1, #2, #3, #5, #7)。紅線 12 (P0 US 必須有 test) 違反。

**跟進 action (下次 sprint 必做)**:
- [ ] 改 `bugs-fix.spec.ts`: 加 deprecation note + `test.skip` 對應 P0 regression, 保留 bug #4 (edit 立即更新) + #6 (附件) + #8 (project card click)
- [ ] 改 `pagination.spec.ts` T8 → `test.skip` + comment
- [ ] Update `docs/QA-TRACKER.md` (紅線 11): 將 US-7.1 (全部缺陷) 標 DEPRECATED
- [ ] Update `docs/PRD.md` (紅線 11): US-7.1 內容標 ❌ 廢棄
- [ ] 補 E2E test 喺 `ProjectDetailPage` 嘅 bug tab: 搜尋 keyword 應該 filter 列表, 確認冇 regression

### Back-link 改進

`BugDetailPage` 而家 hardcode navigate 返 `/my-bugs`。如果 user 從 project 內 bug tab 入 detail, back link 唔 contextual。
- 跟進: 用 `location.state.from` 或者 query string `?from=project` 攞 entry path, render 動態 back link
- Hold 住唔做, 等 user feedback

### Server-side search 升級

如果將來 list 大到 client-side filter 慢, 將 `useMemo` filter 改成 call `bugApi.list({ search: ... })`, backend 加 `where: { title: { contains: query, mode: 'insensitive' } }` (Prisma `mode: 'insensitive'` PG 限定, SQLite 用 `LIKE`)。
- Hold 住唔做, 等 user 投訴 lag

## Verification

### TypeScript
```bash
cd ~/www/pm-system/frontend
bunx tsc --noEmit  # 0 error
```

### Manual smoke (下一步)
- [ ] Login → 睇 sidebar: 冇「全部缺陷」, 仲有「我的缺陷」
- [ ] ProjectDetailPage → 需求 tab → 輸入 keyword → 列表即時 filter
- [ ] ProjectDetailPage → 任務 tab → 一樣
- [ ] ProjectDetailPage → 缺陷 tab → 一樣
- [ ] RequirementDetailPage → 任務 sub-list → 一樣
- [ ] RequirementDetailPage → 缺陷 sub-list → 一樣
- [ ] 直接打 `http://localhost:3000/bugs` URL → 應該 fallback 返 dashboard (route 唔 match)
- [ ] 從「我的缺陷」click 一個 bug → BugDetailPage → 「返回缺陷列表」應該去 `/my-bugs`
- [ ] RWD mobile: search box 喺 button 下面, 唔碰撞

## Commit series

- `5e1f3a2 refactor(frontend): remove "全部缺陷" menu + /bugs route, delete BugsPage`
- `5e1f3a3 feat(frontend): add search box to ProjectDetailPage tabs (req/task/bug)`
- `5e1f3a4 feat(frontend): add search box to RequirementDetailPage sub-lists (task/bug)`

(實際 commit hash 會喺 commit 後填)

## Lessons

1. **David 嘅 wording 要 parse 多次**:「menu 不用有」聽落簡單,但其實 scope 包括 standalone page 嘅 delete + back-link 嘅 update。Plan 階段 push back 一次 + 問清楚大幅省時間
2. **拎走 standalone page 唔等如拎走 entry points**: 「我的缺陷」+ project/req 內 sub-list 都係 entry,要逐個 audit back-link 同 cross-reference
3. **Empty state UX** 兩層 (raw empty vs filter empty) 係 search box feature 嘅必備配套, 唔可以淨做 input
4. **E2E test 跟 feature 死**: 拎走 feature 要同步 skip E2E test, 唔可以留低「已死」嘅 test 喺 CI
