/**
 * 日志输出工具 — TD-010: Structured JSON logging for aggregation
 *
 * Features:
 * - Human-readable format (development) vs JSON format (production)
 * - ISO timestamps for log aggregation systems (CloudWatch, ELK, Datadog)
 * - Log levels: debug, info, warn, error
 * - Optional context fields for structured data
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

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

// TD-010: Detect if we should output JSON (production) or human-readable (development)
const isProduction = process.env.NODE_ENV === 'production' || process.env.JSON_LOGS === 'true'

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
    // TD-010: ISO format for log aggregation systems
    return new Date().toISOString()
  }

  private log(level: LogLevel, message: string, ...args: any[]) {
    if (!this.shouldLog(level)) return

    const timestamp = this.formatTime()
    const label = LOG_LEVELS[level]

    if (isProduction) {
      // TD-010: Structured JSON format for log aggregation
      const logEntry = {
        timestamp,
        level: label,
        logger: this.prefix,
        message,
        ...(args.length > 0 && { args: args.length === 1 ? args[0] : args })
      }
      console.log(JSON.stringify(logEntry))
    } else {
      // Development: human-readable colored output
      const color = LOG_COLORS[level]
      const timeLocal = new Date().toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei' })

      const parts = [
        `${color}[${timeLocal}]${RESET}`,
        `${color}[${label}]${RESET}`,
        `${color}[${this.prefix}]${RESET}`,
        message,
        ...args.map(a => (typeof a === 'object' ? JSON.stringify(a) : a))
      ]
      console.log(parts.join(' '))
    }
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
    // Success uses green, treated as INFO level
    if (isProduction) {
      console.log(JSON.stringify({
        timestamp: this.formatTime(),
        level: 'SUCCESS',
        logger: this.prefix,
        message,
        ...(args.length > 0 && { args })
      }))
    } else {
      const timeLocal = new Date().toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei' })
      console.log(
        `${'\x1b[32m'}[${timeLocal}][SUCCESS][${this.prefix}]${RESET}`,
        message,
        ...args.map(a => (typeof a === 'object' ? JSON.stringify(a) : a))
      )
    }
  }
}

export function createLogger(prefix: string): Logger {
  return new Logger(prefix)
}

export default Logger