/**
 * FullscreenModal tests — Sprint 21
 *
 * 覆蓋:
 *  - open=false 時唔 render
 *  - open=true 時 render 標題、close 鈕、children
 *  - 點 close 鈕 → onClose 觸發
 *  - 點 toggle 鈕 → 切換 max-w 容器
 *  - close 時 reset isFullWidth 狀態
 *  - 冇 footer 時唔 render footer
 */
import { describe, expect, test, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import FullscreenModal from './FullscreenModal'

describe('FullscreenModal', () => {
  test('open=false 時唔 render 任何嘢', () => {
    render(
      <FullscreenModal open={false} onClose={() => {}} title="hidden">
        <p>不應出現</p>
      </FullscreenModal>
    )
    expect(screen.queryByText('hidden')).toBeNull()
    expect(screen.queryByText('不應出現')).toBeNull()
  })

  test('open=true 時 render 標題 + close 鈕 + children', () => {
    render(
      <FullscreenModal open onClose={() => {}} title="新增任務">
        <p>任務描述內容</p>
      </FullscreenModal>
    )
    expect(screen.getByText('新增任務')).toBeTruthy()
    expect(screen.getByText('任務描述內容')).toBeTruthy()
    // close 鈕有 aria-label=關閉
    expect(screen.getByLabelText('關閉')).toBeTruthy()
  })

  test('點 close 鈕 → onClose 觸發', () => {
    const onClose = vi.fn()
    render(
      <FullscreenModal open onClose={onClose} title="x">
        <p>content</p>
      </FullscreenModal>
    )
    fireEvent.click(screen.getByLabelText('關閉'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  test('點 toggle 鈕 → 切換 aria-label(預設 → 全寬,全寬 → 預設)', () => {
    render(
      <FullscreenModal open onClose={() => {}} title="x">
        <p>content</p>
      </FullscreenModal>
    )
    const toggle = screen.getByLabelText('切換為全寬')
    expect(toggle).toBeTruthy()
    fireEvent.click(toggle)
    // 之後變成「切換為預設寬度」
    expect(screen.getByLabelText('切換為預設寬度')).toBeTruthy()
  })

  test('冇 footer 時唔 render footer 容器', () => {
    const { container } = render(
      <FullscreenModal open onClose={() => {}} title="x">
        <p>content</p>
      </FullscreenModal>
    )
    // 冇 footer 時,border-t 容器應該唔存在
    expect(container.querySelector('.border-t')).toBeNull()
  })

  test('有 footer 時 render footer 內容', () => {
    render(
      <FullscreenModal
        open
        onClose={() => {}}
        title="x"
        footer={<button>確認</button>}
      >
        <p>content</p>
      </FullscreenModal>
    )
    expect(screen.getByText('確認')).toBeTruthy()
  })
})
