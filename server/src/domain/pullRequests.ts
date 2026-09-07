import type { DiffFile, Verdict } from '@review/shared'

export type ProviderKind = 'github' | 'gitlab'

export type RepoRef = { provider: ProviderKind; owner: string; name: string }

export type Repo = RepoRef & {
  id: number
  tracked: boolean
  autoReview: boolean
  syncedAt: string | null
  syncError: string | null
}

export type PrState = 'open' | 'merged' | 'closed'

/** What the provider returned. Built from its response only — never re-fetched behind it. */
export type RemotePullRequest = {
  number: number
  title: string
  author: string
  url: string
  body: string
  headRef: string
  baseRef: string
  headSha: string
  baseSha: string
  isDraft: boolean
  state: PrState
  additions: number
  deletions: number
  changedFiles: number
  reviewRequested: boolean
  createdAt: string
  updatedAt: string
}

export type RemoteComment = {
  remoteId: string
  author: string
  path: string
  line: number | null
  startLine: number | null
  side: 'LEFT' | 'RIGHT' | null
  body: string
  inReplyTo: string | null
  createdAt: string
}

export type PullRequest = RemotePullRequest & {
  id: number
  repoId: number
  addedByUser: boolean
  reviewOnOpen: boolean
  specRef: string | null
  doneAt: string | null
  worktreePath: string | null
  syncedAt: string
}

export type PrDiff = {
  prId: number
  headSha: string
  baseSha: string
  patch: string
  files: DiffFile[]
  anchors: Record<string, number[]>
  fetchedAt: string
}

export type ReviewPayload = {
  verdict: Verdict
  body: string
  comments: {
    path: string
    line: number
    startLine: number | null
    side: 'LEFT' | 'RIGHT'
    body: string
    inReplyTo: string | null
  }[]
}

export type PullRequestProvider = {
  kind: ProviderKind
  cloneUrl(repo: RepoRef): string
  /** Open PRs; `reviewRequested` marks the ones assigned to me. One request per repo. */
  /** Open PRs whose review is requested from me, directly or via a team. One request per repo. */
  listReviewRequested(repo: RepoRef): Promise<RemotePullRequest[]>
  /** Most recently updated open PRs (one page), for picking ones not assigned to me. */
  listOpen(repo: RepoRef): Promise<RemotePullRequest[]>
  get(repo: RepoRef, number: number): Promise<RemotePullRequest | null>
  diff(repo: RepoRef, number: number): Promise<string>
  comments(repo: RepoRef, number: number): Promise<RemoteComment[]>
  submitReview(repo: RepoRef, number: number, payload: ReviewPayload): Promise<{ remoteReviewId: string }>
  /** URL, `#n` or `n` → number, or null. Provider-specific URL grammar, so it lives here. */
  parseReference(input: string, repo: RepoRef): { repo: RepoRef; number: number } | null
}

/** `owner/name` — the label used in URLs, titles and DiffSourceRef. */
export function repoLabel(repo: RepoRef): string {
  return `${repo.owner}/${repo.name}`
}

/**
 * The spec a PR body points at: the value of a `Spec:` line (or `Spec-Ref:`), or null.
 * Pure. Matching is case-insensitive; the first occurrence wins.
 */
export function extractSpecRef(body: string): string | null {
  const match = /^\s*spec(?:[ -]?ref)?\s*:\s*(\S+)/im.exec(body)
  return match ? match[1] : null
}
