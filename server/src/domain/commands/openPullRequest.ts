import { NotFound } from '../errors.ts'
import type { Events } from '../ports.ts'
import type { ProviderKind, PullRequest, PullRequestProvider, Repo } from '../pullRequests.ts'
import type { Store } from '../store.ts'
import type { Worktrees } from '../worktrees.ts'

export type OpenPullRequestDeps = {
  store: Pick<Store, 'transaction' | 'repos' | 'pullRequests'>
  providers: Record<ProviderKind, Pick<PullRequestProvider, 'cloneUrl'>>
  worktrees: Pick<Worktrees, 'create' | 'exists'>
  events: Events
}

export type OpenPullRequest = (req: { prId: number }) => Promise<{ path: string }>

/**
 * Build `openPullRequest`: make sure the PR's worktree is on disk and return its path.
 * Concurrent calls for the same PR share one creation (the `inFlight` map in this closure).
 * Pre-conditions:
 * - the PR and its repo exist (else `NotFound`)
 * Post-conditions:
 * - `pr.worktreePath` set; emits `worktree.progress` per stage, then `worktree.ready`, or
 *   `worktree.failed` and the error rethrown
 */
export function makeOpenPullRequest(deps: OpenPullRequestDeps): OpenPullRequest {
  const inFlight = new Map<number, Promise<{ path: string }>>()

  return async ({ prId }) => {
    const pr = deps.store.pullRequests.get(prId)
    if (!pr) throw new NotFound('pull request', prId)
    if (pr.worktreePath && (await deps.worktrees.exists(pr.worktreePath))) {
      deps.events.emit({ type: 'worktree.ready', prId, path: pr.worktreePath })
      return { path: pr.worktreePath }
    }
    const pending = inFlight.get(prId)
    if (pending) return pending

    const repo = deps.store.repos.get(pr.repoId)
    if (!repo) throw new NotFound('repo', pr.repoId)
    const creation = createWorktree(deps, repo, pr).finally(() => inFlight.delete(prId))
    inFlight.set(prId, creation)
    return creation
  }
}

async function createWorktree(deps: OpenPullRequestDeps, repo: Repo, pr: PullRequest): Promise<{ path: string }> {
  const { events, store } = deps
  try {
    const { path } = await deps.worktrees.create(
      { repo, cloneUrl: deps.providers[repo.provider].cloneUrl(repo), number: pr.number, headRef: pr.headRef, headSha: pr.headSha },
      (stage) => events.emit({ type: 'worktree.progress', prId: pr.id, stage }),
    )
    store.transaction(() => store.pullRequests.update(pr.id, { worktreePath: path }))
    events.emit({ type: 'worktree.ready', prId: pr.id, path })
    return { path }
  } catch (e) {
    events.emit({ type: 'worktree.failed', prId: pr.id, message: e instanceof Error ? e.message : String(e) })
    throw e
  }
}
