import { NotFound } from '../errors.ts'
import type { Repo, RepoRef } from '../pullRequests.ts'
import type { Store } from '../store.ts'

export type TrackReposDeps = { store: Pick<Store, 'transaction' | 'repos'> }

/**
 * Start following a repo: insert it, or re-enable a previously untracked row.
 * Post-conditions:
 * - the repo row exists with `tracked = true`; PRs and worktrees of a re-tracked repo are kept
 */
export function trackRepo(deps: TrackReposDeps, ref: RepoRef): Repo {
  const { repos } = deps.store
  return deps.store.transaction(() => {
    const existing = repos.find(ref)
    if (!existing) return repos.insert({ ...ref, tracked: true, autoReview: false, syncedAt: null, syncError: null })
    if (!existing.tracked) repos.update(existing.id, { tracked: true })
    return { ...existing, tracked: true }
  })
}

/**
 * Stop following a repo. Rows and worktrees stay so re-tracking is lossless.
 * Pre-conditions:
 * - the repo exists (else `NotFound`)
 */
export function untrackRepo(deps: TrackReposDeps, req: { repoId: number }): void {
  deps.store.transaction(() => {
    if (!deps.store.repos.get(req.repoId)) throw new NotFound('repo', req.repoId)
    deps.store.repos.update(req.repoId, { tracked: false })
  })
}
