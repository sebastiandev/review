import { appendFileSync, mkdirSync } from 'node:fs'
import { readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { ServerEvent } from '@review/shared'
import type { Events } from '../domain/ports.ts'

const RETENTION_DAYS = 7
const FILE_PREFIX = 'review-'

export type FileLog = {
  /** Append one line, prefixed with the time and level. */
  write(level: 'info' | 'warn' | 'error', message: string): void
  /** Delete log files older than the retention window. */
  prune(): Promise<void>
  dir: string
}

/**
 * Daily log files under `dir` (`review-YYYY-MM-DD.log`), appended synchronously so a crash
 * still leaves the last line on disk. `prune` drops files older than seven days.
 */
export function fileLog(dir: string, now: () => Date = () => new Date()): FileLog {
  mkdirSync(dir, { recursive: true })
  return {
    dir,
    write(level, message) {
      const at = now()
      const file = join(dir, `${FILE_PREFIX}${at.toISOString().slice(0, 10)}.log`)
      appendFileSync(file, `${at.toISOString()} ${level.padEnd(5)} ${message}\n`)
    },
    async prune() {
      const cutoff = now().getTime() - RETENTION_DAYS * 86_400_000
      for (const name of await readdir(dir)) {
        if (!name.startsWith(FILE_PREFIX) || !name.endsWith('.log')) continue
        const path = join(dir, name)
        if ((await stat(path)).mtimeMs < cutoff) await rm(path, { force: true })
      }
    },
  }
}

/** Every event on the bus goes to the log; the `scope` chat events carry too much text, so only their type. */
export function logEvents(events: Events, log: FileLog): () => void {
  return events.subscribe((e: ServerEvent) => {
    const { type, ...rest } = e
    const body = 'scope' in rest ? `scope=${String(rest.scope)}` : JSON.stringify(rest)
    log.write('info', `event ${type} ${body}`)
  })
}

/**
 * Mirror `console.log/warn/error` into the file, keeping the terminal output. Returns a restore
 * function.
 */
export function teeConsole(log: FileLog): () => void {
  const original = { log: console.log, warn: console.warn, error: console.error }
  const text = (args: unknown[]) => args.map((a) => (a instanceof Error ? a.stack ?? a.message : typeof a === 'string' ? a : JSON.stringify(a))).join(' ')
  console.log = (...args: unknown[]) => {
    original.log(...args)
    log.write('info', text(args))
  }
  console.warn = (...args: unknown[]) => {
    original.warn(...args)
    log.write('warn', text(args))
  }
  console.error = (...args: unknown[]) => {
    original.error(...args)
    log.write('error', text(args))
  }
  return () => Object.assign(console, original)
}
