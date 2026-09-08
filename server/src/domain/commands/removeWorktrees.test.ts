import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Store } from '../store.ts'
import { fakeWorktrees, GITHUB_REPO, memoryEvents, NOW, openTestStore, remotePr } from '../testing/fakes.ts'
import { removeMergedWorktrees, removeWorktrees } from './removeWorktrees.ts'

describe('removeWorktrees', () => {
  let store: Store
  let close: () => Promise<void>
  beforeEach(async () => {
    ;({ store, close } = await openTestStore())
  })
  afterEach(() => close())

  it('removes the worktrees that exist, skipping PRs without one and unknown ids', async () => {
    const worktrees = fakeWorktrees()
    const events = memoryEvents()
    const repo = store.repos.insert({ ...GITHUB_REPO, tracked: true, autoReview: false, syncedAt: null, syncError: null })
    const withTree = store.pullRequests.upsert(repo.id, remotePr({ number: 1 }), {}, NOW)
    const bare = store.pullRequests.upsert(repo.id, remotePr({ number: 2 }), {}, NOW)
    store.pullRequests.update(withTree.id, { worktreePath: '/wt/1' })
    worktrees.paths.add('/wt/1')

    const removed = await removeWorktrees({ store, worktrees, events }, { prIds: [withTree.id, bare.id, 999] })

    expect(removed).toEqual([withTree.id])
    expect(worktrees.removed).toEqual(['/wt/1'])
    expect(store.pullRequests.get(withTree.id)?.worktreePath).toBeNull()
    expect(events.events).toEqual([{ type: 'worktree.removed', prId: withTree.id }])
  })
})

describe('removeWorktrees with an active review', () => {
  let store: Store
  let close: () => Promise<void>
  beforeEach(async () => {
    ;({ store, close } = await openTestStore())
  })
  afterEach(() => close())

  it('skips a PR whose agent review is queued or running', async () => {
    const worktrees = fakeWorktrees()
    const events = memoryEvents()
    const repo = store.repos.insert({ ...GITHUB_REPO, tracked: true, autoReview: false, syncedAt: null, syncError: null })
    const pr = store.pullRequests.upsert(repo.id, remotePr({ number: 1 }), {}, NOW)
    store.pullRequests.update(pr.id, { worktreePath: '/wt/1' })
    worktrees.paths.add('/wt/1')
    store.agentReviews.insert({ prId: pr.id, headSha: pr.headSha, agent: 'pr-reviewer', model: null, variant: null })

    const removed = await removeWorktrees({ store, worktrees, events }, { prIds: [pr.id] })

    expect(removed).toEqual([])
    expect(worktrees.removed).toEqual([])
    expect(store.pullRequests.get(pr.id)?.worktreePath).toBe('/wt/1')
  })
})

describe('removeMergedWorktrees', () => {
  let store: Store
  let close: () => Promise<void>
  beforeEach(async () => {
    ;({ store, close } = await openTestStore())
  })
  afterEach(() => close())

  it('removes worktrees of merged and closed PRs only, across repos', async () => {
    const worktrees = fakeWorktrees()
    const events = memoryEvents()
    const repoA = store.repos.insert({ ...GITHUB_REPO, tracked: true, autoReview: false, syncedAt: null, syncError: null })
    const repoB = store.repos.insert({ ...GITHUB_REPO, name: 'gadgets', tracked: true, autoReview: false, syncedAt: null, syncError: null })
    const merged = store.pullRequests.upsert(repoA.id, remotePr({ number: 1, state: 'merged' }), {}, NOW)
    const closed = store.pullRequests.upsert(repoB.id, remotePr({ number: 2, state: 'closed' }), {}, NOW)
    const open = store.pullRequests.upsert(repoA.id, remotePr({ number: 3 }), {}, NOW)
    for (const pr of [merged, closed, open]) {
      store.pullRequests.update(pr.id, { worktreePath: `/wt/${pr.id}` })
      worktrees.paths.add(`/wt/${pr.id}`)
    }

    const removed = await removeMergedWorktrees({ store, worktrees, events })

    expect(removed.sort()).toEqual([merged.id, closed.id].sort())
    expect(worktrees.paths).toEqual(new Set([`/wt/${open.id}`]))
    expect(store.pullRequests.get(open.id)?.worktreePath).toBe(`/wt/${open.id}`)
    expect(events.ofType('worktree.removed').map((e) => e.prId).sort()).toEqual([merged.id, closed.id].sort())
  })

  it('returns nothing when no finished PR holds a worktree', async () => {
    const repo = store.repos.insert({ ...GITHUB_REPO, tracked: true, autoReview: false, syncedAt: null, syncError: null })
    const open = store.pullRequests.upsert(repo.id, remotePr({ number: 3 }), {}, NOW)
    store.pullRequests.update(open.id, { worktreePath: '/wt/open' })
    const worktrees = fakeWorktrees()

    expect(await removeMergedWorktrees({ store, worktrees, events: memoryEvents() })).toEqual([])
    expect(worktrees.removed).toEqual([])
  })
})
