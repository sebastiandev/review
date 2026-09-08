import type { PullRequest } from './pullRequests.ts'

/** In the inbox: not marked done. Merged/closed PRs stay until the user marks them done. */
export function isActive(pr: Pick<PullRequest, 'doneAt'>): boolean {
  return pr.doneAt === null
}

/**
 * A worktree is kept only while the PR is open and not done — and always while an agent review
 * is queued or running in it (`reviewActive`): removing or moving it under the agent would lose the run.
 */
export function shouldReleaseWorktree(pr: Pick<PullRequest, 'doneAt' | 'state' | 'worktreePath'>, reviewActive = false): boolean {
  return pr.worktreePath !== null && !reviewActive && (pr.doneAt !== null || pr.state !== 'open')
}
