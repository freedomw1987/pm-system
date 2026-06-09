# Retro — 2026-06-09 Sprint 11 B + C closure (Wiki/Attachments search + 全部缺陷 deprecation)

## TL;DR

Sprint 10 嘅 follow-up 一次過整晒 (commit `048650e` 之後):
- **C 延伸**: `WikiTab` + `AttachmentsTab` 加 client-side search box (2 components, 跟 ProjectDetailPage/RequirementDetailPage 嘅 pattern)
- **B closure (紅線 11/12 復合規)**: Skip 6 個 P0 regression E2E test + 標 DEPRECATED;更新 `QA-TRACKER.md` (US-5.5 ⚫, US-5.6 🟡) + `PRD.md` (US-5.5 strikethrough)

**零 backend 改動, 純 frontend + docs。tsc --noEmit 0 error。**

## What changed (6 files, +114 / −38)

| File | Change |
|------|--------|
| `frontend/src/components/WikiTab.tsx` | +useMemo, +Search icon, +search input 左側邊欄, +filter empty state |
| `frontend/src/components/AttachmentsTab.tsx` | +useMemo, +Search icon, +search input 右側 upload bar 旁, +filter empty state |
| `e2e/tests/bugs-fix.spec.ts` | `Bugs page (/bugs)` describe → `describe.skip` (3 tests: 新建缺陷 button, click row → /bugs/:id, project filter);`Create bug modal` describe → `describe.skip` (2 tests: modal assignee, create happy path);file 頂部註解 +4 個 DEPRECATED 標 |
| `e2e/tests/pagination.spec.ts` | T8 (BugsPage status filter) → `test.skip` + DEPRECATED comment |
| `docs/QA-TRACKER.md` | US-5.5 row E2E cell → ❌ DEPRECATED, status → ⚫;US-5.6 E2E → ❌ DEPRECATED, status → 🟡 PARTIAL;+changelog row 講呢個 sprint |
| `docs/PRD.md` | Epic 5 table 加 US-5.5 strikethrough (DEPRECATED) + US-5.6 (rich text + image paste) row |

## Key decisions (with WHY)

### 1. **`describe.skip` 唔係 `test.fixme`, 都唔係 delete test**
   - **Why `describe.skip`**: Playwright `describe.skip` 會 skip 整個 describe 內所有 test + 出 report 顯示「skipped 6 tests」, 唔會 fail。Eslint / 同事 review 一睇就知有 6 個 test 被 deprecated 而唔係被「搞壞」
   - **Why 唔 delete**: 紅線 13 嘅 reverse — audit trail。睇 git log 知道「以前呢度係 6 個 work 嘅 test,2026-06-09 skip 咗因為 `/bugs` 廢咗」。Delete 等於冇 audit
   - **Why 唔 `test.fixme`**: `test.fixme` 表示「broken,要修」,但呢 6 個 test 唔 broken,只係 entry 經已廢

### 2. **WikiTab 嘅 search 過濾 `title` 唔過濾 `content`**
   - **Why**: list row 嘅 primary display 係 title (見 L268)。David 嘅 scope 係「用戶想搵返某頁面」,通常記得 page title 唔係內容 keyword。內容 keyword 搜尋係另一個 scope (full-text search, 需要 Postgres `tsvector`)
   - **Trade-off**: 用戶打一段正文 search box 會搵唔到。等用戶投訴再改

### 3. **AttachmentsTab 嘅 search 過濾 `filename` 唔過濾 `mimeType`**
   - **Why**: 用戶揾 file 通常係記得「嗰份 spec PDF」/「嗰張 screenshot.png」, 即係 filename 嘅 part。mimeType 過濾無意思 (e.g. 揀 image 一係直接 click 上面嘅 filter button, 一係加 mimeType dropdown — 都係 over-engineer)

### 4. **AttachmentsTab 嘅 search input 喺右側 (`sm:ml-auto`), 唔喺 upload bar 內**
   - **Why**: upload bar 已經有 button + helper text, 擠埋入去會撞 + mobile 難用。分兩行(stacked on mobile, side-by-side on `sm+`) 符合 RWD 慣例
   - 同 ProjectDetailPage/RequirementDetailPage 嘅 pattern 對齊: button 喺左, search 喺右, `flex-col sm:flex-row` 處理 mobile

