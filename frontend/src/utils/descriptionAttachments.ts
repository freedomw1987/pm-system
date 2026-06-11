/**
 * descriptionAttachments — 描述中圖片處理工具(Sprint 21)
 *
 * 背景:
 *   - RichTextEditor 喺冇 uploadEntity 嘅情況下(create mode 冇 entity ID)會將
 *     貼上嘅圖變成 base64 data URL 直接嵌入 HTML。
 *   - data URL 太大會:
 *       a) 增加 payload size
 *       b) 喺 stripHtml 嘅 list 預覽同 sanitizer 嘅下游處理容易出問題
 *       c) 編輯模式重開時 data URL 可能 render 唔到(用戶回報嘅痛點)
 *   - 修法:save 之前/之後掃 description 裏面嘅 data:image/...;base64,逐個 upload
 *     去 /api/attachments,拎到 server URL 之後 replace 入 HTML,再 save 落庫。
 *
 * 適用實體:sprint 21 修 defect 嗰陣只做 bug,而家通用化到:
 *   requirement / task / project / wiki / bug
 *   (對應 backend attachments.ts 接受嘅 entityType 集合)
 *
 * 設計:
 *   - migrateDataUrlsToAttachments(html, entityType, entityId) → Promise<string>
 *     返替換好嘅 HTML。如果冇 data URL 直接 return 原字串(冇 side-effect)。
 *   - 用「placeholder + index-based replace」做替換,避免 split().join() 喺
 *     兩張相同 data URL 入面同時命中嘅 bug(典型場景:同張 screenshot 貼兩次)。
 *   - 任何一步失敗都唔 throw,fallback 保留原 data URL(總好過丟失資料)。
 */
import { attachmentApi } from './api'

const DATA_URL_RE = /<img[^>]+src="(data:image\/[a-zA-Z+.-]+;base64,[^"]+)"/g

export type RichTextEntityType = 'requirement' | 'task' | 'project' | 'wiki' | 'bug'

/**
 * 將 description HTML 內嘅 data URL 圖片 upload 去 /api/attachments,
 * 然後 replace 對應 src 做 server URL。
 *
 * - entityId 必須有效(server 要用呢個 ID 落 attachment table)
 * - 冇 data URL 時直接 return 原 html(zero side-effect)
 * - 個別 upload 失敗嗰張會保留 data URL 唔郁,其他繼續行
 */
export async function migrateDataUrlsToAttachments(
  html: string,
  entityType: RichTextEntityType,
  entityId: string,
): Promise<string> {
  if (!html || !html.includes('data:image/')) return html

  // 1. 拎出所有 data URL + 佢哋喺原 HTML 嘅位置(offset)
  //    用 index 紀錄位置係為咗後面用 placeholder-based replace 避免
  //    兩張同樣 data URL(screenshot 重複貼)同時命中嘅 bug。
  type Hit = { dataUrl: string; ext: string; mime: string; index: number }
  const hits: Hit[] = []
  for (const m of html.matchAll(DATA_URL_RE)) {
    const dataUrl = m[1]
    const mimeMatch = dataUrl.match(/^data:(image\/[a-zA-Z+.-]+);base64,/)
    const mime = mimeMatch?.[1] ?? 'image/png'
    const ext = mime.split('/')[1]?.replace('jpeg', 'jpg') ?? 'png'
    hits.push({ dataUrl, ext, mime, index: m.index ?? 0 })
  }
  if (hits.length === 0) return html

  // 2. 預備 placeholder pattern,後面按 index 由後往前 replace,避免 offset 漂移
  //    placeholder 一定要係 substring 唔可能喺原 HTML 出现,先至安全
  const placeholder = (i: number) => `__DESC_MIGRATE_PLACEHOLDER_${i}__`
  let staged = html
  for (let i = 0; i < hits.length; i++) {
    staged = staged.replace(hits[i].dataUrl, placeholder(i))
  }

  // 3. 逐個 upload;成功嘅拎 URL 落 placeholder,失敗嘅 restore 番 data URL
  for (let i = 0; i < hits.length; i++) {
    const { dataUrl, ext, mime } = hits[i]
    try {
      const blob = await (await fetch(dataUrl)).blob()
      const file = new File([blob], `pasted-${Date.now()}-${i}.${ext}`, { type: mime })
      const res = await attachmentApi.upload(file, entityType, entityId)
      const id = (res.data as any).id
      if (!id) {
        staged = staged.replace(placeholder(i), dataUrl)
        continue
      }
      const url = `/api/attachments/${id}`
      staged = staged.replace(placeholder(i), url)
    } catch (err) {
      console.warn('[descriptionAttachments] data URL 圖片上傳失敗,保留原 data URL:', err)
      staged = staged.replace(placeholder(i), dataUrl)
    }
  }
  return staged
}
