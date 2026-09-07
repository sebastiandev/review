import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserSettings } from '@review/shared'
import { DEFAULT_USER_SETTINGS } from '../domain/settings.ts'
import type { Store } from '../domain/store.ts'
import { GITHUB_REPO } from '../domain/testing/fakes.ts'
import { scheduler, type Scheduler } from './scheduler.ts'

const MINUTE = 60_000

describe('scheduler', () => {
  let settings: UserSettings
  let synced: number[]
  let release: (() => void) | null
  let sut: Scheduler

  const store: Pick<Store, 'repos' | 'settings'> = {
    repos: {
      list: () => [
        { ...GITHUB_REPO, id: 1, tracked: true, autoReview: false, syncedAt: null, syncError: null },
        { ...GITHUB_REPO, id: 2, name: 'gadgets', tracked: false, autoReview: false, syncedAt: null, syncError: null },
        { ...GITHUB_REPO, id: 3, name: 'gizmos', tracked: true, autoReview: false, syncedAt: null, syncError: null },
      ],
      get: () => null,
      find: () => null,
      insert: () => {
        throw new Error('unused')
      },
      update: () => {},
    },
    settings: { read: () => settings, write: () => {} },
  }

  beforeEach(() => {
    vi.useFakeTimers()
    settings = { ...DEFAULT_USER_SETTINGS, pollInterval: 5 }
    synced = []
    release = null
    sut = scheduler({
      store,
      log: () => {},
      syncRepo: (id) =>
        new Promise<void>((resolve) => {
          synced.push(id)
          if (release) release = resolve
          else resolve()
        }),
    })
  })
  afterEach(() => vi.useRealTimers())

  it('syncs every tracked repo after the interval, then again after the next', async () => {
    sut.start()
    await vi.advanceTimersByTimeAsync(5 * MINUTE - 1)
    expect(synced).toEqual([])
    await vi.advanceTimersByTimeAsync(1)
    expect(synced).toEqual([1, 3])
    await vi.advanceTimersByTimeAsync(5 * MINUTE)
    expect(synced).toEqual([1, 3, 1, 3])
  })

  it('arms nothing when the interval is manual', async () => {
    settings.pollInterval = 'manual'
    sut.start()
    await vi.advanceTimersByTimeAsync(60 * MINUTE)
    expect(synced).toEqual([])
  })

  it('reschedule applies a changed interval without running immediately', async () => {
    sut.start()
    settings.pollInterval = 1
    sut.reschedule()
    expect(synced).toEqual([])
    await vi.advanceTimersByTimeAsync(MINUTE)
    expect(synced).toEqual([1, 3])
  })

  it('runNow syncs one repo or all tracked repos, and reports busy while a tick runs', async () => {
    release = () => {}
    expect(sut.runNow(3)).toBe('started')
    expect(sut.runNow()).toBe('busy')
    expect(synced).toEqual([3])
    release()
    await vi.advanceTimersByTimeAsync(0)
    release = null
    expect(sut.runNow()).toBe('started')
    await vi.advanceTimersByTimeAsync(0)
    expect(synced).toEqual([3, 1, 3])
  })

  it('a timer tick that lands during a manual run is skipped, not overlapped', async () => {
    sut.start()
    release = () => {}
    sut.runNow(1)
    await vi.advanceTimersByTimeAsync(5 * MINUTE)
    expect(synced).toEqual([1])
    release()
    release = null
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(5 * MINUTE)
    expect(synced).toEqual([1, 1, 3])
  })

  it('keeps going when one repo fails', async () => {
    sut = scheduler({ store, log: () => {}, syncRepo: async (id) => { synced.push(id); if (id === 1) throw new Error('gh down') } })
    sut.runNow()
    await vi.advanceTimersByTimeAsync(0)
    expect(synced).toEqual([1, 3])
  })
})
