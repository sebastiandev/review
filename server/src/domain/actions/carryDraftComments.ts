import parseDiff from 'parse-diff'
import { findOrCreateDraft } from './findOrCreateDraft.ts'
import { isAnchorable } from '../review.ts'
import type { PullRequest } from '../pullRequests.ts'
import type { Store } from '../store.ts'

/** Comparable file hunks including both sides' line coordinates. */
function fileLocations(patch: string): Map<string, string> {
  return new Map(parseDiff(patch).map((file) => [file.to === '/dev/null' ? file.from! : file.to!, JSON.stringify(file.chunks)]))
}

/** Carry pending comments to the refreshed head without silently changing their code target.
 * Pre-conditions: the current diff is cached; runs inside the caller's transaction.
 * Post-conditions: all pending comments belong to the current draft; changed locations are flagged invalid.
 */
export function carryDraftComments(store: Pick<Store, 'drafts' | 'diffs' | 'comments'>, pr: PullRequest, now: string): void {
  const older = store.drafts.listOpen(pr.id).filter((draft) => draft.headSha !== pr.headSha)
  if (!older.length) return
  const next = store.diffs.get(pr.id, pr.headSha)
  if (!next) return
  const locations = fileLocations(next.patch)
  const remoteIds = new Set(store.comments.list(pr.id).map((comment) => comment.remoteId))
  const target = findOrCreateDraft(store.drafts, pr.id, pr.headSha, now)
  for (const draft of older) {
    const previous = store.diffs.get(pr.id, draft.headSha)
    const previousLocations = previous ? fileLocations(previous.patch) : new Map<string, string>()
    for (const comment of store.drafts.comments(draft.id)) {
      const anchorValid = comment.inReplyTo !== null
        ? remoteIds.has(comment.inReplyTo)
        : comment.anchorValid && locations.has(comment.path) && previousLocations.get(comment.path) === locations.get(comment.path) && isAnchorable(next.anchors, comment)
      store.drafts.updateComment(comment.id, { anchorValid }, now)
    }
    store.drafts.moveComments(draft.id, target.id)
    store.drafts.deleteEmpty(draft.id)
  }
}