### 5. **WikiTab 嘅 search input 喺 page list header 下面, 唔喺 right content header**
   - **Why**: WikiTab 嘅 layout 係 **left list + right content** (兩欄)。搜尋應該喺「list 嘅 header」唔係「content 嘅 header」, 因為搜尋結果影響 list 唔影響 content。Layout 直覺
   - 同 ProjectDetailPage 唔同: ProjectDetailPage 係 single column, button + search 同行 `justify-between`

### 6. **US-5.6 改 PARTIAL 唔改 PASS**
   - **Why**: 紅線 12 (P0 US 必須有完整 test)。US-5.6 之前係 PASS-E2E, 而家 skip 咗 (因為 CreateBugModal entry point 廢)。**功能本身仲 work** (`BugDetailPage` 仲用 `RichTextEditor`), 但 E2E 冇 cover, 所以 PARTIAL 而唔係 PASS / DEPRECATED
   - **Follow-up (下次 sprint)**: 補 E2E test 喺 `ProjectDetailPage` 嘅 bug tab, 確認「新建缺陷」modal + rich text + image paste 仲 work

## Why E2E 仲 PASS 4/4

| Describe | Status | Why |
|----------|--------|-----|
| `Bugs page (/bugs)` | ❌ DEPRECATED (3 tests) | `/bugs` 拎走, entry 廢 |
| `Bug detail page (/bugs/:id)` | ✅ 保留 (1 test) | `/bugs/:id` 仲 work, edit + save 仲 cover |
| `Create bug modal` | ❌ DEPRECATED (2 tests) | entry 經已 `/bugs`, 拎走咗 |
| `Attachments tab image preview` | ✅ 保留 (1 test) | 用 `/projects/${projectId}`, 唔受影響 |
| `Project card click navigation` | ✅ 保留 (2 tests) | 用 `/projects`, 唔受影響 |

紅線 12 (P0 US 必須有 E2E test): US-5.5 P0 regression test DEPRECATED, 但 US-5.5 經已標 ❌ DEPRECATED 喺 PRD (P0 status 取消咗), 紅線 12 跟 US 走 → 不再違反。US-5.6 改 PARTIAL (P1), 紅線 12 對 P1 唔強制。

## Verification

### TypeScript
```bash
cd ~/www/pm-system/frontend
bunx tsc --noEmit  # 0 error ✅
```

### Manual smoke (下一步 David 做)
- [ ] ProjectDetailPage → Wiki tab → 搜尋 "xxx" → 列表即時 filter
- [ ] ProjectDetailPage → Attachments tab → 搜尋 "spec" → grid 即時 filter
- [ ] Filter 後無結果 → 顯示「無符合「{keyword}」嘅 X」 + 試其他 keyword hint
- [ ] 清空搜尋框 → 列表還原
- [ ] RWD mobile: 兩個 search input 喺 button / upload bar 下面, 唔碰撞

## What's NOT done (follow-up)

- [ ] Sprint 11 / 12: 補 E2E test 喺 `ProjectDetailPage` 嘅 bug tab (US-5.6 嘅 create + rich text + image paste)
- [ ] Sprint 11: 補 E2E test 喺 `ProjectDetailPage` 嘅 bug tab search filter
- [ ] Sprint 11: Wiki full-text search (搜尋 content, 唔淨止 title) — 需要 Postgres `tsvector` 或 MeiliSearch,scope 較大

## Lessons

1. **`describe.skip` > `test.skip` x N**: 6 個 test skip 唔應該逐個 mark,而係 group 一個 describe skip, 報告更清楚
2. **File 頂部註解要更新**: 跟住 code 變, file header 嘅 invariant list 都要 mark DEPRECATED, 否則下一個睇 code 嘅人會混淆
3. **PR-style file 頂部 changelog 比 inline comment 更明顯**: 將「2026-06-09 變更」放 file header (eg. `bugs-fix.spec.ts` 嘅 6 行 block), reader 一開 file 就知有咩 historical context
4. **紅線 11 (改 PRD 必更新 tracker) 真係 work**: 改 6 個 file 之後,如果唔更新 QA-TRACKER.md, 紅線 11 違反, 紅線 12 (P0 US 必須有 test) 都違反。**docs 同步係 ship 嘅必要條件, 唔係 optional**
