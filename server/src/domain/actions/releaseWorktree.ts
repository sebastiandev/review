import type { PullRequest } from '../pullRequests.ts'
import type { Worktrees } from '../worktrees.ts'

/**
 * Delete the PR's worktree from disk. Returns whether there was one to delete.
 * Pre-conditions:
 * - called outside any transaction (does git I/O)
 * Post-conditions:
 * - the directory is gone; the row still holds the path until the caller clears it
 */
export async function releaseWorktree(worktrees: Pick<Worktrees, 'remove'>, pr: Pick<PullRequest, 'worktreePath'>): Promise<boolean> {
  if (pr.worktreePath === null) return false
  await worktrees.remove(pr.worktreePath)
  return true
}
