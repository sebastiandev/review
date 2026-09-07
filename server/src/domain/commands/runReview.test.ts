import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cachePrDiff } from '../actions/cachePrDiff.ts'
import { InvalidPayload } from '../agentReview.ts'
import { DraftStale, NotFound, WorktreeMissing } from '../errors.ts'
import type { PullRequest, Repo } from '../pullRequests.ts'
import type { Store } from '../store.ts'
import {
  fakeProvider,
  fakeRunner,
  fixedClock,
  GITHUB_REPO,
  memoryEvents,
  memoryPayloads,
  NOW,
  openTestStore,
  remotePr,
  SAMPLE_PATCH,
  type FakeProvider,
  type FakeRunner,
  type MemoryEvents,
  type MemoryPayloads,
} from '../testing/fakes.ts'
import { dismissFinding, keepAllFindings, keepFinding } from './agentFindings.ts'
import { runReview, type RunReviewDeps } from './runReview.ts'
import { submitReview } from './submitReview.ts'

const PAYLOAD = JSON.stringify({
  pr: 415,
  repo: 'acme/widgets',
  event: 'REQUEST_CHANGES',
  body: 'Two problems.',
  comments: [
    { path: 'src/a.py', line: 2, side: 'RIGHT', body: 'Block: wrong helper' },
    { path: 'src/a.py', line: 3, side: 'RIGHT', body: 'Question: intended?' },
    { path: 'src/a.py', line: 40, side: 'RIGHT', body: 'not in the diff' },
  ],
})

