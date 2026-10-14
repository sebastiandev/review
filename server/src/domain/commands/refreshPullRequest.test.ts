import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Store } from '../store.ts'
import { DraftStale, InvalidAnchors, NotFound } from '../errors.ts'
import { addDraftComment, editDraftComment } from './draftComments.ts'
import { submitReview } from './submitReview.ts'
import {
  fakeProvider,
  fakeWorktrees,
  fixedClock,
  GITHUB_REPO,
  memoryEvents,
  NOW,
  openTestStore,
  remotePr,
  SAMPLE_PATCH,
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
      { remoteId: 'c9', author: 'bob', path: 'src/a.py', line: 2, startLine: null, side: 'RIGHT', body: 'late remark', inReplyTo: null, createdAt: NOW, originalLine: null, originalCommitSha: null },
    ])

    const result = await refreshPullRequest(deps, { prId })

    expect(result).toMatchObject({ headMoved: false, worktreeDeferred: false })
    expect(provider.calls).toEqual(['get:1', 'comments:1', 'myReviews:1'])
    expect(store.comments.list(prId).map((c) => c.body)).toEqual(['late remark'])
    expect(events.ofType('pr.refreshed')).toEqual([{ type: 'pr.refreshed', prId, headMoved: false }])
  })

  it.each(['refresh', 'sync'] as const)('%s repairs a stale draft after submission already advanced the cached PR head', async (method) => {
    const comment = addDraftComment(deps, { prId, path: 'src/a.py', line: 2, startLine: null, side: 'RIGHT', body: 'keep this feedback', inReplyTo: null })
    provider.remote.set(1, remotePr({ number: 1, headSha: 'sha-b' }))
    const request = { prId, verdict: 'COMMENT' as const, body: '', confirmApprove: false }
    await expect(submitReview(deps, request)).rejects.toBeInstanceOf(DraftStale)

    if (method === 'refresh') await refreshPullRequest(deps, { prId })
    else await syncRepo({ ...deps, worktrees }, { repoId: store.pullRequests.get(prId)!.repoId })

    const carried = store.drafts.getComment(comment.id)!
    expect(carried).toMatchObject({ body: comment.body, anchorValid: true, selected: comment.selected })
    expect(store.drafts.open(prId, 'sha-b')?.id).toBe(carried.draftId)
    await expect(submitReview(deps, request)).resolves.toMatchObject({ headSha: 'sha-b' })
    expect(provider.submitted[0]!.payload.comments[0]!.body).toBe(comment.body)
  })

  it('preserves but blocks a comment when its file changed at the same line numbers', async () => {
    const comment = addDraftComment(deps, { prId, path: 'src/a.py', line: 2, startLine: null, side: 'RIGHT', body: 'original feedback', inReplyTo: null })
    provider.remote.set(1, remotePr({ number: 1, headSha: 'sha-b' }))
    provider.patches.set(1, SAMPLE_PATCH.replace('+new', '+different'))
    await refreshPullRequest(deps, { prId })

    expect(store.drafts.getComment(comment.id)).toMatchObject({ body: comment.body, anchorValid: false })
    await expect(submitReview(deps, { prId, verdict: 'COMMENT', body: 'feedback', confirmApprove: false })).rejects.toBeInstanceOf(InvalidAnchors)
    expect(provider.submitted).toEqual([])
  })

  it('merges older pending comments into an existing current-head draft and keeps them editable', async () => {
    const anchor = { prId, path: 'src/a.py', line: 2, startLine: null, side: 'RIGHT' as const, inReplyTo: null }
    const older = addDraftComment(deps, { ...anchor, body: 'old feedback' })
    provider.remote.set(1, remotePr({ number: 1, headSha: 'sha-b' }))
    store.transaction(() => store.pullRequests.upsert(store.pullRequests.get(prId)!.repoId, remotePr({ number: 1, headSha: 'sha-b' }), {}, NOW))
    const newer = addDraftComment(deps, { ...anchor, body: 'new feedback' })

    await refreshPullRequest(deps, { prId })

    expect(store.drafts.listOpen(prId).map((draft) => draft.id)).toEqual([newer.draftId])
    expect(store.drafts.comments(newer.draftId).map((comment) => comment.id)).toEqual([older.id, newer.id])
    expect(editDraftComment(deps, { prId, commentId: older.id, body: 'edited feedback' }).body).toBe('edited feedback')
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

  it('carries viewed marks to the new head for files whose change did not move', async () => {
    store.transaction(() => {
      store.viewed.set(prId, 'src/a.py', 'sha-a')
      store.viewed.set(prId, 'src/b.py', 'sha-a')
    })
    // b.py's change grew; a.py's is byte-identical.
    provider.patches.set(1, `${SAMPLE_PATCH}diff --git a/src/b.py b/src/b.py\n--- a/src/b.py\n+++ b/src/b.py\n@@ -1,1 +1,2 @@\n one\n+two\n`)
    provider.remote.set(1, remotePr({ number: 1, headSha: 'sha-b' }))

    await refreshPullRequest(deps, { prId })

    const atNewHead = store.viewed
      .list(prId)
      .filter((m) => m.headSha === 'sha-b')
      .map((m) => m.path)
    expect(atNewHead).toEqual(['src/a.py'])
  })

  it('defers the checkout while an agent review is running in the worktree', async () => {
    const path = '/wt/acme/widgets/1'
    worktrees.paths.add(path)
    worktrees.heads.set(path, 'sha-a')
    store.transaction(() => store.pullRequests.update(prId, { worktreePath: path }))
    const run = store.agentReviews.insert({ prId, headSha: 'sha-a', agent: 'pr-reviewer', model: null, variant: null })
    store.agentReviews.update(run.id, { status: 'running' })
    provider.remote.set(1, remotePr({ number: 1, headSha: 'sha-b' }))

    const result = await refreshPullRequest(deps, { prId })

    expect(result).toMatchObject({ headMoved: true, worktreeDeferred: true })
    expect(store.diffs.get(prId, 'sha-b')).not.toBeNull()
    expect(worktrees.checkedOut).toEqual([])
    expect(worktrees.heads.get(path)).toBe('sha-a')
    store.transaction(() => store.agentReviews.update(run.id, { status: 'ready' }))
    const retried = await refreshPullRequest(deps, { prId })
    expect(retried).toMatchObject({ headMoved: false, worktreeDeferred: false })
    expect(worktrees.heads.get(path)).toBe('sha-b')
  })

  it('repairs a worktree after sync already advanced the cached head', async () => {
    const path = '/wt/acme/widgets/1'
    worktrees.paths.add(path)
    worktrees.heads.set(path, 'sha-a')
    store.transaction(() => store.pullRequests.update(prId, { worktreePath: path }))
    provider.remote.set(1, remotePr({ number: 1, headSha: 'sha-b' }))
    await syncRepo({ ...deps, worktrees }, { repoId: store.pullRequests.get(prId)!.repoId })

    const result = await refreshPullRequest(deps, { prId })

    expect(result).toMatchObject({ headMoved: false, worktreeDeferred: false })
    expect(worktrees.heads.get(path)).toBe('sha-b')
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
