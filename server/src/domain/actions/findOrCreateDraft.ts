import type { ReviewDraft } from '../review.ts'
import type { Store } from '../store.ts'

/**
 * The open draft for the PR's current head, created on first use.
 * Pre-conditions:
 * - called inside `store.transaction`
 * Post-conditions:
 * - exactly one open draft exists for (prId, headSha)
 */
export function findOrCreateDraft(drafts: Pick<Store['drafts'], 'open' | 'insert'>, prId: number, headSha: string, now: string): ReviewDraft {
  return drafts.open(prId, headSha) ?? drafts.insert(prId, headSha, now)
}
