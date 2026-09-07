import type { Store } from '../domain/store.ts'

export type SchedulerDeps = {
  store: Pick<Store, 'repos' | 'settings'>
  /** The `syncRepo` Command, bound to its deps. Failures are already recorded on the repo. */
  syncRepo: (repoId: number) => Promise<unknown>
  log?: (message: string) => void
}

export type Scheduler = {
  /** Arm the first tick according to `settings.pollInterval`. */
  start(): void
  /** Re-read `pollInterval` and re-arm; a running tick is left alone. */
  reschedule(): void
  /** Sync one repo, or every tracked repo, right now. `busy` when a tick is in progress. */
  runNow(repoId?: number): 'started' | 'busy'
}

/**
 * Periodic fetch of tracked repos: one `setTimeout` chain, tracked repos synced sequentially,
 * the interval re-read after each tick. `manual` arms nothing. Ticks never overlap.
 */
export function scheduler(deps: SchedulerDeps): Scheduler {
  const log = deps.log ?? ((m) => console.error(m))
  let timer: ReturnType<typeof setTimeout> | null = null
  let running = false

  const trackedIds = () => deps.store.repos.list().filter((r) => r.tracked).map((r) => r.id)

  const run = async (repoIds: number[]) => {
    running = true
    try {
      for (const id of repoIds) {
        await deps.syncRepo(id).catch((e: unknown) => log(`sync repo ${id}: ${e instanceof Error ? e.message : String(e)}`))
      }
    } finally {
      running = false
      arm()
    }
  }

  const arm = () => {
    if (timer) clearTimeout(timer)
    timer = null
    const interval = deps.store.settings.read().pollInterval
    if (interval === 'manual') return
    timer = setTimeout(() => {
      timer = null
      if (running) return arm()
      void run(trackedIds())
    }, interval * 60_000)
  }

  return {
    start: arm,
    reschedule: arm,
    runNow(repoId) {
      if (running) return 'busy'
      void run(repoId === undefined ? trackedIds() : [repoId])
      return 'started'
    },
  }
}
