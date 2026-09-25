import type { Store } from '../store.ts'
import type { PullRequestProvider, RepoRef } from '../pullRequests.ts'
import { NotFound } from '../errors.ts'
import { attentionThreads } from '../attention.ts'
import type { Events } from '../ports.ts'

type Deps = {
  store: Pick<Store, 'repos' | 'pullRequests' | 'attention' | 'comments' | 'transaction'>
  providers: Record<RepoRef['provider'], PullRequestProvider>
  events: Events
}

/** Read conversations for one tracked repo and authenticated viewer. No writes; missing repo raises NotFound. */
export async function readAttention(deps: Deps, req: { repoId: number }) {
  const repo = deps.store.repos.get(req.repoId)
  if (!repo) throw new NotFound('repo', req.repoId)
  const viewer = (await deps.providers[repo.provider].viewerLogin()).toLowerCase()
  const rows = deps.store.attention.comments(repo.id, viewer)
  const grouped = new Map<number, typeof rows>()
  for (const row of rows) {
    const group = grouped.get(row.prId) ?? []
    group.push(row)
    grouped.set(row.prId, group)
  }
  const descriptions = new Map(deps.store.attention.descriptions(repo.id, viewer).map((r) => [r.prId, r.body]))
  return deps.store.pullRequests.listByRepo(repo.id, {}).flatMap((pr) => attentionThreads(pr, [
    ...(grouped.get(pr.id) ?? []),
    { comment: { remoteId: 'description', kind: 'discussion', author: pr.author, body: pr.body,
      createdAt: pr.createdAt, path: '', line: null, startLine: null, side: null, inReplyTo: null, originalLine: null, originalCommitSha: null },
      seen: descriptions.get(pr.id) === pr.body },
  ], viewer))
}

/** Record only the displayed versions of comments. Preconditions: PR exists. Postconditions: later edits/replies stay unread. */
export async function markCommentsRead(deps: Deps, req: { prId: number; comments: { remoteId: string; body: string }[] }) {
  const pr = deps.store.pullRequests.get(req.prId)
  if (!pr) throw new NotFound('pull request', req.prId)
  const repo = deps.store.repos.get(pr.repoId)!
  const viewer = (await deps.providers[repo.provider].viewerLogin()).toLowerCase()
  const existing = new Map(deps.store.comments.list(pr.id).map((c) => [c.remoteId, c.body]))
  existing.set('description', pr.body)
  deps.store.transaction(() => {
    for (const c of req.comments) {
      if (existing.get(c.remoteId) === c.body) deps.store.attention.markRead(pr.id, viewer, c.remoteId, c.body)
    }
  })
  deps.events.emit({ type: 'comments.read', prId: pr.id, repoId: repo.id })
}
