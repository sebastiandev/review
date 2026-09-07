import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NotFound } from '../errors.ts'
import type { PullRequest } from '../pullRequests.ts'
import type { Store } from '../store.ts'
import { fakeWorktrees, fixedClock, GITHUB_REPO, memoryEvents, NOW, openTestStore, remotePr, type FakeWorktrees, type MemoryEvents } from '../testing/fakes.ts'
import { markDone, reopenPullRequest, type MarkDoneDeps } from './markDone.ts'

describe('markDone / reopenPullRequest', () => {
  let store: Store
  let close: () => Promise<void>
  let worktrees: FakeWorktrees
  let events: MemoryEvents
  let deps: MarkDoneDeps
  let pr: PullRequest

  beforeEach(async () => {
    ;({ store, close } = await openTestStore())
    worktrees = fakeWorktrees()
    events = memoryEvents()
    deps = { store, worktrees, events, clock: fixedClock() }
    const repo = store.repos.insert({ ...GITHUB_REPO, tracked: true, autoReview: false, syncedAt: null, syncError: null })
    pr = store.pullRequests.upsert(repo.id, remotePr(), {}, NOW)
  })
  afterEach(() => close())

  it('sets doneAt and releases the worktree', async () => {
    worktrees.paths.add('/wt/1')
    store.transaction(() => store.pullRequests.update(pr.id, { worktreePath: '/wt/1' }))

    await markDone(deps, { prId: pr.id })

    expect(store.pullRequests.get(pr.id)).toMatchObject({ doneAt: NOW, worktreePath: null })
    expect(worktrees.removed).toEqual(['/wt/1'])
    expect(events.events).toEqual([{ type: 'worktree.removed', prId: pr.id }])
  })

  it('without a worktree only sets doneAt and emits nothing', async () => {
    await markDone(deps, { prId: pr.id })
    expect(store.pullRequests.get(pr.id)?.doneAt).toBe(NOW)
    expect(events.events).toEqual([])
  })

  it('reopen clears doneAt', async () => {
    await markDone(deps, { prId: pr.id })
    reopenPullRequest(deps, { prId: pr.id })
    expect(store.pullRequests.get(pr.id)?.doneAt).toBeNull()
  })

  it('both throw NotFound for an unknown PR', async () => {
    await expect(markDone(deps, { prId: 77 })).rejects.toBeInstanceOf(NotFound)
    expect(() => reopenPullRequest(deps, { prId: 77 })).toThrow(NotFound)
  })
})
