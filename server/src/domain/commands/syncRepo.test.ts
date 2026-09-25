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
      { remoteId: 'c1', author: 'bob', path: 'src/a.py', line: 2, startLine: null, side: 'RIGHT', body: 'why', inReplyTo: null, createdAt: NOW, originalLine: null, originalCommitSha: null },
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

  it('only fetches review-requested PRs updated within settings.lookbackDays', async () => {
    store.settings.write({ ...store.settings.read(), lookbackDays: 7 })
    provider.remote.set(1, remotePr({ number: 1, updatedAt: '2026-09-01T00:00:00.000Z' }))
    provider.remote.set(2, remotePr({ number: 2, updatedAt: '2026-08-01T00:00:00.000Z' }))

    await syncRepo(deps, { repoId })

    expect(store.pullRequests.listByRepo(repoId, {}).map((p) => p.number)).toEqual([1])
  })

  it('discovers a mentioned PR without marking it review-requested or manually added', async () => {
    provider.remote.set(2, remotePr({ number: 2, reviewRequested: false }))
    provider.mentioned.add(2)
    await syncRepo(deps, { repoId })
    expect(store.pullRequests.listByRepo(repoId, {})).toEqual([
      expect.objectContaining({ number: 2, reviewRequested: false, addedByUser: false }),
    ])
  })

  it('deduplicates a PR discovered through both review requests and mentions', async () => {
    provider.remote.set(1, remotePr({ number: 1, reviewRequested: true }))
    provider.mentioned.add(1)
    const result = await syncRepo(deps, { repoId })
    expect(result.added).toBe(1)
    expect(store.pullRequests.listByRepo(repoId, {})).toEqual([
      expect.objectContaining({ number: 1, reviewRequested: true }),
    ])
    expect(provider.calls.filter((call) => call === 'diff:1')).toHaveLength(1)
  })

  it.each([
    { state: 'closed' as const },
    { updatedAt: '2020-01-01T00:00:00Z' },
  ])('does not discover mentions outside the open/recent window: %j', async (overrides) => {
    provider.remote.set(2, remotePr({ number: 2, reviewRequested: false, ...overrides }))
    provider.mentioned.add(2)
    await syncRepo(deps, { repoId })
    expect(store.pullRequests.listByRepo(repoId, {})).toEqual([])
  })

  it('keeps the diff but refreshes comments when the head is unchanged', async () => {
    provider.remote.set(1, remotePr({ number: 1 }))
    await syncRepo(deps, { repoId })
    provider.calls.length = 0
    provider.remoteComments.set(1, [{ remoteId: 'c9', author: 'bob', path: 'src/a.py', line: 2, startLine: null, side: 'RIGHT', body: 'late remark', inReplyTo: null, createdAt: NOW, originalLine: null, originalCommitSha: null }])

    const result = await syncRepo(deps, { repoId })

    expect(result).toEqual({ added: 0, updated: 1, released: 0 })
    expect(provider.calls).toEqual(['listReviewRequested', 'listMentioned', 'comments:1', 'myReviews:1'])
    const [pr] = store.pullRequests.listByRepo(repoId, {})
    expect(store.comments.list(pr!.id).map((c) => c.body)).toEqual(['late remark'])
  })

  it('records reviews I submitted on GitHub and marks the head viewed when they target it', async () => {
    provider.remote.set(1, remotePr({ number: 1, headSha: 'sha-a' }))
    provider.reviews.set(1, [
      { remoteId: 'gh-1', verdict: 'COMMENT', headSha: 'sha-old', body: 'earlier', submittedAt: '2026-09-01T00:00:00.000Z' },
      { remoteId: 'gh-2', verdict: 'APPROVE', headSha: 'sha-a', body: 'LGTM', submittedAt: NOW },
    ])

    await syncRepo(deps, { repoId })
    await syncRepo(deps, { repoId })

    const pr = store.pullRequests.find(repoId, 1)!
    expect(store.submissions.remoteIds(pr.id)).toEqual(new Set(['gh-1', 'gh-2']))
    expect(store.views.inbox(repoId)[0]).toMatchObject({ submittedVerdict: 'APPROVE' })
    expect(store.viewed.list(pr.id)).toEqual([{ path: 'src/a.py', headSha: 'sha-a' }])
    expect(store.views.pastReviews(null).map((r) => r.verdict)).toEqual(['APPROVE', 'COMMENT'])
  })

  it('keeps checking conversations of locally done PRs for late replies', async () => {
    provider.remote.set(1, remotePr({ number: 1 }))
    await syncRepo(deps, { repoId })
    const [pr] = store.pullRequests.listByRepo(repoId, {})
    store.transaction(() => store.pullRequests.update(pr!.id, { doneAt: NOW }))
    provider.calls.length = 0

    await syncRepo(deps, { repoId })

    expect(provider.calls).toEqual(['listReviewRequested', 'listMentioned', 'comments:1', 'myReviews:1'])
  })

  it('caches a new diff when the head moved, keeping the old one', async () => {
    provider.remote.set(1, remotePr({ number: 1, headSha: 'sha-a' }))
    await syncRepo(deps, { repoId })
    provider.remote.set(1, remotePr({ number: 1, headSha: 'sha-b' }))
    provider.calls.length = 0

    await syncRepo(deps, { repoId })

    const pr = store.pullRequests.find(repoId, 1)!
    expect(pr.headSha).toBe('sha-b')
    expect(provider.calls).toEqual(['listReviewRequested', 'listMentioned', 'diff:1', 'comments:1', 'myReviews:1'])
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

  it('keeps the worktree of a merged PR while an agent review is running in it', async () => {
    provider.remote.set(1, remotePr({ number: 1 }))
    await syncRepo(deps, { repoId })
    const pr = store.pullRequests.find(repoId, 1)!
    worktrees.paths.add('/wt/1')
    store.transaction(() => store.pullRequests.update(pr.id, { worktreePath: '/wt/1' }))
    const run = store.agentReviews.insert({ prId: pr.id, headSha: pr.headSha, agent: 'pr-reviewer', model: null, variant: null })
    store.agentReviews.update(run.id, { status: 'running' })
    provider.remote.set(1, remotePr({ number: 1, state: 'merged' }))

    const result = await syncRepo(deps, { repoId })

    expect(result.released).toBe(0)
    expect(store.pullRequests.get(pr.id)).toMatchObject({ state: 'merged', worktreePath: '/wt/1' })
    expect(worktrees.removed).toEqual([])
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
