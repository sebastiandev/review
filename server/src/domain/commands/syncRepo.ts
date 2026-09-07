import { cachePrDiff } from '../actions/cachePrDiff.ts'
import { releaseWorktree } from '../actions/releaseWorktree.ts'
import { replaceComments } from '../actions/replaceComments.ts'
import { upsertPullRequests } from '../actions/upsertPullRequests.ts'
import { NotFound } from '../errors.ts'
import type { Clock, Events } from '../ports.ts'
import type { ProviderKind, PullRequestProvider, RemoteComment, RemotePullRequest } from '../pullRequests.ts'
import { shouldReleaseWorktree } from '../rules.ts'
import type { Store } from '../store.ts'
import type { Worktrees } from '../worktrees.ts'

export type SyncRepoDeps = {
  store: Pick<Store, 'transaction' | 'repos' | 'pullRequests' | 'diffs' | 'comments'>
  providers: Record<ProviderKind, PullRequestProvider>
  worktrees: Pick<Worktrees, 'remove'>
  events: Events
  clock: Clock
}

export type SyncRepoResult = { added: number; updated: number; released: number }

/**
 * Refresh one repo from its provider: review-requested and locally known PRs are upserted,
 * new heads get their diff and comments cached, worktrees of finished PRs are released.
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

    const needsContent = remotes.filter((r) => {
      const existing = localByNumber.get(r.number)
      return !existing || existing.headSha !== r.headSha || store.diffs.get(existing.id, existing.headSha) === null
    })
    const content = new Map<number, { patch: string; comments: RemoteComment[] }>()
    for (const r of needsContent) {
      content.set(r.number, { patch: await provider.diff(repo, r.number), comments: await provider.comments(repo, r.number) })
    }

    const now = clock()
    const { rows, added } = store.transaction(() => {
      const rows = upsertPullRequests(store.pullRequests, repo.id, remotes, now)
      for (const pr of rows) {
        const fetched = content.get(pr.number)
        if (!fetched) continue
        cachePrDiff(store.diffs, repo, pr, fetched.patch, now)
        replaceComments(store.comments, pr.id, fetched.comments, now)
      }
      store.repos.update(repo.id, { syncedAt: now, syncError: null })
      return { rows, added: rows.filter((p) => !localByNumber.has(p.number)).length }
    })

    let released = 0
    for (const pr of rows.filter(shouldReleaseWorktree)) {
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
