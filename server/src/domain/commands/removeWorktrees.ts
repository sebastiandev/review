import { releaseWorktree } from '../actions/releaseWorktree.ts'
import type { Events } from '../ports.ts'
import type { Store } from '../store.ts'
import type { Worktrees } from '../worktrees.ts'

export type RemoveWorktreesDeps = {
  store: Pick<Store, 'transaction' | 'pullRequests' | 'agentReviews'>
  worktrees: Pick<Worktrees, 'remove'>
  events: Events
}

/**
 * Free disk for the given PRs. Unknown ids, PRs without a worktree and PRs with an agent review
 * queued or running are skipped.
 * Post-conditions:
 * - each removed PR has `worktreePath` cleared and a `worktree.removed` event; returns their ids
 */
export async function removeWorktrees(deps: RemoveWorktreesDeps, req: { prIds: number[] }): Promise<number[]> {
  const { store } = deps
  const removed: number[] = []
  for (const prId of req.prIds) {
    const pr = store.pullRequests.get(prId)
    if (!pr || store.agentReviews.active(prId)) continue
    if (!(await releaseWorktree(deps.worktrees, pr))) continue
    store.transaction(() => store.pullRequests.update(prId, { worktreePath: null }))
    deps.events.emit({ type: 'worktree.removed', prId })
    removed.push(prId)
  }
  return removed
}

/**
 * Free disk for every PR that is merged or closed remotely. Open PRs keep theirs, done or not.
 * Post-conditions:
 * - same as `removeWorktrees` for the matching PRs; returns their ids
 */
export function removeMergedWorktrees(deps: RemoveWorktreesDeps): Promise<number[]> {
  const prIds = deps.store.pullRequests
    .listWithWorktree()
    .filter((pr) => pr.state !== 'open')
    .map((pr) => pr.id)
  return removeWorktrees(deps, { prIds })
}
