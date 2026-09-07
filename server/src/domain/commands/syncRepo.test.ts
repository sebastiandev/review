import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Store } from '../store.ts'
import { NotFound } from '../errors.ts'
import {
  fakeProvider,
  fakeWorktrees,
  fixedClock,
  GITHUB_REPO,
  memoryEvents,
  NOW,
  openTestStore,
  remotePr,
  type FakeProvider,
  type FakeWorktrees,
  type MemoryEvents,
} from '../testing/fakes.ts'
import { syncRepo, type SyncRepoDeps } from './syncRepo.ts'

describe('syncRepo', () => {
  let store: Store
  let close: () => Promise<void>
  let provider: FakeProvider
  let worktrees: FakeWorktrees
  let events: MemoryEvents
  let deps: SyncRepoDeps
  let repoId: number

  beforeEach(async () => {
    ;({ store, close } = await openTestStore())
    provider = fakeProvider()
    worktrees = fakeWorktrees()
    events = memoryEvents()
    deps = { store, providers: { github: provider, gitlab: provider }, worktrees, events, clock: fixedClock() }
    repoId = store.repos.insert({ ...GITHUB_REPO, tracked: true, autoReview: false, syncedAt: null, syncError: null }).id
  })
  afterEach(() => close())

  it('stores review-requested PRs with diff and comments, skips the others', async () => {
    provider.remote.set(1, remotePr({ number: 1, body: 'Spec: docs/spec.md' }))
    provider.remote.set(2, remotePr({ number: 2, reviewRequested: false }))
    provider.remoteComments.set(1, [
      { remoteId: 'c1', author: 'bob', path: 'src/a.py', line: 2, startLine: null, side: 'RIGHT', body: 'why', inReplyTo: null, createdAt: NOW },
    ])

    const result = await syncRepo(deps, { repoId })

    expect(result).toEqual({ added: 1, updated: 0, released: 0 })
    const prs = store.pullRequests.listByRepo(repoId, {})
    expect(prs.map((p) => p.number)).toEqual([1])
    expect(prs[0]).toMatchObject({ specRef: 'docs/spec.md', reviewRequested: true, addedByUser: false, syncedAt: NOW })
    expect(store.diffs.get(prs[0].id, prs[0].headSha)?.anchors).toEqual({ 'src/a.py': [1, 2, 3] })
    expect(store.comments.list(prs[0].id).map((c) => c.remoteId)).toEqual(['c1'])
    expect(store.repos.get(repoId)).toMatchObject({ syncedAt: NOW, syncError: null })
    expect(events.events.map((e) => e.type)).toEqual(['sync.started', 'sync.finished'])
  })

  it('does not refetch diff or comments when the head is unchanged', async () => {
    provider.remote.set(1, remotePr({ number: 1 }))
    await syncRepo(deps, { repoId })
    provider.calls.length = 0

    const result = await syncRepo(deps, { repoId })

    expect(result).toEqual({ added: 0, updated: 1, released: 0 })
    expect(provider.calls).toEqual(['listReviewRequested'])
  })

  it('caches a new diff when the head moved, keeping the old one', async () => {
    provider.remote.set(1, remotePr({ number: 1, headSha: 'sha-a' }))
    await syncRepo(deps, { repoId })
    provider.remote.set(1, remotePr({ number: 1, headSha: 'sha-b' }))
    provider.calls.length = 0

    await syncRepo(deps, { repoId })

    const pr = store.pullRequests.find(repoId, 1)!
    expect(pr.headSha).toBe('sha-b')
    expect(provider.calls).toEqual(['listReviewRequested', 'diff:1', 'comments:1'])
    expect(store.diffs.get(pr.id, 'sha-a')).not.toBeNull()
    expect(store.diffs.get(pr.id, 'sha-b')).not.toBeNull()
  })

  it('refreshes a locally open PR missing from the list and releases its worktree once merged', async () => {
    provider.remote.set(1, remotePr({ number: 1 }))
    await syncRepo(deps, { repoId })
    const pr = store.pullRequests.find(repoId, 1)!
    worktrees.paths.add('/wt/1')
    store.transaction(() => store.pullRequests.update(pr.id, { worktreePath: '/wt/1' }))
    provider.remote.set(1, remotePr({ number: 1, state: 'merged' }))

    const result = await syncRepo(deps, { repoId })

    expect(result.released).toBe(1)
    expect(provider.calls).toContain('get:1')
    expect(store.pullRequests.get(pr.id)).toMatchObject({ state: 'merged', worktreePath: null })
    expect(worktrees.removed).toEqual(['/wt/1'])
    expect(events.ofType('worktree.removed')).toEqual([{ type: 'worktree.removed', prId: pr.id }])
  })

  it('refreshes a manually added PR and preserves its local fields', async () => {
    store.transaction(() =>
      store.pullRequests.upsert(repoId, remotePr({ number: 9, reviewRequested: false, title: 'old' }), { addedByUser: true, reviewOnOpen: true }, NOW),
    )
    provider.remote.set(9, remotePr({ number: 9, reviewRequested: false, title: 'new title' }))

    await syncRepo(deps, { repoId })

    expect(store.pullRequests.find(repoId, 9)).toMatchObject({ title: 'new title', addedByUser: true, reviewOnOpen: true })
  })

  it('records the provider error on the repo and rethrows', async () => {
    provider.listReviewRequested = async () => {
      throw new Error('rate limited')
    }

    await expect(syncRepo(deps, { repoId })).rejects.toThrow('rate limited')

    expect(store.repos.get(repoId)).toMatchObject({ syncedAt: null, syncError: 'rate limited' })
    expect(events.events.map((e) => e.type)).toEqual(['sync.started', 'sync.failed'])
  })

  it('throws NotFound for an unknown repo', async () => {
    await expect(syncRepo(deps, { repoId: 404 })).rejects.toBeInstanceOf(NotFound)
  })
})
