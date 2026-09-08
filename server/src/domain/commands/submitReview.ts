import type { Verdict } from '@review/shared'
import { findOrCreateDraft } from '../actions/findOrCreateDraft.ts'
import { ApproveNotConfirmed, DraftStale, InvalidAnchors, NotFound, PullRequestClosed } from '../errors.ts'
import { upsertPullRequests } from '../actions/upsertPullRequests.ts'
import type { Clock, Events } from '../ports.ts'
import type { ProviderKind, PullRequestProvider, ReviewPayload } from '../pullRequests.ts'
import { mergeSameLineComments, validateAnchors, type Submission } from '../review.ts'
import type { Store } from '../store.ts'

export type SubmitReviewDeps = {
  store: Pick<Store, 'transaction' | 'repos' | 'pullRequests' | 'diffs' | 'drafts' | 'submissions' | 'agentReviews' | 'viewed'>
  providers: Record<ProviderKind, Pick<PullRequestProvider, 'submitReview' | 'get'>>
  events: Events
  clock: Clock
}

export type SubmitReviewRequest = { prId: number; verdict: Verdict; body: string; confirmApprove: boolean }

/**
 * Send the human's draft for the PR's current head to the provider as one review.
 * Pre-conditions:
 * - the PR is still open remotely (else `PullRequestClosed`, after storing the new state) and its
 *   head has not moved since the last sync (else `DraftStale`, after storing the new head)
 * - the PR exists (else `NotFound`)
 * - no open draft for an older head (else `DraftStale`); a PR with no draft at all gets an
 *   empty one so a body-only review can go out
 * - `APPROVE` requires `confirmApprove` (else `ApproveNotConfirmed`)
 * - every selected comment anchors to the cached diff; otherwise they are flagged
 *   `anchorValid = false` in their own transaction and `InvalidAnchors(ids)` is thrown
 * Post-conditions:
 * - one `submission` row carrying the verdict of the latest ready agent run for this head (if
 *   any) as `agentVerdict`, the draft marked submitted, every file of the head marked viewed,
 *   `review.submitted` emitted
 */
export async function submitReview(deps: SubmitReviewDeps, req: SubmitReviewRequest): Promise<Submission> {
  const { store } = deps
  const pr = store.pullRequests.get(req.prId)
  if (!pr) throw new NotFound('pull request', req.prId)
  const repo = store.repos.get(pr.repoId)
  if (!repo) throw new NotFound('repo', pr.repoId)
  if (req.verdict === 'APPROVE' && !req.confirmApprove) throw new ApproveNotConfirmed()

  // Re-check the remote first: the PR may have been merged since the last poll.
  const provider = deps.providers[repo.provider]
  const remote = await provider.get(repo, pr.number)
  if (remote && remote.state !== 'open') {
    const now = deps.clock()
    store.transaction(() => upsertPullRequests(store.pullRequests, repo.id, [remote], now))
    deps.events.emit({ type: 'pr.refreshed', prId: pr.id, headMoved: remote.headSha !== pr.headSha })
    throw new PullRequestClosed(remote.state)
  }
  if (remote && remote.headSha !== pr.headSha) {
    const now = deps.clock()
    store.transaction(() => upsertPullRequests(store.pullRequests, repo.id, [remote], now))
    deps.events.emit({ type: 'pr.refreshed', prId: pr.id, headMoved: true })
    throw new DraftStale(pr.headSha, remote.headSha)
  }

  const stale = store.drafts.latestOpen(pr.id)
  if (stale && stale.headSha !== pr.headSha) throw new DraftStale(stale.headSha, pr.headSha)
  const draft = stale
  const selected = draft ? store.drafts.comments(draft.id).filter((c) => c.selected) : []

  const diff = store.diffs.get(pr.id, pr.headSha)
  const invalid = validateAnchors(selected, diff?.anchors ?? {})
  if (invalid.length) {
    const now = deps.clock()
    store.transaction(() => invalid.forEach((id) => store.drafts.updateComment(id, { anchorValid: false }, now)))
    throw new InvalidAnchors(invalid)
  }

  const payload: ReviewPayload = { verdict: req.verdict, body: req.body, comments: mergeSameLineComments(selected) }
  const { remoteReviewId } = await deps.providers[repo.provider].submitReview(repo, pr.number, payload)

  const now = deps.clock()
  const submission = store.transaction(() => {
    const target = draft ?? findOrCreateDraft(store.drafts, pr.id, pr.headSha, now)
    const agentVerdict = store.agentReviews.latest(pr.id, pr.headSha, 'ready')?.verdict ?? null
    const submission = store.submissions.insert(
      {
        prId: pr.id,
        headSha: pr.headSha,
        draftId: target.id,
        remoteReviewId,
        source: 'app',
        verdict: req.verdict,
        body: req.body,
        agentVerdict,
        submittedAt: now,
      },
      JSON.stringify(payload),
    )
    store.drafts.markSubmitted(target.id, now)
    // Submitting means the reviewer has been through the whole head.
    for (const file of diff?.files ?? []) store.viewed.set(pr.id, file.path, pr.headSha)
    return submission
  })
  deps.events.emit({ type: 'review.submitted', prId: pr.id, verdict: req.verdict, remoteReviewId })
  return submission
}
