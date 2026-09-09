import type { PullRequestProvider, RepoRef, ReviewPayload } from '../../domain/pullRequests.ts'
import type { Runner } from '../process.ts'
import {
  mapAccountRepo,
  mapComment,
  mapMyReviews,
  REVIEW_FIELDS,
  mapPullRequest,
  parseReference,
  PR_FIELDS,
  type GraphqlPullRequest,
  type GraphqlReview,
  type GraphqlRepository,
  type RestReviewComment,
} from './mapping.ts'

const LIST_OPEN = `
query($owner: String!, $name: String!) {
  viewer { login }
  repository(owner: $owner, name: $name) {
    pullRequests(states: OPEN, first: 100, orderBy: { field: UPDATED_AT, direction: DESC }) {
      nodes { ${PR_FIELDS} }
    }
  }
}`

// GitHub's search resolves team review requests server-side; the repository connection does not.
const LIST_REVIEW_REQUESTED = `
query($q: String!, $endCursor: String) {
  viewer { login }
  search(query: $q, type: ISSUE, first: 100, after: $endCursor) {
    pageInfo { hasNextPage endCursor }
    nodes { ... on PullRequest { ${PR_FIELDS} } }
  }
}`

const GET_ONE = `
query($owner: String!, $name: String!, $number: Int!) {
  viewer { login }
  repository(owner: $owner, name: $name) { pullRequest(number: $number) { ${PR_FIELDS} } }
}`

const VIEWER = `query { viewer { login } }`

const MY_REVIEWS = `
query($owner: String!, $name: String!, $number: Int!) {
  viewer { login }
  repository(owner: $owner, name: $name) { pullRequest(number: $number) { reviews(last: 50) { nodes { ${REVIEW_FIELDS} } } } }
}`

const VIEWER_REPOS = `
query {
  viewer {
    repositories(first: 100, affiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER], orderBy: { field: PUSHED_AT, direction: DESC }) {
      nodes { owner { login } name pullRequests(states: OPEN) { totalCount } }
    }
  }
}`

type ViewerPage = { data: { viewer: { login: string } } }
type ReviewsPage = { data: { viewer: { login: string }; repository: { pullRequest: { reviews: { nodes: GraphqlReview[] } } | null } } }
type ViewerReposPage = { data: { viewer: { repositories: { nodes: GraphqlRepository[] } } } }
type ListPage = { data: { viewer: { login: string }; repository: { pullRequests: { nodes: GraphqlPullRequest[] } } } }
type SearchPage = { data: { viewer: { login: string }; search: { nodes: GraphqlPullRequest[] } } }
type GetPage = { data: { viewer: { login: string }; repository: { pullRequest: GraphqlPullRequest | null } } }

/**
 * GitHub over the `gh` CLI. GraphQL for PR data (one request per repo gives counts and review
 * requests the REST list lacks), REST for review comments (their ids are what `in_reply_to`
 * takes), `gh pr diff` for the patch.
 */
