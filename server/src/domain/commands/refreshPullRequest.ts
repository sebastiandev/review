import { cachePrDiff } from '../actions/cachePrDiff.ts'
import { carryViewedMarks } from '../actions/carryViewedMarks.ts'
import { replaceComments } from '../actions/replaceComments.ts'
import { upsertPullRequests } from '../actions/upsertPullRequests.ts'
import { NotFound } from '../errors.ts'
import type { Clock, Events } from '../ports.ts'
import type { ProviderKind, PullRequest, PullRequestProvider } from '../pullRequests.ts'
import type { Store } from '../store.ts'
import type { Worktrees } from '../worktrees.ts'

export type RefreshPullRequestDeps = {
  store: Pick<Store, 'transaction' | 'repos' | 'pullRequests' | 'diffs' | 'comments' | 'agentReviews' | 'viewed'>
  providers: Record<ProviderKind, PullRequestProvider>
  worktrees: Pick<Worktrees, 'exists' | 'headSha' | 'checkout'>
  events: Events
  clock: Clock
}

/** `worktreeDeferred`: the head moved but an agent review is running, so the checkout waits for the next refresh. */
export type RefreshResult = { pr: PullRequest; headMoved: boolean; worktreeDeferred: boolean }

/**
 * Bring one PR up to date now, regardless of the poll interval: row, comments, and — when the
 * head moved — its diff and the worktree checkout.
 * Pre-conditions:
 * - the PR and its repo exist (else `NotFound`); the PR still exists remotely (else `NotFound`)
 * Post-conditions:
 * - the row mirrors the remote; comments are replaced; a new head has its diff cached and, if a
 *   worktree is on disk, is checked out there (`worktree.progress`/`worktree.ready` emitted) —
 *   unless an agent review is running in it, which keeps the old checkout (`worktreeDeferred`)
 * - emits `pr.refreshed`
 */
export async function refreshPullRequest(deps: RefreshPullRequestDeps, req: { prId: number }): Promise<RefreshResult> {
  const { store, events } = deps
  const before = store.pullRequests.get(req.prId)
  if (!before) throw new NotFound('pull request', req.prId)
  const repo = store.repos.get(before.repoId)
  if (!repo) throw new NotFound('repo', before.repoId)
  const provider = deps.providers[repo.provider]

  const remote = await provider.get(repo, before.number)
  if (!remote) throw new NotFound('pull request', `${repo.owner}/${repo.name}#${before.number}`)
  const headMoved = remote.headSha !== before.headSha
  const needsDiff = headMoved || store.diffs.get(before.id, before.headSha) === null
  const [patch, comments] = await Promise.all([needsDiff ? provider.diff(repo, before.number) : null, provider.comments(repo, before.number)])

  const now = deps.clock()
  const pr = store.transaction(() => {
    const [row] = upsertPullRequests(store.pullRequests, repo.id, [remote], now)
    if (!row) throw new NotFound('pull request', req.prId)
    if (patch !== null) {
      const previousDiff = headMoved ? store.diffs.get(row.id, before.headSha) : null
      const next = cachePrDiff(store.diffs, repo, row, patch, now)
      if (previousDiff) carryViewedMarks(store.viewed, row.id, previousDiff, next)
    }
    replaceComments(store.comments, row.id, comments, now)
    return row
  })

  let worktreeDeferred = false
  if (headMoved && pr.worktreePath && (await deps.worktrees.exists(pr.worktreePath))) {
    if (store.agentReviews.active(pr.id)) {
      worktreeDeferred = true
    } else if ((await deps.worktrees.headSha(pr.worktreePath)) !== pr.headSha) {
      await deps.worktrees.checkout(
        pr.worktreePath,
        { repo, cloneUrl: provider.cloneUrl(repo), number: pr.number, headRef: pr.headRef, headSha: pr.headSha },
        (stage) => events.emit({ type: 'worktree.progress', prId: pr.id, stage }),
      )
      events.emit({ type: 'worktree.ready', prId: pr.id, path: pr.worktreePath })
    }
  }

  events.emit({ type: 'pr.refreshed', prId: pr.id, headMoved })
  return { pr, headMoved, worktreeDeferred }
}
