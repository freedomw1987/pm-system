/**
 * FullscreenModal — Sprint 21 全屏 modal 統一 layout
 *
 * 背景:
 *   - ProjectDetailPage 嘅需求 modal 早就有「全寬(95vw)」toggle(Sprint 20 US-4)
 *   - Sprint 21 將呢個 pattern 抽出去畀需求/任務/缺陷 modal 統一用,避免每個
 *     modal 各自重覆實作(7+ 個 modal 容易 drift)。
 *
 * 設計:
 *   - 內部自己管 isFullWidth state,close 時自動 reset
 *   - 提供 header / body / footer 三個 slot 取代 inline JSX
 *   - body 永遠係 flex-1 + overflow-y-auto,確保長內容唔會 push 走 submit 鈕
 *   - header / footer 永遠 flex-shrink-0
 *   - 寬度:
 *       default  → max-w-2xl md:max-w-4xl(適合大部分 modal)
 *       fullWidth → max-w-[95vw](適合長描述/表格)
 *
 * Props:
 *   - open: 是否顯示
 *   - onClose: 關閉 callback
 *   - title: 標題文字
 *   - headerExtra: 標題右邊額外 slot(罕用)
 *   - children: body 內容(form 應該擺呢度)
 *   - footer: 底部 slot(通常放 cancel + submit 鈕)
 *   - defaultFullWidth: 開 modal 時預設就係全寬
 */
import { useEffect, useState, type ReactNode } from 'react'
import { Maximize2, Minimize2, X } from 'lucide-react'

export interface FullscreenModalProps {
  open: boolean
  onClose: () => void
  title: string
  /** 標題右邊額外 slot,放喺 toggle / close 鈕之前 */
  headerExtra?: ReactNode
  children: ReactNode
  /** 底部 slot(通常放 cancel / submit) */
  footer?: ReactNode
  /** 開 modal 時預設全寬(用喺「我知內容會好長」嘅場景) */
  defaultFullWidth?: boolean
}

export default function FullscreenModal({
  open,
  onClose,
  title,
  headerExtra,
  children,
  footer,
  defaultFullWidth = false,
}: FullscreenModalProps) {
  const [isFullWidth, setIsFullWidth] = useState(defaultFullWidth)

  // 開 modal 時重置 state(避免下次開仍係上次嘅 toggle 狀態)
  useEffect(() => {
    if (open) setIsFullWidth(defaultFullWidth)
  }, [open, defaultFullWidth])

  if (!open) return null

  const widthClass = isFullWidth ? 'max-w-[95vw]' : 'max-w-2xl md:max-w-4xl'

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-start sm:items-center justify-center z-50 px-4 py-4 sm:py-8 overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`bg-white rounded-xl shadow-xl w-full ${widthClass} p-6 max-h-[90vh] flex flex-col`}
      >
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <h2 className="text-lg font-bold text-gray-900">{title}</h2>
          <div className="flex items-center gap-1">
            {headerExtra}
            <button
              type="button"
              onClick={() => setIsFullWidth((v) => !v)}
              className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500"
              title={isFullWidth ? '切換為預設寬度' : '切換為全寬(適合長內容/表格)'}
              aria-label={isFullWidth ? '切換為預設寬度' : '切換為全寬'}
            >
              {isFullWidth ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1 hover:bg-gray-100 rounded-lg"
              aria-label="關閉"
            >
              <X size={20} />
            </button>
          </div>
        </div>
        {/* body 永遠 flex-1 + overflow-y-auto,確保長內容唔會擋住 footer 嘅 submit 鈕 */}
        <div className="flex-1 overflow-y-auto pr-1">{children}</div>
        {footer && (
          <div className="flex gap-3 justify-end pt-4 mt-4 border-t border-gray-100 flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
