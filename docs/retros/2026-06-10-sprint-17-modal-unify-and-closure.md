# Retro — Sprint 17 (2026-06-10) AddTaskModal Unification + Sprint 15/16 Closure

## TL;DR

呢個 sprint 係**收口型**,唔 ship 新 feature:

1. **AddTaskModal unification** (commit `f6f3674`,2026-06-10 02:59) — ProjectKanban 同 ProjectDetailPage > Task Tab 兩個入口共用同一個 `AddTaskModal` component。前者原本 inline 76 行 modal 缺 smart-assign / participants / parent task / RichText,UI drift bug 嘅 textbook。
2. **E2E regression guard** (Sprint 17 新 spec) — `e2e/tests/add-task-modal-unified.spec.ts`,3 test pass 8.1s,守住「兩個入口 modal field set 100% 一致」嘅 invariant。
3. **QA-TRACKER 同步** — Sprint 17 row 加返,Sprint 15/16 PARTIAL 嘢 confirm PASS(實際上 Sprint 15/16 closure entry tracker 已經有,呢條 sprint 補返 row + healthy 指標)。

紅線 11(改 PRD 必更新 tracker)同 紅線 12(P0 modal 規模性 refactor 必須有 E2E)全部守住。

## What changed

### File 修改

| File | Change | Notes |
|------|--------|-------|
| `frontend/src/components/AddTaskModal.tsx` | **新 file** 216 行 | f6f3674 — single source of truth |
| `frontend/src/components/ProjectKanban.tsx` | +86 / -67 | inline 76-line modal 拎走,wire 共用 component;auto-assign useEffect 補返(原本 toggle inert);onClose 重設 7 個 form state(原本 leak) |
| `frontend/src/pages/ProjectDetailPage.tsx` | +47 / -100 | `assigneeOptions` type 由 `JSX.Element[]` 改返 `MemberOption[]`(三個 local modal 都 .map 自己 `<option>`)|
| `e2e/tests/add-task-modal-unified.spec.ts` | **新 file** 252 行 | Sprint 17 — 3 個 E2E test |
| `docs/QA-TRACKER.md` | Sprint 17 row + footer | 紅線 11 |
| `docs/retros/2026-06-10-sprint-17-modal-unify-and-closure.md` | **新 file** 本檔 | 收口 |

### Behaviour 改動

1. **ProjectKanban 嘅「新增任務」按鈕** 而家開出嘅 modal 完全等同 ProjectDetailPage > Task Tab 嘅「新建任務」按鈕:
   - 標題(required)
   - 描述(RichTextEditor,原本 Kanban 入面只係純 textarea)
   - 智能分配 toggle + recommended agent panel(原本 Kanban 缺)
   - 負責人 select
   - 參與人(ToggleMultiSelect,原本 Kanban 缺)
   - 父任務 select(原本 Kanban 缺)
   - 取消 / 建立任務
2. **ProjectKanban 嘅 auto-assign useEffect** 而家真正 wire 上,toggle ON 會 trigger 350ms debounce 推薦(原本 toggle 不動)
3. **onClose reset** — 7 個 state 全部 reset,modal 重開時冇舊 data 漏出嚟

## Key decisions (with WHY)

### 1. **Modal 共用 component 而唔係 copy-paste sync**
- **Why**: David 紅線「backend pass 唔代表 UI 唔 drift」。Copy-paste 兩個 modal 將來改 field 時,99% 漏 sync。共用 component **編譯期** 就鎖實兩邊一致
- **Trade-off**: AddTaskModal props 比較長(20 個 controlled props),但 callers 可以共享 form state hooks,實際上 ProjectKanban + ProjectDetailPage 已經各自有 `newTaskTitle` / `newTaskDesc` 等 state,單純改 import + 移除 inline JSX 完事

### 2. **E2E test 用 set-diff 而唔係逐 field assert**
- **Why**: 直接 `expect(kanbanFields).toEqual(taskTabFields)` 將 invariant 寫死。將來加新 field 只要兩邊都加(因為共用 component 自動兩邊都加),test 就 pass;只加一邊(理論上唔會發生,但 reviewer 萬一不小心 inline 一個 modal),test 即時 fail
- **Trade-off**: 邊有 11 個 assert key(8 個 field set 拆成 label + control)細了 verbose,但 visibility snapshot 唯一保證咗 control 真係 render(唔係淨係 import 但 mount fail)

### 3. **跑驗證唔 rebuild docker**
- **Why**: Stack 12 分鐘前已起,frontend bundle 已包含 commit f6f3674 嘅 `AddTaskModal.tsx`(`'智能分配'` 字串 production bundle 出現一次,證明 single code path)。直接 `npx playwright test` 8.1s 過齊 3 test
- **Lesson**: 紅線「docker pass 唔代表 UI work」反過來都成立 — Stack up + smoke pass 就可以直接攻 E2E,唔需要每次 build。但 backend code 改咗就必須 `docker compose build backend --no-cache`(Sprint 15 lesson)

### 4. **Sprint 17 唔做 docker compose up -d --build,只跑 e2e**
- **Why**: Sprint 17 全 frontend 改,frontend container 用 nginx serve `dist/`,reload page 即攞新 bundle。Backend 0 變更,db 0 變更,純 e2e 驗證 frontend deploy bundle 已足夠
- **Trade-off**: 如果 frontend bundle 唔係 fresh(例如 dev mode hot-reload 出 problem),會 mislead — 用 `docker exec frontend cat /usr/share/nginx/html/index.html` confirm bundle hash 至安全。今次 stack 健康冇遇到呢個

