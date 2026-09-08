import { NotFound } from '../errors.ts'
import type { Repo, RepoRef } from '../pullRequests.ts'
import type { Store } from '../store.ts'

export type TrackReposDeps = { store: Pick<Store, 'transaction' | 'repos'> }

export type TrackRepoRequest = RepoRef & { autoReview: boolean }

/**
 * Start following a repo: insert it, or re-enable a previously untracked row.
 * Post-conditions:
 * - the repo row exists with `tracked = true` and the requested `autoReview`; PRs and worktrees
 *   of a re-tracked repo are kept
 */
export function trackRepo(deps: TrackReposDeps, req: TrackRepoRequest): Repo {
  const { repos } = deps.store
  const { autoReview, ...ref } = req
  return deps.store.transaction(() => {
    const existing = repos.find(ref)
    if (!existing) return repos.insert({ ...ref, tracked: true, autoReview, syncedAt: null, syncError: null })
    repos.update(existing.id, { tracked: true, autoReview })
    return { ...existing, tracked: true, autoReview }
  })
}

/**
 * Change a tracked repo's options.
 * Pre-conditions:
 * - the repo exists (else `NotFound`)
 */
export function updateRepo(deps: TrackReposDeps, req: { repoId: number; autoReview?: boolean }): Repo {
  const { repos } = deps.store
  return deps.store.transaction(() => {
    const repo = repos.get(req.repoId)
    if (!repo) throw new NotFound('repo', req.repoId)
    const patch = req.autoReview === undefined ? {} : { autoReview: req.autoReview }
    repos.update(repo.id, patch)
    return { ...repo, ...patch }
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
