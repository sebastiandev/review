import type { PrPreview } from '@review/shared'
import { cachePrDiff } from '../actions/cachePrDiff.ts'
import { replaceComments } from '../actions/replaceComments.ts'
import { NotFound } from '../errors.ts'
import type { Clock } from '../ports.ts'
import { extractSpecRef, repoLabel, type ProviderKind, type PullRequest, type PullRequestProvider, type RemoteComment, type RemotePullRequest, type Repo, type RepoRef } from '../pullRequests.ts'
import type { Store } from '../store.ts'

export type AddPullRequestsDeps = {
  store: Pick<Store, 'transaction' | 'repos' | 'pullRequests' | 'diffs' | 'comments'>
  providers: Record<ProviderKind, PullRequestProvider>
  clock: Clock
}

export type ResolveResult = { repoId: number; preview: PrPreview } | { untrackedRepo: RepoRef } | null

/**
 * Read-only: turn what the user typed into a PR preview. `null` when the input is not a
 * reference or the PR does not exist; `untrackedRepo` when it points at a repo we do not follow.
 * Pre-conditions:
 * - the repo exists (else `NotFound`)
 */
export async function resolvePullRequest(
  deps: Pick<AddPullRequestsDeps, 'store' | 'providers'>,
  req: { repoId: number; input: string },
): Promise<ResolveResult> {
  const repo = deps.store.repos.get(req.repoId)
  if (!repo) throw new NotFound('repo', req.repoId)
  const provider = deps.providers[repo.provider]
  const parsed = provider.parseReference(req.input, repo)
  if (!parsed) return null

  const target = sameRepo(parsed.repo, repo) ? repo : deps.store.repos.find(parsed.repo)
  if (!target || !target.tracked) return { untrackedRepo: parsed.repo }

  const remote = await provider.get(target, parsed.number)
  if (!remote) return null
  return { repoId: target.id, preview: toPreview(target, remote, deps.store.pullRequests.find(target.id, remote.number) !== null) }
}

/**
 * Read-only: open PRs of the repo that are not in the inbox yet and where no review was
 * requested from me — the candidates for the "add PR" picker.
 * Pre-conditions:
 * - the repo exists (else `NotFound`)
 */
export async function listOpenPreviews(
  deps: Pick<AddPullRequestsDeps, 'store' | 'providers'>,
  req: { repoId: number },
): Promise<PrPreview[]> {
  const repo = deps.store.repos.get(req.repoId)
  if (!repo) throw new NotFound('repo', req.repoId)
  const stored = new Set(deps.store.pullRequests.listByRepo(repo.id, {}).map((p) => p.number))
  const open = await deps.providers[repo.provider].listOpen(repo)
  return open.filter((r) => !r.reviewRequested && !stored.has(r.number)).map((r) => toPreview(repo, r, false))
}

/**
 * Put PRs the user picked into the inbox with their diff and comments.
 * Pre-conditions:
 * - the repo exists and every number resolves remotely (else `NotFound`, nothing written)
 * Post-conditions:
 * - each PR upserted with `addedByUser = true` and the given `reviewOnOpen`, in one transaction
 */
export async function addPullRequests(
  deps: AddPullRequestsDeps,
  req: { repoId: number; numbers: number[]; reviewOnOpen: boolean },
): Promise<PullRequest[]> {
  const { store } = deps
  const repo = store.repos.get(req.repoId)
  if (!repo) throw new NotFound('repo', req.repoId)
  const provider = deps.providers[repo.provider]

  const fetched: { remote: RemotePullRequest; patch: string; comments: RemoteComment[] }[] = []
  for (const number of req.numbers) {
    const remote = await provider.get(repo, number)
    if (!remote) throw new NotFound('pull request', `${repoLabel(repo)}#${number}`)
    fetched.push({ remote, patch: await provider.diff(repo, number), comments: await provider.comments(repo, number) })
  }

  const now = deps.clock()
  return store.transaction(() =>
    fetched.map(({ remote, patch, comments }) => {
      const pr = store.pullRequests.upsert(
        repo.id,
        remote,
        { addedByUser: true, reviewOnOpen: req.reviewOnOpen, reviewRequested: remote.reviewRequested, specRef: extractSpecRef(remote.body) },
        now,
      )
      cachePrDiff(store.diffs, repo, pr, patch, now)
      replaceComments(store.comments, pr.id, comments, now)
      return pr
    }),
  )
}

/** Shape a remote PR for the picker. */
export function toPreview(repo: RepoRef, remote: RemotePullRequest, stored: boolean): PrPreview {
  return {
    repo: repoLabel(repo),
    number: remote.number,
    title: remote.title,
    author: remote.author,
    url: remote.url,
    isDraft: remote.isDraft,
    state: remote.state,
    headRef: remote.headRef,
    baseRef: remote.baseRef,
    headSha: remote.headSha,
    additions: remote.additions,
    deletions: remote.deletions,
    changedFiles: remote.changedFiles,
    reviewRequested: remote.reviewRequested,
    updatedAt: remote.updatedAt,
    stored,
  }
}

function sameRepo(a: RepoRef, b: Repo): boolean {
  return a.provider === b.provider && a.owner === b.owner && a.name === b.name
}
