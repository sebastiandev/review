import { cachePrDiff } from '../actions/cachePrDiff.ts'
import { carryViewedMarks } from '../actions/carryViewedMarks.ts'
import { recordRemoteReviews } from '../actions/recordRemoteReviews.ts'
import { releaseWorktree } from '../actions/releaseWorktree.ts'
import { replaceComments } from '../actions/replaceComments.ts'
import { upsertPullRequests } from '../actions/upsertPullRequests.ts'
import { NotFound } from '../errors.ts'
import type { Clock, Events } from '../ports.ts'
import type { ProviderKind, PullRequestProvider, RemoteComment, RemotePullRequest, RemoteReview } from '../pullRequests.ts'
import { isActive, shouldReleaseWorktree } from '../rules.ts'
import type { Store } from '../store.ts'
import type { Worktrees } from '../worktrees.ts'

export type SyncRepoDeps = {
  store: Pick<Store, 'transaction' | 'repos' | 'pullRequests' | 'diffs' | 'comments' | 'agentReviews' | 'viewed' | 'submissions'>
  providers: Record<ProviderKind, PullRequestProvider>
  worktrees: Pick<Worktrees, 'remove'>
  events: Events
  clock: Clock
}

export type SyncRepoResult = { added: number; updated: number; released: number }

/**
 * Refresh one repo from its provider: review-requested and locally known PRs are upserted,
 * new heads get their diff cached (viewed marks carried for files whose change did not move),
 * active PRs get their comments replaced and the user's own provider-side reviews recorded, worktrees of finished
 * PRs are released — unless an agent review is running there, which keeps the worktree until the
 * next sync.
 * Pre-conditions:
 * - the repo exists (else `NotFound`)
 * Post-conditions:
 * - `repo.syncedAt` set on success, `repo.syncError` set on failure (and the error rethrown)
 * - emits `sync.started`, then `sync.finished` or `sync.failed`; `worktree.removed` per release
 */
export async function syncRepo(deps: SyncRepoDeps, req: { repoId: number }): Promise<SyncRepoResult> {
  const { store, events, clock } = deps
  const repo = store.repos.get(req.repoId)
  if (!repo) throw new NotFound('repo', req.repoId)
  const provider = deps.providers[repo.provider]
  events.emit({ type: 'sync.started', repoId: repo.id })

  try {
    const local = store.pullRequests.listByRepo(repo.id, {})
    const localByNumber = new Map(local.map((p) => [p.number, p]))

    const listed = await provider.listReviewRequested(repo)
    const wanted = listed
    const listedNumbers = new Set(listed.map((r) => r.number))
    const vanished = local.filter((p) => p.state === 'open' && !listedNumbers.has(p.number))
    const refreshed = (await Promise.all(vanished.map((p) => provider.get(repo, p.number)))).filter(
      (r): r is RemotePullRequest => r !== null,
    )
    const remotes = [...wanted, ...refreshed]

    // Diffs are per head, so only new heads fetch one; comments move without the head, so every
    // active PR refetches them.
    const needsDiff = (r: RemotePullRequest) => {
      const existing = localByNumber.get(r.number)
      return !existing || existing.headSha !== r.headSha || store.diffs.get(existing.id, existing.headSha) === null
    }
    const needsComments = (r: RemotePullRequest) => {
      const existing = localByNumber.get(r.number)
      return !existing || isActive(existing)
    }
    const content = new Map<number, { patch: string | null; comments: RemoteComment[] | null; reviews: RemoteReview[] | null }>()
    for (const r of remotes) {
      const patch = needsDiff(r) ? await provider.diff(repo, r.number) : null
      const comments = needsComments(r) ? await provider.comments(repo, r.number) : null
      const reviews = needsComments(r) ? await provider.myReviews(repo, r.number) : null
      if (patch !== null || comments !== null || reviews !== null) content.set(r.number, { patch, comments, reviews })
    }

    const now = clock()
    const { rows, added } = store.transaction(() => {
      const rows = upsertPullRequests(store.pullRequests, repo.id, remotes, now)
      for (const pr of rows) {
        const fetched = content.get(pr.number)
        if (!fetched) continue
        if (fetched.patch !== null) {
          const previous = localByNumber.get(pr.number)
          const previousDiff = previous && previous.headSha !== pr.headSha ? store.diffs.get(pr.id, previous.headSha) : null
          const next = cachePrDiff(store.diffs, repo, pr, fetched.patch, now)
          if (previousDiff) carryViewedMarks(store.viewed, pr.id, previousDiff, next)
        }
        if (fetched.comments !== null) replaceComments(store.comments, pr.id, fetched.comments, now)
        if (fetched.reviews !== null) recordRemoteReviews(store, pr, fetched.reviews)
      }
      store.repos.update(repo.id, { syncedAt: now, syncError: null })
      return { rows, added: rows.filter((p) => !localByNumber.has(p.number)).length }
    })

    let released = 0
    for (const pr of rows.filter((p) => shouldReleaseWorktree(p, store.agentReviews.active(p.id) !== null))) {
      await releaseWorktree(deps.worktrees, pr)
      store.transaction(() => store.pullRequests.update(pr.id, { worktreePath: null }))
      events.emit({ type: 'worktree.removed', prId: pr.id })
      released++
    }

    const result = { added, updated: rows.length - added, released }
    events.emit({ type: 'sync.finished', repoId: repo.id, added, updated: result.updated })
    return result
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    store.transaction(() => store.repos.update(repo.id, { syncError: message }))
    events.emit({ type: 'sync.failed', repoId: repo.id, message })
    throw e
  }
}