describe('runReview', () => {
  let store: Store
  let close: () => Promise<void>
  let provider: FakeProvider
  let payloads: MemoryPayloads
  let runner: FakeRunner
  let events: MemoryEvents
  let existing: Set<string>
  let deps: RunReviewDeps
  let repo: Repo
  let pr: PullRequest
  const request = { agent: 'pr-reviewer', model: { providerID: 'anthropic', modelID: 'opus' }, variant: 'high' }

  beforeEach(async () => {
    ;({ store, close } = await openTestStore())
    provider = fakeProvider()
    payloads = memoryPayloads()
    runner = fakeRunner(payloads, { kind: 'write', text: PAYLOAD })
    events = memoryEvents()
    existing = new Set()
    deps = {
      store,
      providers: { github: provider, gitlab: provider },
      runner,
      payloads,
      fileExists: async (p) => existing.has(p),
      events,
      clock: fixedClock(),
    }
    repo = store.repos.insert({ ...GITHUB_REPO, tracked: true, autoReview: false, syncedAt: null, syncError: null })
    pr = store.pullRequests.upsert(repo.id, remotePr({ number: 415 }), {}, NOW)
    store.transaction(() => {
      cachePrDiff(store.diffs, repo, pr, SAMPLE_PATCH, NOW)
      store.pullRequests.update(pr.id, { worktreePath: '/wt/415' })
    })
    pr = store.pullRequests.get(pr.id)!
  })
  afterEach(() => close())

  it('records the run, its findings and the dropped anchors, emitting events in order', async () => {
    const { review, findings } = await runReview(deps, { prId: pr.id, ...request })

    expect(review).toMatchObject({
      prId: pr.id,
      headSha: pr.headSha,
      status: 'ready',
      agent: 'pr-reviewer',
      model: request.model,
      variant: 'high',
      sessionId: 'ses_fake',
      verdict: 'REQUEST_CHANGES',
      summary: 'Two problems.',
      error: null,
      invalidAnchorCount: 1,
      startedAt: NOW,
      finishedAt: NOW,
    })
    expect(findings).toMatchObject([
      { agentReviewId: review.id, path: 'src/a.py', line: 2, side: 'RIGHT', severity: 'block', body: 'Block: wrong helper' },
      { agentReviewId: review.id, line: 3, severity: 'question' },
    ])
    expect(store.agentReviews.listForPr(pr.id)).toEqual([{ review, findings }])
    expect(events.events).toEqual([
      { type: 'review.queued', prId: pr.id, agentReviewId: review.id },
      { type: 'review.running', prId: pr.id, agentReviewId: review.id },
      { type: 'review.ready', prId: pr.id, agentReviewId: review.id, verdict: 'REQUEST_CHANGES', findingCount: 2 },
    ])
  })

  it('runs the agent in the worktree with the requested agent, model and variant', async () => {
    await runReview(deps, { prId: pr.id, ...request })
    expect(runner.runs).toMatchObject([{ directory: '/wt/415', title: 'review acme/widgets#415', agent: 'pr-reviewer', model: request.model, variant: 'high' }])
    expect(runner.runs[0].prompt).toContain('Review PR 415 in repo acme/widgets in github mode.')
  })

  it('tells the agent about comments the viewer already left, not others', async () => {
    provider.viewer = 'seba'
    store.transaction(() =>
      store.comments.replace(
        pr.id,
        [
          { remoteId: 'c1', author: 'seba', path: 'src/a.py', line: 2, startLine: null, side: 'RIGHT', body: 'rename this', inReplyTo: null, createdAt: NOW },
          { remoteId: 'c2', author: 'bob', path: 'src/a.py', line: 3, startLine: null, side: 'RIGHT', body: 'lgtm', inReplyTo: null, createdAt: NOW },
        ],
        NOW,
      ),
    )
    await runReview(deps, { prId: pr.id, ...request })
    const prompt = runner.runs[0].prompt
    expect(prompt).toContain('- src/a.py:2: rename this')
    expect(prompt).not.toContain('lgtm')
  })

  it.each([
    ['exists in the worktree', true, 'The PR references a spec at /wt/415/docs/SPEC.md'],
    ['is missing from the worktree', false, null],
  ])('mentions the linked spec when it %s', async (_label, present, expected) => {
    pr = store.pullRequests.upsert(repo.id, remotePr({ number: 415 }), { specRef: 'docs/SPEC.md' }, NOW)
    if (present) existing.add('/wt/415/docs/SPEC.md')
    await runReview(deps, { prId: pr.id, ...request })
    const prompt = runner.runs[0].prompt
    if (expected) expect(prompt).toContain(expected)
    else expect(prompt).not.toContain('spec at')
  })

  it.each([
    ['the runner fails', { kind: 'fail', error: new Error('opencode down') } as const, 'opencode down'],
    ['the agent writes nothing', { kind: 'silent' } as const, /agent wrote nothing/],
    ['the payload is malformed', { kind: 'write', text: '{"event":"MAYBE"}' } as const, /event must be/],
  ])('marks the run failed and emits review.failed when %s', async (_label, behaviour, message) => {
    runner.behaviour = behaviour
    await expect(runReview(deps, { prId: pr.id, ...request })).rejects.toThrow(message)

    const [{ review, findings }] = store.agentReviews.listForPr(pr.id)
    expect(review).toMatchObject({ status: 'failed', finishedAt: NOW, verdict: null })
    expect(review.error).toMatch(message)
    expect(findings).toEqual([])
    expect(events.events.map((e) => e.type)).toEqual(['review.queued', 'review.running', 'review.failed'])
    expect(events.ofType('review.failed')[0]).toMatchObject({ prId: pr.id, agentReviewId: review.id })
  })

  it('a malformed payload is an InvalidPayload', async () => {
    runner.behaviour = { kind: 'write', text: 'nope' }
    await expect(runReview(deps, { prId: pr.id, ...request })).rejects.toBeInstanceOf(InvalidPayload)
  })

  it('gives up on a hanging agent after the timeout', async () => {
    runner.behaviour = { kind: 'hang' }
    await expect(runReview({ ...deps, timeoutMs: 20 }, { prId: pr.id, ...request })).rejects.toThrow(/did not finish/)
    expect(store.agentReviews.latest(pr.id, pr.headSha, null)).toMatchObject({ status: 'failed', sessionId: 'ses_fake' })
  })

  it('refuses a PR without a worktree and records nothing', async () => {
    const other = store.pullRequests.upsert(repo.id, remotePr({ number: 7 }), {}, NOW)
    store.transaction(() => cachePrDiff(store.diffs, repo, other, SAMPLE_PATCH, NOW))
    await expect(runReview(deps, { prId: other.id, ...request })).rejects.toBeInstanceOf(WorktreeMissing)
    expect(store.agentReviews.listForPr(other.id)).toEqual([])
    expect(runner.runs).toEqual([])
    expect(events.events).toEqual([])
  })

  it('refuses a PR whose head has no cached diff', async () => {
    store.transaction(() => store.pullRequests.upsert(repo.id, remotePr({ number: 415, headSha: 'sha-moved' }), {}, NOW))
    await expect(runReview(deps, { prId: pr.id, ...request })).rejects.toBeInstanceOf(NotFound)
    expect(store.agentReviews.listForPr(pr.id)).toEqual([])
  })

  it('throws NotFound for an unknown PR', async () => {
    await expect(runReview(deps, { prId: 999, ...request })).rejects.toBeInstanceOf(NotFound)
  })

  it('a second run on the same head is a second review with its own payload file', async () => {
    const first = await runReview(deps, { prId: pr.id, ...request })
    const second = await runReview(deps, { prId: pr.id, ...request, agent: 'reviewer' })
    expect(second.review.id).not.toBe(first.review.id)
    expect(store.agentReviews.listForPr(pr.id).map((r) => r.review.agent)).toEqual(['reviewer', 'pr-reviewer'])
    expect(payloads.pathFor(first.review)).not.toBe(payloads.pathFor(second.review))
    expect(store.views.inbox(repo.id)[0]).toMatchObject({ agentStatus: 'ready', agentVerdict: 'REQUEST_CHANGES' })
  })

  describe('keep and dismiss', () => {
    const findingDeps = () => ({ store, clock: fixedClock() })

    it('keepFinding copies the finding into the draft once', async () => {
      const { findings } = await runReview(deps, { prId: pr.id, ...request })
      const kept = keepFinding(findingDeps(), { prId: pr.id, findingId: findings[0].id })
      expect(kept).toMatchObject({
        path: 'src/a.py',
        line: 2,
        side: 'RIGHT',
        body: 'Block: wrong helper',
        agentBody: 'Block: wrong helper',
        origin: 'agent',
        selected: true,
        anchorValid: true,
        findingId: findings[0].id,
      })
      expect(keepFinding(findingDeps(), { prId: pr.id, findingId: findings[0].id })).toEqual(kept)
      expect(store.drafts.comments(kept.draftId)).toHaveLength(1)
      expect(store.views.inbox(repo.id)[0].draftCommentCount).toBe(1)
    })

    it('keepAllFindings keeps every finding, skipping ones already kept', async () => {
      const { review, findings } = await runReview(deps, { prId: pr.id, ...request })
      const first = keepFinding(findingDeps(), { prId: pr.id, findingId: findings[0].id })
      const all = keepAllFindings(findingDeps(), { prId: pr.id, agentReviewId: review.id })
      expect(all.map((c) => c.findingId)).toEqual(findings.map((f) => f.id))
      expect(all[0]).toEqual(first)
      expect(store.drafts.comments(first.draftId)).toHaveLength(2)
    })

    it('dismissFinding removes the kept comment and leaves the finding', async () => {
      const { review, findings } = await runReview(deps, { prId: pr.id, ...request })
      const kept = keepFinding(findingDeps(), { prId: pr.id, findingId: findings[0].id })
      dismissFinding(findingDeps(), { prId: pr.id, findingId: findings[0].id })
      dismissFinding(findingDeps(), { prId: pr.id, findingId: findings[1].id })
      expect(store.drafts.comments(kept.draftId)).toEqual([])
      expect(store.agentReviews.findings(review.id)).toEqual(findings)
    })

    it('refuses findings of another PR or of an older head', async () => {
      const { review, findings } = await runReview(deps, { prId: pr.id, ...request })
      const other = store.pullRequests.upsert(repo.id, remotePr({ number: 7 }), {}, NOW)
      expect(() => keepFinding(findingDeps(), { prId: other.id, findingId: findings[0].id })).toThrow(NotFound)
      expect(() => keepAllFindings(findingDeps(), { prId: other.id, agentReviewId: review.id })).toThrow(NotFound)

      store.transaction(() => store.pullRequests.upsert(repo.id, remotePr({ number: 415, headSha: 'sha-moved' }), {}, NOW))
      expect(() => keepFinding(findingDeps(), { prId: pr.id, findingId: findings[0].id })).toThrow(DraftStale)
      expect(() => keepAllFindings(findingDeps(), { prId: pr.id, agentReviewId: review.id })).toThrow(DraftStale)
    })
  })

  describe('submitReview', () => {
    const submitDeps = () => ({ store, providers: { github: provider, gitlab: provider }, events, clock: fixedClock() })

    it('records the verdict of the latest ready run, ignoring failed ones around it', async () => {
      runner.behaviour = { kind: 'fail', error: new Error('first attempt') }
      await runReview(deps, { prId: pr.id, ...request }).catch(() => {})
      runner.behaviour = { kind: 'write', text: PAYLOAD }
      await runReview(deps, { prId: pr.id, ...request })
      runner.behaviour = { kind: 'fail', error: new Error('later attempt') }
      await runReview(deps, { prId: pr.id, ...request }).catch(() => {})

      const submission = await submitReview(submitDeps(), { prId: pr.id, verdict: 'COMMENT', body: 'Soft.', confirmApprove: false })
      expect(submission.agentVerdict).toBe('REQUEST_CHANGES')
    })

    it.each([
      ['COMMENT', 'disagreed'],
      ['REQUEST_CHANGES', 'agreed'],
    ] as const)('pastReviews shows %s against the agent as %s', async (verdict, agreement) => {
      await runReview(deps, { prId: pr.id, ...request })
      const submission = await submitReview(submitDeps(), { prId: pr.id, verdict, body: '', confirmApprove: false })
      expect(store.views.pastReviews(null)).toMatchObject([{ submissionId: submission.id, agentVerdict: 'REQUEST_CHANGES', agentAgreement: agreement }])
    })
  })
})
