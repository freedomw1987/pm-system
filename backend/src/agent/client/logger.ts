/**
 * 日志输出工具
 */

export type LogLevel = 'info' | 'warn' | 'error' | 'debug'

const LOG_LEVELS: Record<LogLevel, string> = {
  info: 'INFO',
  warn: 'WARN',
  error: 'ERROR',
  debug: 'DEBUG'
}

const LOG_COLORS: Record<LogLevel, string> = {
  info: '\x1b[36m',    // cyan
  warn: '\x1b[33m',    // yellow
  error: '\x1b[31m',   // red
  debug: '\x1b[90m'    // gray
}

const RESET = '\x1b[0m'

class Logger {
  private prefix: string
  private level: LogLevel

  constructor(prefix: string = 'Agent', level: LogLevel = 'info') {
    this.prefix = prefix
    this.level = level
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error']
    return levels.indexOf(level) >= levels.indexOf(this.level)
  }

  private formatTime(): string {
    return new Date().toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei' })
  }

  private log(level: LogLevel, message: string, ...args: any[]) {
    if (!this.shouldLog(level)) return

    const time = this.formatTime()
    const color = LOG_COLORS[level]
    const label = LOG_LEVELS[level]

    const parts = [
      `${color}[${time}]${RESET}`,
      `${color}[${label}]${RESET}`,
      `${color}[${this.prefix}]${RESET}`,
      message,
      ...args.map(a => (typeof a === 'object' ? JSON.stringify(a) : a))
    ]

    console.log(parts.join(' '))
  }

  info(message: string, ...args: any[]) {
    this.log('info', message, ...args)
  }

  warn(message: string, ...args: any[]) {
    this.log('warn', message, ...args)
  }

  error(message: string, ...args: any[]) {
    this.log('error', message, ...args)
  }

  debug(message: string, ...args: any[]) {
    this.log('debug', message, ...args)
  }

  success(message: string, ...args: any[]) {
    const time = this.formatTime()
    console.log(
      `${'\x1b[32m'}[${time}][SUCCESS][${this.prefix}]${RESET}`,
      message,
      ...args.map(a => (typeof a === 'object' ? JSON.stringify(a) : a))
    )
  }
}

export function createLogger(prefix: string): Logger {
  return new Logger(prefix)
}

export default Logger