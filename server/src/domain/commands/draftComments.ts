import { findOrCreateDraft } from '../actions/findOrCreateDraft.ts'
import { NotFound } from '../errors.ts'
import type { Clock } from '../ports.ts'
import type { PullRequest } from '../pullRequests.ts'
import { isAnchorable, type Anchor, type DraftComment } from '../review.ts'
import type { Store } from '../store.ts'

export type DraftCommentsDeps = {
  store: Pick<Store, 'transaction' | 'pullRequests' | 'diffs' | 'drafts'>
  clock: Clock
}

export type AddDraftCommentRequest = Anchor & { prId: number; body: string; inReplyTo: string | null }

/**
 * Add a human comment to the PR's draft for its current head.
 * Pre-conditions:
 * - the PR exists (else `NotFound`)
 * Post-conditions:
 * - the draft exists; `anchorValid` reflects the cached diff for the current head (false when
 *   no diff is cached)
 */
export function addDraftComment(deps: DraftCommentsDeps, req: AddDraftCommentRequest): DraftComment {
  const { store } = deps
  return store.transaction(() => {
    const pr = requirePr(store, req.prId)
    const now = deps.clock()
    const draft = findOrCreateDraft(store.drafts, pr.id, pr.headSha, now)
    const diff = store.diffs.get(pr.id, pr.headSha)
    return store.drafts.insertComment(
      {
        draftId: draft.id,
        path: req.path,
        line: req.line,
        startLine: req.startLine,
        side: req.side,
        body: req.body,
        agentBody: null,
        origin: 'human',
        selected: true,
        anchorValid: diff !== null && isAnchorable(diff.anchors, req),
        inReplyTo: req.inReplyTo,
        findingId: null,
      },
      now,
    )
  })
}

/**
 * Change a draft comment's text or selection.
 * Pre-conditions:
 * - the comment belongs to the PR's open draft for its current head (else `NotFound`)
 */
export function editDraftComment(
  deps: DraftCommentsDeps,
  req: { prId: number; commentId: number; body?: string; selected?: boolean },
): DraftComment {
  const { store } = deps
  return store.transaction(() => {
    const comment = requireDraftComment(store, req.prId, req.commentId)
    store.drafts.updateComment(comment.id, { body: req.body, selected: req.selected }, deps.clock())
    return store.drafts.getComment(comment.id)!
  })
}

/**
 * Remove a draft comment.
 * Pre-conditions:
 * - the comment belongs to the PR's open draft for its current head (else `NotFound`)
 */
export function deleteDraftComment(deps: DraftCommentsDeps, req: { prId: number; commentId: number }): void {
  const { store } = deps
  store.transaction(() => {
    const comment = requireDraftComment(store, req.prId, req.commentId)
    store.drafts.deleteComment(comment.id)
  })
}

function requirePr(store: Pick<Store, 'pullRequests'>, prId: number): PullRequest {
  const pr = store.pullRequests.get(prId)
  if (!pr) throw new NotFound('pull request', prId)
  return pr
}

function requireDraftComment(store: Pick<Store, 'pullRequests' | 'drafts'>, prId: number, commentId: number): DraftComment {
  const pr = requirePr(store, prId)
  const draft = store.drafts.open(pr.id, pr.headSha)
  const comment = store.drafts.getComment(commentId)
  if (!draft || !comment || comment.draftId !== draft.id) throw new NotFound('draft comment', commentId)
  return comment
}
