import { mkdtemp, readdir, readFile, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { memoryEvents } from '../domain/testing/fakes.ts'
import { fileLog, logEvents } from './fileLog.ts'

describe('fileLog', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'review-log-'))
  })
  afterEach(() => rm(dir, { recursive: true, force: true }))

  it('appends timestamped lines to the day file', async () => {
    const log = fileLog(dir, () => new Date('2026-09-08T10:00:00.000Z'))
    log.write('info', 'hello')
    log.write('error', 'boom')
    expect(await readFile(join(dir, 'review-2026-09-08.log'), 'utf8')).toBe('2026-09-08T10:00:00.000Z info  hello\n2026-09-08T10:00:00.000Z error boom\n')
  })

  it('prunes files older than seven days and keeps the rest', async () => {
    const now = new Date('2026-09-08T10:00:00.000Z')
    const log = fileLog(dir, () => now)
    const old = join(dir, 'review-2026-08-30.log')
    await writeFile(old, 'x')
    const oldTime = new Date(now.getTime() - 9 * 86_400_000)
    await utimes(old, oldTime, oldTime)
    await writeFile(join(dir, 'review-2026-09-07.log'), 'y')
    await writeFile(join(dir, 'notes.txt'), 'z')

    await log.prune()

    expect((await readdir(dir)).sort()).toEqual(['notes.txt', 'review-2026-09-07.log'])
  })

  it('records bus events with their payload', async () => {
    const log = fileLog(dir, () => new Date('2026-09-08T10:00:00.000Z'))
    const events = memoryEvents()
    logEvents(events, log)
    events.emit({ type: 'sync.finished', repoId: 3, added: 1, updated: 2 })
    expect(await readFile(join(dir, 'review-2026-09-08.log'), 'utf8')).toContain('event sync.finished {"repoId":3,"added":1,"updated":2}')
  })
})
