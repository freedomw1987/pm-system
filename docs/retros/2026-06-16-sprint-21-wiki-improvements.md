# PLAN-21 — Sprint 21 Wiki Improvements (2026-06-16)

## Scope
David Chu 5 個改動,一次過做(揀 A),P0 = 1, 3, 4,P1 = 2, 5。

## User Stories
- **US-21.1** (P0) Wiki 上傳支援 `.doc` / `.xls` / `.txt`(舊版 binary Office + 純文字)
- **US-21.2** (P1) AI 分析文件時包含 **檔名**(`fileName`) 作為 context,提升 wiki 標題/標籤品質
- **US-21.3** (P0) 重覆上載偵測:**同 projectId + 標題完全相同** → 顯示 confirm modal「已有同名 Wiki,確認更新內容?」,用戶取消 = skip file
- **US-21.4** (P0) Wiki 查詢窗口 10 + metadata:結果包 `{ requested, matched, returned, totalAvailable }`,AI response 提示「找到 X 篇,已返回 10 篇(共 Y 篇可查)」
- **US-21.5** (P1) 跨項目查詢:冇 projectId 時 query 用戶所有 `ProjectMember` 項目,merge 後排序(當前 project 優先)

## Implementation plan

### Backend
| File | Change |
|------|--------|
| `backend/src/routes/documents.ts` | (1) `SUPPORTED_EXTENSIONS` 加 `.doc/.xls/.txt`(parser 各自實作 — `antiword` for .doc, `xlsx` for .xls(ExcelJS 支援,no extra dep),plain read for .txt);(2) `parseDocument` switch 4 → 6;(3) 加 `findExistingWikiPage(projectId, title)` helper,(4) `POST /parse` + `POST /batch-parse` 上載前查重,return `{ existingPage }` 喺 result;(5) `analyzeDocumentWithLLM` prompt 注入 `fileName` 已做咗(L440-443)— skip |
| `backend/src/routes/wikis.ts` | (3) `POST /` 加 optional `replaceId` body field,有就 update 而非 create + `updatedAt` 觸發 |
| `backend/src/routes/chat.ts` | (4) `MAX_WIKI_PAGES` 5 → 10,`searchWikiPages` return `{ results, requested, matched, returned, totalAvailable }`;(5) `search_wiki` tool handler 冇 `effectiveProjectId` 時 → 攞 user 嘅 ProjectMember list,query 每個 project 後 merge 排序,limit 仍 10(總) |

### Frontend
| File | Change |
|------|--------|
| `frontend/src/pages/WikiPage.tsx` | (1) `accept` 加 `.doc,.xls,.txt`;(2) UI 提示行更新;(3) batch results 顯示「重覆」warning(已有同 title 的 page),加「更新此頁」button → call `PUT /wikis/:id`;single `POST /documents/parse` 一樣加 confirm |
| `frontend/src/pages/ChatPage.tsx` | (5) dropdown 第一個 option 改「🌐 全部項目(跨項目搜尋)」value=`__all__`;send 時 detect `__all__` → omit projectId;AI 結果有 `matched > returned` 時顯示 banner |

### Tests (新增,對齊紅線 12, 16)
- `utils/wiki-dedup.test.ts` (新 file, 12 cases):
  - `normalizeTitleForCompare` lowercase / trim / collapse whitespace / strip trailing punct
  - `findExistingWikiPage` mock prisma,verified normalization 過 case-insensitive
- `documents.test.ts` (extended): 已有 60+ cases 仍然 pass
- `wikis.test.ts` (extended, US-21.3 `replaceId` 對應 cases 連同 `canAccessWikiPage` membership gate)
- `wiki-search.test.ts` (US-21.4 metadata + limit 10): SSE encoding test 對齊新 `WikiSearchResponse` shape

實際 test run: **710 pass / 0 fail / 1245 expect()** (整個 backend suite)

## Risks
- **`.doc` / `.xls` parser 揀 native binary path: `antiword` + `catdoc` (fallback) for .doc,`xls2csv` + `ssconvert` (fallback) for .xls** — Alpine `apk` 直接裝,zero npm CVE (vs SheetJS `xlsx@0.18.5` 有 Prototype Pollution + ReDoS CVEs 永久 0.18.5 卡住,見 `docs/REGRESSION-GUARD.md`)。Dockerfile 加 `apk add antiword xls2csv catdoc` 即可
- **`.xls` 較舊(BIFF8)未必全部正常 parse** — `xls2csv` 對 .xls 97-2003 兼容,但現代 .xlsx 寫成 .xls 副檔名嘅偽 file 會 fail。Error message 提示「legacy 格式可能無法解析,請用 .docx/.xlsx 再試」
- **Cross-project 5 個項目 × 30 個 wiki = 150 個 potential hit** → 攤平 limit 10(已存在嘅 `take` 邏輯包到),結果 metadata 帶 `matched > returned` 提示

## Why NOT SheetJS (最終 decision log)
- 計劃階段先諗 `word-extractor` + SheetJS xlsx Community Edition (pure JS, 0 native)
- 改用 native binary 嘅最後一刻發現 SheetJS xlsx 永久 0.18.5 有 **CVE-2023-30533 (Prototype Pollution) + CVE-2024-22363 (ReDoS)**,npm audit 會 fail
- Native binary path 完全避開呢個問題,Alpine 官方維護,唔會突然有 CVE 跳出
- Dockerfile build 慢 1-2 秒 (apk add),runtime 唔受影響

## Non-goals
- 唔做 OCR(scanned PDF) — 已 deprecated
- 唔做 fuzzy match(用戶揀 a 嚴格)
- 唔做 wiki merge 工具
