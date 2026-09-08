import type { AccountRepo } from '@review/shared'
import type { RemoteComment, RemotePullRequest, RepoRef } from '../../domain/pullRequests.ts'

/** The fields `PR_FIELDS` asks GraphQL for. */
export type GraphqlPullRequest = {
  number: number
  title: string
  author: { login: string } | null
  url: string
  body: string
  headRefName: string
  baseRefName: string
  headRefOid: string
  baseRefOid: string
  isDraft: boolean
  state: 'OPEN' | 'CLOSED' | 'MERGED'
  additions: number
  deletions: number
  changedFiles: number
  createdAt: string
  updatedAt: string
  reviewRequests: { nodes: { requestedReviewer: { __typename: string; login?: string; slug?: string } | null }[] }
}

/** GraphQL fragment body shared by list and get. */
export const PR_FIELDS = `
  number title author { login } url body headRefName baseRefName headRefOid baseRefOid isDraft state
  additions deletions changedFiles createdAt updatedAt
  reviewRequests(first: 50) { nodes { requestedReviewer { __typename ... on User { login } ... on Team { slug } } } }
`

/** A `viewer.repositories` node with its open-PR count. */
export type GraphqlRepository = { owner: { login: string }; name: string; pullRequests: { totalCount: number } }

/** `GET /repos/:o/:r/pulls/:n/comments` item. */
export type RestReviewComment = {
  id: number
  user: { login: string } | null
  path: string
  line: number | null
  start_line: number | null
  side: 'LEFT' | 'RIGHT' | null
  body: string
  in_reply_to_id?: number
  created_at: string
}

/** A PR node as the domain sees it. `reviewRequested` = `viewer` is among the requested users. */
export function mapPullRequest(node: GraphqlPullRequest, viewer: string): RemotePullRequest {
  return {
    number: node.number,
    title: node.title,
    author: node.author?.login ?? 'ghost',
    url: node.url,
    body: node.body,
    headRef: node.headRefName,
    baseRef: node.baseRefName,
    headSha: node.headRefOid,
    baseSha: node.baseRefOid,
    isDraft: node.isDraft,
    state: node.state === 'OPEN' ? 'open' : node.state === 'MERGED' ? 'merged' : 'closed',
    additions: node.additions,
    deletions: node.deletions,
    changedFiles: node.changedFiles,
    // Team requests are not resolved: membership is not in the response.
    reviewRequested: node.reviewRequests.nodes.some((r) => r.requestedReviewer?.__typename === 'User' && r.requestedReviewer.login === viewer),
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
  }
}

/** A repository node as the tracking picker sees it. */
export function mapAccountRepo(node: GraphqlRepository): AccountRepo {
  return { owner: node.owner.login, name: node.name, openPrCount: node.pullRequests.totalCount }
}

/** A REST review comment as the domain sees it. Ids are stringified so `in_reply_to` round-trips. */
export function mapComment(c: RestReviewComment): RemoteComment {
  return {
    remoteId: String(c.id),
    author: c.user?.login ?? 'ghost',
    path: c.path,
    line: c.line,
    startLine: c.start_line,
    side: c.side,
    body: c.body,
    inReplyTo: c.in_reply_to_id === undefined ? null : String(c.in_reply_to_id),
    createdAt: c.created_at,
  }
}

/**
 * `https://github.com/o/r/pull/415`, `o/r#415`, `#415` or `415` → the PR reference, else null.
 * Bare numbers and `#n` resolve against `repo`.
 */
export function parseReference(input: string, repo: RepoRef): { repo: RepoRef; number: number } | null {
  const text = input.trim()
  const url = /^https?:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)(?:[/?#].*)?$/i.exec(text)
  if (url) return { repo: { provider: 'github', owner: url[1], name: url[2] }, number: Number(url[3]) }
  const qualified = /^([^/\s#]+)\/([^/\s#]+)#(\d+)$/.exec(text)
  if (qualified) return { repo: { provider: 'github', owner: qualified[1], name: qualified[2] }, number: Number(qualified[3]) }
  const bare = /^#?(\d+)$/.exec(text)
  if (bare) return { repo, number: Number(bare[1]) }
  return null
}
