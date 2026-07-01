# Sprint 22 Audit Closure — Final Status Report (2026-06-23)

**Scope**: Post-Sprint-21 retro → 2026-06-23 audit sweep (t1–t7)
**Deliverable**: Closing report to chairman

---

## What changed

**17 commits** landed between Sprint 21 retro (`0aaea13`) and HEAD (`92b5820`), grouped into 6 themes:

| Theme | Commits | Status |
|-------|---------|--------|
| Release-build | `92b5820` (1) | ✅ Ship-ready |
| Docker upload | `5340f30` (1) | ✅ Ship-ready |
| LLM timeout | `cd8b676` / `04a5d79` / `e1382fa` (3) | ✅ Final value 180s |
| Wiki upload + nginx SSE | 8 commits | ✅ Working, 1 cosmetic debt |
| Sprint 21 closure 餘波 | `9315a20` / `f3f4772` / `6ac2353` (3) | ✅ Merged late |
| Dev environment | `07ef0b3` (1) | ✅ |

**Test status**: 84 / 84 pass, 0 new failure, 0 regression introduced.
- `bun test src/routes/documents.test.ts` → 30 / 30 [206 ms]
- `bun test src/routes/wikis.test.ts` → 30 / 30 [25 ms]
- `bun test src/routes/wiki-search.test.ts src/utils/wiki-dedup.test.ts` → 24 / 24 [233 ms]
- `nginx -t` via `nginx:alpine` → syntax ok, test successful

**TODO / FIXME / XXX / HACK markers in changed files**: 0 (clean — t7)

---

## What's still open

| ID | Level | Item | Source |
|----|-------|------|--------|
| **TD-NEW-8** | 🔴 P0 | `2495812` 殘留 9 個 `console.log` / `console.warn` 喺 `documents.ts` | t3 F1 |
| t2 F1 | 🟡 | `deploy/dist` v1.0.5 stale tarball (predates `5340f30` + `92b5820`) | t2 |
| t2 F6 | 🔴 | `shasum -a 256` macOS-only — Linux CI fail at CHECKSUMS step | t2 |
| **TD-NEW-9** | 🟡 P1 | nginx SSE 4-commit workaround chain 應 eventually 重整 + 寫 `docs/SSE-NGINX-TUNING.md` | t3 F2 |
| **TD-NEW-10** | 🟡 P1 | Docker backend upload 跟進 — 加 admin endpoint `GET /api/attachments/integrity-report` | t5 |

---

## What's risky

1. **🔴 Customer log noise + data leakage** — 2495812 console.log 殘留會寫 file name / size / LLM elapsed time 入客戶 docker log files (10 MB × 3 rotation)。**Sprint 22 Day-1 必修**。
2. **🔴 Linux CI blocker** — `shasum` 喺 Ubuntu runner fail。**未修之前 CI 唔可能綠**。
3. **🟡 v1.0.7 客戶升級首日** — `attachment-integrity` startup check 會 log 出 pre-existing orphan files (冇 recover)。Support 需準備 FAQ。
4. **🟡 Sprint 21 retro gap** — retro file 冇 audit `2495812` 嘅 console.log 殘留。Sprint 22 retro 模板要加 "residual debug log check" 段。

---

## Recommended next-step ordering

| # | Priority | Effort | Item | Why first |
|---|----------|--------|------|-----------|
| **1** | **P0** | 0.1 日 | Fix `shasum` → `sha256sum` + fallback (t2 F6) | Unblocks CI 立即。 |
| **2** | **P0** | 0.5 日 | 清 `2495812` 9 個 console.log (TD-NEW-8) | Customer-facing log 噪音 + 資料外洩。 |
| **3** | **P1** | 0.2 日 | Re-build `deploy/dist` v1.0.6 (t2 F1) | Ship 客戶前最後一步。 |
| **4** | **P1** | 0.5 日 | 寫 `docs/SSE-NGINX-TUNING.md` (TD-NEW-9) | 防下個人手賤 reset nginx config。 |
| **5** | **P1** | 0.5 日 | 加 `GET /api/attachments/integrity-report` (TD-NEW-10) | 客戶升級 v1.0.7 後自查工具。 |
| **6** | P2 | 0.3 日 | `2495812` heartbeat time-mocked unit test | 補 t4 觀察嘅 coverage gap。 |
| **7** | P2 | 0.2 日 | CONTRIBUTING.md commit msg 規則 | 防 `debug:` 標籤誤用再發生。 |

**總 effort**: 5 個 ship-blocker item 共 2.3 日。Sprint 22 1 週可完成所有 P0+P1。

---

## Audit artifacts (可追溯)

| Task | 報告 |
|------|------|
| t1 commit audit | `docs/retros/_meta/post-sprint-21-changelog.md` |
| t2 build-release | `docs/retros/_meta/build-release-audit-2026-06-23.md` |
| t3 debug triage | `docs/retros/_meta/post-sprint-21-debug-triage.md` |
| t4 regression | `docs/retros/_meta/post-sprint-21-regression-2026-06-23.md` |
| t5 tracker update | `docs/TECH-DEBT.md` + `docs/QA-TRACKER.md` |
| t6 retro skeleton | `docs/retros/2026-06-23-sprint-22-skeleton.md` |
| t7 TODO grep | 0 markers in 22 changed files |

---

## Verdict

**Ship-ready from correctness standpoint** — 0 regression, image name / env var / volume 全對齊,所有 test 綠。

**兩個 P0 customer-facing item 必須 Sprint 22 Day-1 + Day-2 處理** — 否則下一個 release 會帶 stale tarball + log 噪音落客戶機。

**Audit trail 完整** — 7 份 audit 文件入 `docs/retros/_meta/`,3 個 TECH-DEBT entry register 落 tracker,Sprint 22 retro skeleton 已經 pre-populate "What shipped"。