import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Store } from '../store.ts'
import { fixedClock, GITHUB_REPO, memoryEvents, NOW, openTestStore, remotePr } from '../testing/fakes.ts'
import { INTERRUPTED_MESSAGE, recoverInterruptedReviews } from './recoverInterruptedReviews.ts'

describe('recoverInterruptedReviews', () => {
  let store: Store
  let close: () => Promise<void>
  beforeEach(async () => {
    ;({ store, close } = await openTestStore())
  })
  afterEach(() => close())

  it('fails queued and running runs, leaves finished ones alone', () => {
    const repo = store.repos.insert({ ...GITHUB_REPO, tracked: true, autoReview: false, syncedAt: null, syncError: null })
    const pr = store.pullRequests.upsert(repo.id, remotePr({ number: 1 }), {}, NOW)
    const base = { prId: pr.id, headSha: pr.headSha, agent: 'pr-reviewer', model: null, variant: null }
    const queued = store.agentReviews.insert(base)
    const running = store.agentReviews.insert(base)
    store.agentReviews.update(running.id, { status: 'running' })
    const ready = store.agentReviews.insert(base)
    store.agentReviews.update(ready.id, { status: 'ready', verdict: 'COMMENT' })
    const events = memoryEvents()

    const recovered = recoverInterruptedReviews({ store, events, clock: fixedClock() })

    expect(recovered.map((r) => r.id)).toEqual([queued.id, running.id])
    expect(store.agentReviews.get(queued.id)).toMatchObject({ status: 'failed', error: INTERRUPTED_MESSAGE, finishedAt: NOW })
    expect(store.agentReviews.get(running.id)).toMatchObject({ status: 'failed', error: INTERRUPTED_MESSAGE })
    expect(store.agentReviews.get(ready.id)).toMatchObject({ status: 'ready' })
    expect(events.ofType('review.failed').map((e) => e.agentReviewId)).toEqual([queued.id, running.id])
  })

  it('is a no-op when nothing was running', () => {
    const events = memoryEvents()
    expect(recoverInterruptedReviews({ store, events, clock: fixedClock() })).toEqual([])
    expect(events.events).toEqual([])
  })
})
