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
import { refreshPullRequest, type RefreshPullRequestDeps } from './refreshPullRequest.ts'
import { syncRepo } from './syncRepo.ts'

describe('refreshPullRequest', () => {
  let store: Store
  let close: () => Promise<void>
  let provider: FakeProvider
  let worktrees: FakeWorktrees
  let events: MemoryEvents
  let deps: RefreshPullRequestDeps
  let prId: number

  beforeEach(async () => {
    ;({ store, close } = await openTestStore())
    provider = fakeProvider([remotePr({ number: 1, headSha: 'sha-a' })])
    worktrees = fakeWorktrees()
    events = memoryEvents()
    deps = { store, providers: { github: provider, gitlab: provider }, worktrees, events, clock: fixedClock() }
    const repoId = store.repos.insert({ ...GITHUB_REPO, tracked: true, autoReview: false, syncedAt: null, syncError: null }).id
    await syncRepo({ ...deps, worktrees }, { repoId })
    prId = store.pullRequests.listByRepo(repoId, {})[0]!.id
    provider.calls.length = 0
  })
  afterEach(() => close())

  it('replaces comments and keeps the diff when the head is unchanged', async () => {
    provider.remoteComments.set(1, [
      { remoteId: 'c9', author: 'bob', path: 'src/a.py', line: 2, startLine: null, side: 'RIGHT', body: 'late remark', inReplyTo: null, createdAt: NOW },
    ])

    const result = await refreshPullRequest(deps, { prId })

    expect(result.headMoved).toBe(false)
    expect(provider.calls).toEqual(['get:1', 'comments:1'])
    expect(store.comments.list(prId).map((c) => c.body)).toEqual(['late remark'])
    expect(events.ofType('pr.refreshed')).toEqual([{ type: 'pr.refreshed', prId, headMoved: false }])
  })

  it('caches the new diff and moves the worktree when the head moved', async () => {
    const path = '/wt/acme/widgets/1'
    worktrees.paths.add(path)
    worktrees.heads.set(path, 'sha-a')
    store.transaction(() => store.pullRequests.update(prId, { worktreePath: path }))
    provider.remote.set(1, remotePr({ number: 1, headSha: 'sha-b', title: 'renamed' }))

    const result = await refreshPullRequest(deps, { prId })

    expect(result).toMatchObject({ headMoved: true, pr: { headSha: 'sha-b', title: 'renamed' } })
    expect(store.diffs.get(prId, 'sha-b')).not.toBeNull()
    expect(worktrees.checkedOut).toEqual([{ path, headSha: 'sha-b' }])
    expect(events.ofType('worktree.ready')).toEqual([{ type: 'worktree.ready', prId, path }])
  })

  it('leaves the worktree alone when the head moved but none is on disk', async () => {
    provider.remote.set(1, remotePr({ number: 1, headSha: 'sha-b' }))
    await refreshPullRequest(deps, { prId })
    expect(worktrees.checkedOut).toEqual([])
  })

  it('reports a PR that vanished remotely', async () => {
    provider.remote.delete(1)
    await expect(refreshPullRequest(deps, { prId })).rejects.toBeInstanceOf(NotFound)
  })
})
