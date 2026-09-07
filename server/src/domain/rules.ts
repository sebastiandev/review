import type { PullRequest } from './pullRequests.ts'

/** In the inbox: not marked done. Merged/closed PRs stay until the user marks them done. */
export function isActive(pr: Pick<PullRequest, 'doneAt'>): boolean {
  return pr.doneAt === null
}

/** A worktree is kept only while the PR is open and not done. */
export function shouldReleaseWorktree(pr: Pick<PullRequest, 'doneAt' | 'state' | 'worktreePath'>): boolean {
  return pr.worktreePath !== null && (pr.doneAt !== null || pr.state !== 'open')
}
