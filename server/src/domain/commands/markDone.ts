import { releaseWorktree } from '../actions/releaseWorktree.ts'
import { NotFound } from '../errors.ts'
import type { Clock, Events } from '../ports.ts'
import type { Store } from '../store.ts'
import type { Worktrees } from '../worktrees.ts'

export type MarkDoneDeps = {
  store: Pick<Store, 'transaction' | 'pullRequests'>
  worktrees: Pick<Worktrees, 'remove'>
  events: Events
  clock: Clock
}

/**
 * Take a PR out of the inbox and free its worktree.
 * Pre-conditions:
 * - the PR exists (else `NotFound`)
 * Post-conditions:
 * - `doneAt` set (first transaction); worktree removed and `worktreePath` cleared (second),
 *   emitting `worktree.removed`
 */
export async function markDone(deps: MarkDoneDeps, req: { prId: number }): Promise<void> {
  const { store } = deps
  const pr = store.transaction(() => {
    const pr = store.pullRequests.get(req.prId)
    if (!pr) throw new NotFound('pull request', req.prId)
    store.pullRequests.update(pr.id, { doneAt: deps.clock() })
    return pr
  })
  if (await releaseWorktree(deps.worktrees, pr)) {
    store.transaction(() => store.pullRequests.update(pr.id, { worktreePath: null }))
    deps.events.emit({ type: 'worktree.removed', prId: pr.id })
  }
}

/**
 * Put a done PR back in the inbox. The worktree is recreated lazily by `openPullRequest`.
 * Pre-conditions:
 * - the PR exists (else `NotFound`)
 */
export function reopenPullRequest(deps: Pick<MarkDoneDeps, 'store'>, req: { prId: number }): void {
  deps.store.transaction(() => {
    if (!deps.store.pullRequests.get(req.prId)) throw new NotFound('pull request', req.prId)
    deps.store.pullRequests.update(req.prId, { doneAt: null })
  })
}