## Verification

### E2E
```bash
cd ~/Sites/localhost/pm-system/e2e
npx playwright test add-task-modal-unified.spec.ts --reporter=list
# Running 3 tests using 1 worker
#  ✓ Task Tab「新建任務」按鈕開出 AddTaskModal,8 個 field/control 全部 visible (2.3s)
#  ✓ Kanban Tab 每個 column 嘅「新增任務」按鈕開出同樣 AddTaskModal (1.6s)
#  ✓ 兩個入口開出嘅 modal field set 完全一致(set diff = ∅) (1.6s)
#  3 passed (8.1s)
```

### TypeScript
- `frontend/` 已喺 commit f6f3674 build clean(commit message 列明 verified)
- `e2e/` 冇獨立 tsconfig,Playwright runtime 直接執行 .ts,跑得即 OK

### Stack health
```
pm-system-frontend-1   Up 12 minutes (healthy)
pm-system-backend-1    Up 12 minutes (unhealthy*)
pm-system-db-1         Up 17 hours (healthy)

*backend healthcheck endpoint /health 404 但 /auth/login 200 — healthcheck 配置問題唔關 backend 死活事,
 留待下次 sprint cleanup(已記入 TECH-DEBT 候選)
```

## What's NOT done (follow-up)

### TECH-DEBT 入 backlog

| ID | 描述 | Sprint |
|----|------|--------|
| TD-? | Backend `/health` endpoint 唔存在 → docker healthcheck 一直 unhealthy(但 service 真係健康)。應該加 `GET /health` 返 200 with `{db: ok}` | next |
| TD-? | `AddTaskModal` 嘅 props 有 20 個(controlled component pattern)。將來 8+ callers 時要考慮抽 `useTaskFormState` custom hook,callers 只 pass `{mode: 'create'/'edit', initial: task}` | 等到出現第 3 個 caller |

### Sprint 17 唔 cover 嘅 modal

- `CreateBugModal.tsx` — Sprint 11 已 mark DEFERRED,仲未對齊 `<AddBugModal>` pattern。3 個 divergent bug-creation surface(原 `BugsPage` 已 deprecated,但 `ProjectDetailPage > Bugs tab` + `RequirementDetailPage > Bugs sub-list` 都有 inline)
- `EditTaskModal` — ProjectDetailPage 仲係 inline 寫死。Edit flow 同 Create flow 邏輯近 90% 重複,將來如果 Edit modal 都用 `AddTaskModal` props pattern,可以共用 component(只係 `submitLabel` 同 `onSubmit` 唔同)

## Lessons

1. **Inline modal 係 UI drift 嘅 default 路徑** — Kanban 入面 76 行 inline JSX,Sprint 7 之後 ProjectDetailPage 加咗 smart-assign / participants / parent task,Kanban 全部錯過。**Default 應該係共用 component,inline 係 exception**
2. **`assigneeOptions` type 由 JSX.Element[] → MemberOption[]` 嘅 lesson** — 之前 ProjectDetailPage 用 `members.map(m => <option>...)` 直接 build options。Refactor 抽 component 時呢個 anti-pattern 即時暴露(type signature 對唔上)。共用 component 嘅好處之一:**強制 callers normalise data 至 data,唔係 JSX**
3. **E2E set-diff 比 happy-path assert 守得更緊** — 「兩個入口 modal field 一致」呢個 invariant,如果只係 Task Tab spec 個別 assert + Kanban Tab spec 個別 assert,將來改 field 只 update Kanban 一邊 test,Task Tab spec 嗰邊 stale assert 仲 pass。**Set diff 直接守 cross-entity invariant**
4. **Sprint 17 嘅 wall-clock 真係 30 + 20 分鐘** — David 預估準。事實上加埋紅線 check + commit message,~50 分鐘 ship。**收口型 sprint 唔需要 over-engineer 個 scope**
5. **`run_in_background` 對 docker 唔啱用** — 本次 stack 12 分鐘前已起,直接 `curl` smoke test 確認 backend healthy(雖然 docker healthcheck 報 unhealthy)。`docker ps` 嗰個 (unhealthy) 唔好誤導 — 永遠用 application-level smoke 確認,唔好淨睇 healthcheck status

## Commit series

- `f6f3674 feat(frontend): unify Add Task modal — Kanban + Task Tab use single AddTaskModal (2026-06-10)` (已 commit,本 sprint 起點)
- (待 commit) `test(e2e): Sprint 17 — AddTaskModal unified regression guard (3 tests, 8.1s)`
- (待 commit) `docs(qa-tracker+retros): Sprint 17 closure — modal unify + Sprint 15/16 confirm PASS`

## 紅線狀態

| 紅線 | 狀態 | Notes |
|------|------|-------|
| 11(改 PRD 必更新 tracker) | ✅ | QA-TRACKER.md Sprint 17 row 已加 |
| 12(P0 規模性 refactor 必有 E2E) | ✅ | `add-task-modal-unified.spec.ts` 3 test pass |
| 13(無 user-reported bug fix) | N/A | 預防性 refactor + regression guard,非 bug fix |
