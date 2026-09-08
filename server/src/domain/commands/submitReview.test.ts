import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cachePrDiff } from '../actions/cachePrDiff.ts'
import { ApproveNotConfirmed, DraftStale, InvalidAnchors, NotFound, PullRequestClosed } from '../errors.ts'
import type { PullRequest, Repo } from '../pullRequests.ts'
import type { Store } from '../store.ts'
import { fakeProvider, fixedClock, GITHUB_REPO, memoryEvents, NOW, openTestStore, remotePr, SAMPLE_PATCH, type FakeProvider, type MemoryEvents } from '../testing/fakes.ts'
import { addDraftComment } from './draftComments.ts'
import { submitReview, type SubmitReviewDeps } from './submitReview.ts'

describe('submitReview', () => {
  let store: Store
  let close: () => Promise<void>
  let provider: FakeProvider
  let events: MemoryEvents
  let deps: SubmitReviewDeps
  let repo: Repo
  let pr: PullRequest
  const anchor = { path: 'src/a.py', line: 2, startLine: null, side: 'RIGHT' as const, inReplyTo: null }
  const request = { verdict: 'COMMENT' as const, body: 'Some thoughts.', confirmApprove: false }

  beforeEach(async () => {
    ;({ store, close } = await openTestStore())
    provider = fakeProvider([remotePr({ number: 415 })])
    events = memoryEvents()
    deps = { store, providers: { github: provider, gitlab: provider }, events, clock: fixedClock() }
    repo = store.repos.insert({ ...GITHUB_REPO, tracked: true, autoReview: false, syncedAt: null, syncError: null })
    pr = store.pullRequests.upsert(repo.id, remotePr({ number: 415 }), {}, NOW)
    store.transaction(() => cachePrDiff(store.diffs, repo, pr, SAMPLE_PATCH, NOW))
  })
  afterEach(() => close())

  const draftDeps = () => ({ store, clock: fixedClock() })

  it('sends the selected comments merged per line, records the submission and closes the draft', async () => {
    addDraftComment(draftDeps(), { prId: pr.id, ...anchor, body: 'first' })
    addDraftComment(draftDeps(), { prId: pr.id, ...anchor, body: 'second' })
    const skipped = addDraftComment(draftDeps(), { prId: pr.id, ...anchor, line: 3, body: 'not this one' })
    store.transaction(() => store.drafts.updateComment(skipped.id, { selected: false }, NOW))

    const submission = await submitReview(deps, { prId: pr.id, ...request })

    expect(provider.submitted).toEqual([
      {
        repo,
        number: 415,
        payload: {
          verdict: 'COMMENT',
          body: 'Some thoughts.',
          comments: [{ path: 'src/a.py', line: 2, startLine: null, side: 'RIGHT', body: 'first\n\nsecond', inReplyTo: null }],
        },
      },
    ])
    expect(submission).toMatchObject({ remoteReviewId: 'review-1', verdict: 'COMMENT', agentVerdict: null, submittedAt: NOW })
    expect(store.drafts.open(pr.id, pr.headSha)).toBeNull()
    expect(store.views.pastReviews(null)).toMatchObject([{ submissionId: submission.id, agentAgreement: 'not run' }])
    expect(events.events).toEqual([{ type: 'review.submitted', prId: pr.id, verdict: 'COMMENT', remoteReviewId: 'review-1' }])
  })

  it('marks every file of the head viewed once submitted', async () => {
    await submitReview(deps, { prId: pr.id, ...request })
    expect(store.viewed.list(pr.id)).toEqual([{ path: 'src/a.py', headSha: pr.headSha }])
  })

  it('submits a body-only review when no draft exists yet', async () => {
    const submission = await submitReview(deps, { prId: pr.id, verdict: 'APPROVE', body: 'LGTM', confirmApprove: true })
    expect(provider.submitted[0].payload.comments).toEqual([])
    expect(submission).toMatchObject({ prId: pr.id, headSha: pr.headSha, source: 'app' })
    expect(store.drafts.comments(submission.draftId!)).toEqual([])
    expect(store.drafts.latestOpen(pr.id)).toBeNull()
  })

  it('APPROVE without confirmation is refused before anything is sent', async () => {
    await expect(submitReview(deps, { prId: pr.id, verdict: 'APPROVE', body: '', confirmApprove: false })).rejects.toBeInstanceOf(ApproveNotConfirmed)
    expect(provider.submitted).toEqual([])
  })

  it('refuses a PR that was merged since the last sync and stores the new state', async () => {
    provider.remote.set(415, remotePr({ number: 415, state: 'merged' }))
    await expect(submitReview(deps, { prId: pr.id, ...request })).rejects.toBeInstanceOf(PullRequestClosed)
    expect(provider.submitted).toEqual([])
    expect(store.pullRequests.get(pr.id)).toMatchObject({ state: 'merged' })
    expect(events.ofType('pr.refreshed')).toEqual([{ type: 'pr.refreshed', prId: pr.id, headMoved: false }])
  })

  it('refuses when the head moved since the last sync and stores the new head', async () => {
    provider.remote.set(415, remotePr({ number: 415, headSha: 'sha-415-b' }))
    await expect(submitReview(deps, { prId: pr.id, ...request })).rejects.toBeInstanceOf(DraftStale)
    expect(provider.submitted).toEqual([])
    expect(store.pullRequests.get(pr.id)).toMatchObject({ headSha: 'sha-415-b' })
  })

  it('a draft for an older head is stale', async () => {
    addDraftComment(draftDeps(), { prId: pr.id, ...anchor, body: 'old head' })
    provider.remote.set(415, remotePr({ number: 415, headSha: 'sha-moved' }))
    store.transaction(() => store.pullRequests.upsert(repo.id, remotePr({ number: 415, headSha: 'sha-moved' }), {}, NOW))

    const error = await submitReview(deps, { prId: pr.id, ...request }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(DraftStale)
    expect(error).toMatchObject({ draftHeadSha: pr.headSha, currentHeadSha: 'sha-moved' })
    expect(provider.submitted).toEqual([])
  })

  it('flags unanchorable selected comments and throws InvalidAnchors with their ids', async () => {
    const ok = addDraftComment(draftDeps(), { prId: pr.id, ...anchor, body: 'fine' })
    const bad = addDraftComment(draftDeps(), { prId: pr.id, ...anchor, line: 99, body: 'floating' })
    store.transaction(() => store.drafts.updateComment(bad.id, { anchorValid: true }, NOW))

    const error = await submitReview(deps, { prId: pr.id, ...request }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(InvalidAnchors)
    expect((error as InvalidAnchors).ids).toEqual([bad.id])
    expect(store.drafts.getComment(bad.id)?.anchorValid).toBe(false)
    expect(store.drafts.getComment(ok.id)?.anchorValid).toBe(true)
    expect(provider.submitted).toEqual([])
    expect(store.drafts.open(pr.id, pr.headSha)).not.toBeNull()
  })

  it('a deselected unanchorable comment does not block submission', async () => {
    const bad = addDraftComment(draftDeps(), { prId: pr.id, ...anchor, line: 99, body: 'floating' })
    store.transaction(() => store.drafts.updateComment(bad.id, { selected: false }, NOW))
    await expect(submitReview(deps, { prId: pr.id, ...request })).resolves.toMatchObject({ verdict: 'COMMENT' })
  })

  it('a provider failure leaves the draft open and records nothing', async () => {
    addDraftComment(draftDeps(), { prId: pr.id, ...anchor, body: 'x' })
    provider.submitReview = async () => {
      throw new Error('502')
    }

    await expect(submitReview(deps, { prId: pr.id, ...request })).rejects.toThrow('502')

    expect(store.drafts.open(pr.id, pr.headSha)).not.toBeNull()
    expect(store.views.pastReviews(null)).toEqual([])
    expect(events.events).toEqual([])
  })

  it('throws NotFound for an unknown PR', async () => {
    await expect(submitReview(deps, { prId: 999, ...request })).rejects.toBeInstanceOf(NotFound)
  })
})