export function ghProvider(run: Runner): PullRequestProvider {
  const slug = (repo: RepoRef) => `${repo.owner}/${repo.name}`

  return {
    kind: 'github',
    cloneUrl: (repo) => `https://github.com/${slug(repo)}.git`,
    parseReference,

    async viewerLogin() {
      const out = await run('gh', ['api', 'graphql', '-f', `query=${VIEWER}`])
      return (JSON.parse(out) as ViewerPage).data.viewer.login
    },

    async listAccountRepos() {
      const out = await run('gh', ['api', 'graphql', '-f', `query=${VIEWER_REPOS}`])
      return (JSON.parse(out) as ViewerReposPage).data.viewer.repositories.nodes.map(mapAccountRepo)
    },

    async listReviewRequested(repo, since) {
      const q = `repo:${slug(repo)} is:pr is:open review-requested:@me updated:>=${since.toISOString().slice(0, 10)}`
      const out = await run('gh', ['api', 'graphql', '--paginate', '--slurp', '-F', `q=${q}`, '-f', `query=${LIST_REVIEW_REQUESTED}`])
      const pages = JSON.parse(out) as SearchPage[]
      return pages.flatMap((page) =>
        page.data.search.nodes.map((n) => ({ ...mapPullRequest(n, page.data.viewer.login), reviewRequested: true })),
      )
    },

    async listOpen(repo) {
      const out = await run('gh', ['api', 'graphql', '-F', `owner=${repo.owner}`, '-F', `name=${repo.name}`, '-f', `query=${LIST_OPEN}`])
      const page = JSON.parse(out) as ListPage
      return page.data.repository.pullRequests.nodes.map((n) => mapPullRequest(n, page.data.viewer.login))
    },

    async get(repo, number) {
      let out: string
      try {
        out = await run('gh', [
          'api', 'graphql',
          '-F', `owner=${repo.owner}`, '-F', `name=${repo.name}`, '-F', `number=${number}`, '-f', `query=${GET_ONE}`,
        ])
      } catch (e) {
        // GraphQL reports a missing PR as an error, which gh turns into a non-zero exit.
        if (e instanceof Error && /Could not resolve to a PullRequest/.test(e.message)) return null
        throw e
      }
      const page = JSON.parse(out) as GetPage
      const node = page.data.repository.pullRequest
      return node ? mapPullRequest(node, page.data.viewer.login) : null
    },

    diff: (repo, number) => run('gh', ['pr', 'diff', String(number), '--repo', slug(repo)]),

    async comments(repo, number) {
      const out = await run('gh', ['api', '--paginate', '--slurp', `repos/${slug(repo)}/pulls/${number}/comments?per_page=100`])
      const pages = JSON.parse(out) as RestReviewComment[][]
      return pages.flat().map(mapComment)
    },

    async myReviews(repo, number) {
      const out = await run('gh', [
        'api', 'graphql',
        '-F', `owner=${repo.owner}`, '-F', `name=${repo.name}`, '-F', `number=${number}`, '-f', `query=${MY_REVIEWS}`,
      ])
      const page = JSON.parse(out) as ReviewsPage
      return mapMyReviews(page.data.repository.pullRequest?.reviews.nodes ?? [], page.data.viewer.login)
    },

    async submitReview(repo, number, payload) {
      const { review, replies } = splitReplies(payload)
      const out = await run('gh', ['api', '-X', 'POST', `repos/${slug(repo)}/pulls/${number}/reviews`, '--input', '-'], {
        input: JSON.stringify(review),
      })
      const { id } = JSON.parse(out) as { id: number }
      // The reviews endpoint has no `in_reply_to`; replies are posted as standalone comments.
      for (const reply of replies) {
        await run('gh', ['api', '-X', 'POST', `repos/${slug(repo)}/pulls/${number}/comments`, '--input', '-'], {
          input: JSON.stringify(reply),
        })
      }
      return { remoteReviewId: String(id) }
    },
  }
}

type RestReview = {
  event: ReviewPayload['verdict']
  body: string
  comments: { path: string; line: number; side: 'LEFT' | 'RIGHT'; start_line?: number; start_side?: 'LEFT' | 'RIGHT'; body: string }[]
}
type RestReply = { body: string; in_reply_to: number }

/** Shape a payload for the REST reviews endpoint; replies go to the comments endpoint. */
export function splitReplies(payload: ReviewPayload): { review: RestReview; replies: RestReply[] } {
  const review: RestReview = { event: payload.verdict, body: payload.body, comments: [] }
  const replies: RestReply[] = []
  for (const c of payload.comments) {
    if (c.inReplyTo !== null) {
      replies.push({ body: c.body, in_reply_to: Number(c.inReplyTo) })
      continue
    }
    review.comments.push({
      path: c.path,
      line: c.line,
      side: c.side,
      body: c.body,
      ...(c.startLine !== null && c.startLine !== c.line ? { start_line: c.startLine, start_side: c.side } : {}),
    })
  }
  return { review, replies }
}
