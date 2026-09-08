import type { AgentReview } from '@review/shared'
import type { Clock, Events } from '../ports.ts'
import type { Store } from '../store.ts'

export type RecoverInterruptedReviewsDeps = {
  store: Pick<Store, 'transaction' | 'agentReviews'>
  events: Events
  clock: Clock
}

export const INTERRUPTED_MESSAGE = 'interrupted by a server restart; run it again'

/**
 * Called once at startup. Agent runs live in memory, so any row still `queued` or `running`
 * belongs to a process that is gone.
 * Post-conditions:
 * - each such row is `failed` with `INTERRUPTED_MESSAGE` and a `finishedAt`; `review.failed` emitted
 */
export function recoverInterruptedReviews(deps: RecoverInterruptedReviewsDeps): AgentReview[] {
  const { store } = deps
  const orphans = store.agentReviews.listActive()
  if (orphans.length === 0) return []
  const now = deps.clock()
  store.transaction(() => {
    for (const run of orphans) store.agentReviews.update(run.id, { status: 'failed', error: INTERRUPTED_MESSAGE, finishedAt: now })
  })
  for (const run of orphans) deps.events.emit({ type: 'review.failed', prId: run.prId, agentReviewId: run.id, message: INTERRUPTED_MESSAGE })
  return orphans
}
