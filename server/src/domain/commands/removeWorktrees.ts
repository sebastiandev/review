import { releaseWorktree } from '../actions/releaseWorktree.ts'
import type { Events } from '../ports.ts'
import type { Store } from '../store.ts'
import type { Worktrees } from '../worktrees.ts'

export type RemoveWorktreesDeps = {
  store: Pick<Store, 'transaction' | 'pullRequests'>
  worktrees: Pick<Worktrees, 'remove'>
  events: Events
}

/**
 * Free disk for the given PRs. Unknown ids and PRs without a worktree are skipped.
 * Post-conditions:
 * - each removed PR has `worktreePath` cleared and a `worktree.removed` event; returns their ids
 */
export async function removeWorktrees(deps: RemoveWorktreesDeps, req: { prIds: number[] }): Promise<number[]> {
  const { store } = deps
  const removed: number[] = []
  for (const prId of req.prIds) {
    const pr = store.pullRequests.get(prId)
    if (!pr || !(await releaseWorktree(deps.worktrees, pr))) continue
    store.transaction(() => store.pullRequests.update(prId, { worktreePath: null }))
    deps.events.emit({ type: 'worktree.removed', prId })
    removed.push(prId)
  }
  return removed
}
