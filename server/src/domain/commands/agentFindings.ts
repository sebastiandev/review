import { findOrCreateDraft } from '../actions/findOrCreateDraft.ts'
import type { AgentFinding } from '../agentReview.ts'
import { DraftStale, NotFound } from '../errors.ts'
import type { Clock } from '../ports.ts'
import type { PullRequest } from '../pullRequests.ts'
import { isAnchorable, type DraftComment } from '../review.ts'
import type { Store } from '../store.ts'

export type AgentFindingsDeps = {
  store: Pick<Store, 'transaction' | 'pullRequests' | 'diffs' | 'drafts' | 'agentReviews'>
  clock: Clock
}

/**
 * Copy one agent finding into the PR's draft for its current head.
 * Pre-conditions:
 * - the PR exists and the finding belongs to one of its runs (else `NotFound`)
 * - that run reviewed the PR's current head (else `DraftStale`)
 * Post-conditions:
 * - one `origin='agent'` draft comment references the finding; keeping it again returns that
 *   comment instead of adding another
 */
export function keepFinding(deps: AgentFindingsDeps, req: { prId: number; findingId: number }): DraftComment {
  const { store } = deps
  return store.transaction(() => {
    const pr = requirePr(store, req.prId)
    const finding = requireFinding(store, pr, req.findingId)
    return keep(store, pr, finding, deps.clock())
  })
}

/**
 * Copy every finding of one run into the PR's draft for its current head.
 * Pre-conditions:
 * - the PR exists and the run belongs to it (else `NotFound`); the run reviewed the current head (else `DraftStale`)
 * Post-conditions:
 * - every finding has exactly one draft comment; the returned list covers all of them
 */
export function keepAllFindings(deps: AgentFindingsDeps, req: { prId: number; agentReviewId: number }): DraftComment[] {
  const { store } = deps
  return store.transaction(() => {
    const pr = requirePr(store, req.prId)
    const review = store.agentReviews.get(req.agentReviewId)
    if (!review || review.prId !== pr.id) throw new NotFound('agent review', req.agentReviewId)
    if (review.headSha !== pr.headSha) throw new DraftStale(review.headSha, pr.headSha)
    const now = deps.clock()
    return store.agentReviews.findings(review.id).map((f) => keep(store, pr, f, now))
  })
}

/**
 * Drop the draft comment kept from a finding. The finding itself stays. No-op when nothing was kept.
 * Pre-conditions:
 * - the PR exists and the finding belongs to one of its runs (else `NotFound`)
 */
export function dismissFinding(deps: AgentFindingsDeps, req: { prId: number; findingId: number }): void {
  const { store } = deps
  store.transaction(() => {
    const pr = requirePr(store, req.prId)
    const finding = requireFinding(store, pr, req.findingId)
    const draft = store.drafts.open(pr.id, pr.headSha)
    const kept = draft && store.drafts.commentForFinding(draft.id, finding.id)
    if (kept) store.drafts.deleteComment(kept.id)
  })
}

function keep(store: AgentFindingsDeps['store'], pr: PullRequest, finding: AgentFinding, now: string): DraftComment {
  const draft = findOrCreateDraft(store.drafts, pr.id, pr.headSha, now)
  const existing = store.drafts.commentForFinding(draft.id, finding.id)
  if (existing) return existing
  const diff = store.diffs.get(pr.id, pr.headSha)
  return store.drafts.insertComment(
    {
      draftId: draft.id,
      path: finding.path,
      line: finding.line,
      startLine: finding.startLine,
      side: finding.side,
      body: finding.body,
      agentBody: finding.body,
      origin: 'agent',
      selected: true,
      anchorValid: diff !== null && isAnchorable(diff.anchors, finding),
      inReplyTo: null,
      findingId: finding.id,
    },
    now,
  )
}

function requirePr(store: Pick<Store, 'pullRequests'>, prId: number): PullRequest {
  const pr = store.pullRequests.get(prId)
  if (!pr) throw new NotFound('pull request', prId)
  return pr
}

/** The finding, provided it belongs to a run over this PR's current head. */
function requireFinding(store: Pick<Store, 'agentReviews'>, pr: PullRequest, findingId: number): AgentFinding {
  const finding = store.agentReviews.getFinding(findingId)
  const review = finding && store.agentReviews.get(finding.agentReviewId)
  if (!finding || !review || review.prId !== pr.id) throw new NotFound('agent finding', findingId)
  if (review.headSha !== pr.headSha) throw new DraftStale(review.headSha, pr.headSha)
  return finding
}
