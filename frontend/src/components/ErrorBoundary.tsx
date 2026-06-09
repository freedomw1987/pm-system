/**
 * ErrorBoundary — Sprint 18 TD-005
 *
 * React 19 嘅 `createBrowserRouter` 支援 route-level `errorElement`,但 PM System
 * 沿用 `BrowserRouter + Routes` 舊式 pattern(2026-01 init),要 error boundary
 * 一定要 class component(因為 hooks version 仲未 stable)。
 *
 * 點解要:之前 spec 揭發過 `prisma.user.findUnique` throw 500(RG-006),前端只
 *   console.error,user 見個空白 screen + 「死咗」冇 indication。ErrorBoundary
 *   提供 fallback UI(用家睇得到嘅 error page)+ console.error 保持 debug
 *   路徑。
 *
 * Scope 限制(Sprint 18):
 * - 只 catch render error(Sprint 18 範圍),唔 catch event handler / async
 *   error(要 caller 自己 try/catch + setState)
 * - Reset by 重新 reload page(簡單)或 click「重新整理」button
 * - 唔接 Sentry / analytics(將來 TD-007/010 再做)
 *
 * 對應 TD-005:Frontend 統一 error boundary,user-friendly 訊息 + 留 console error 留 debug
 */

import { Component, type ReactNode, type ErrorInfo } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // 保留 console.error 路徑俾 dev / Sentry(將來)
    console.error('[ErrorBoundary] caught:', error, errorInfo)
    this.setState({ errorInfo })
  }

  private handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
          <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
            <div className="text-6xl mb-4">⚠️</div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">頁面發生錯誤</h1>
            <p className="text-gray-600 mb-6">
              抱歉,系統發生未預期的錯誤。請重新整理頁面,或聯絡管理員。
            </p>
            {this.state.error && (
              <details className="text-left bg-gray-50 rounded p-3 mb-6 text-xs text-gray-700">
                <summary className="cursor-pointer font-medium">錯誤詳情</summary>
                <pre className="mt-2 whitespace-pre-wrap break-words">
                  {this.state.error.name}: {this.state.error.message}
                  {this.state.errorInfo?.componentStack && '\n\nStack:\n' + this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}
            <button
              onClick={this.handleReload}
              className="btn-primary w-full"
            >
              重新整理頁面
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
