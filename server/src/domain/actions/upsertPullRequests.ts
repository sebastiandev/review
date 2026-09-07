import { extractSpecRef, type PullRequest, type RemotePullRequest } from '../pullRequests.ts'
import type { Store } from '../store.ts'

/**
 * Write what the provider returned over the local rows.
 * Pre-conditions:
 * - called inside `store.transaction`
 * Post-conditions:
 * - `reviewRequested` and `specRef` follow the remote; `addedByUser`, `reviewOnOpen`,
 *   `doneAt` and `worktreePath` of existing rows are untouched
 */
export function upsertPullRequests(
  pullRequests: Pick<Store['pullRequests'], 'upsert'>,
  repoId: number,
  remotes: RemotePullRequest[],
  syncedAt: string,
): PullRequest[] {
  return remotes.map((remote) =>
    pullRequests.upsert(repoId, remote, { reviewRequested: remote.reviewRequested, specRef: extractSpecRef(remote.body) }, syncedAt),
  )
}
