import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Store } from '../store.ts'
import { fakeWorktrees, GITHUB_REPO, memoryEvents, NOW, openTestStore, remotePr } from '../testing/fakes.ts'
import { removeWorktrees } from './removeWorktrees.ts'

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
