import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { RepoRef, ReviewPayload } from '../../domain/pullRequests.ts'
import type { Runner } from '../process.ts'
import { ghProvider, splitReplies } from './ghProvider.ts'

const fixture = (name: string) => readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8')
const repo: RepoRef = { provider: 'github', owner: 'acme', name: 'widgets' }

type Call = { cmd: string; args: string[]; input?: string }

/** A runner that answers from `respond` and records every call. */
function fakeRunner(respond: (call: Call) => string | Error): { run: Runner; calls: Call[] } {
  const calls: Call[] = []
  return {
    calls,
    run: async (cmd, args, opts) => {
      const call = { cmd, args, input: opts?.input }
      calls.push(call)
      const out = respond(call)
      if (out instanceof Error) throw out
      return out
    },
  }
}

describe('ghProvider', () => {
  it('listOpen fetches one page and maps every node against the viewer', async () => {
    const { run, calls } = fakeRunner(() => JSON.stringify(JSON.parse(fixture('graphql_list_open.json'))[0]))
    const prs = await ghProvider(run).listOpen(repo)
    expect(prs.map((p) => [p.number, p.reviewRequested])).toEqual([
      [415, true],
      [416, false],
    ])
    expect(calls[0].cmd).toBe('gh')
    expect(calls[0].args.slice(0, 2)).toEqual(['api', 'graphql'])
    expect(calls[0].args).not.toContain('--paginate')
    expect(calls[0].args).toContain('owner=acme')
  })

  it('listReviewRequested searches with review-requested:@me and marks every result requested', async () => {
    const page = JSON.parse(fixture('graphql_list_open.json'))[0]
    const search = { data: { viewer: page.data.viewer, search: { nodes: page.data.repository.pullRequests.nodes } } }
    const { run, calls } = fakeRunner(() => JSON.stringify([search]))
    const prs = await ghProvider(run).listReviewRequested(repo, new Date('2026-08-10T12:00:00Z'))
    expect(prs.map((p) => [p.number, p.reviewRequested])).toEqual([
      [415, true],
      [416, true],
    ])
    expect(calls[0].args).toContain('--paginate')
    expect(calls[0].args).toContain('q=repo:acme/widgets is:pr is:open review-requested:@me updated:>=2026-08-10')
  })

  it('viewerLogin asks graphql for the viewer', async () => {
    const { run } = fakeRunner(() => JSON.stringify({ data: { viewer: { login: 'seba' } } }))
    expect(await ghProvider(run).viewerLogin()).toBe('seba')
  })

  it('listAccountRepos maps the viewer repositories with their open-PR counts', async () => {
    const { run, calls } = fakeRunner(() => fixture('graphql_viewer_repos.json'))
    expect(await ghProvider(run).listAccountRepos()).toEqual([
      { owner: 'seba', name: 'atelier', openPrCount: 3 },
      { owner: 'acme', name: 'widgets', openPrCount: 0 },
      { owner: 'acme', name: 'gadgets', openPrCount: 12 },
    ])
    expect(calls[0].args.slice(0, 2)).toEqual(['api', 'graphql'])
    expect(calls[0].args.at(-1)).toMatch(/affiliations: \[OWNER, COLLABORATOR, ORGANIZATION_MEMBER\]/)
  })

  it('get maps the node and passes the number as a variable', async () => {
    const { run, calls } = fakeRunner(() => fixture('graphql_get_merged.json'))
    const pr = await ghProvider(run).get(repo, 400)
    expect(pr).toMatchObject({ number: 400, state: 'merged' })
    expect(calls[0].args).toContain('number=400')
  })

  it('get returns null when GraphQL cannot resolve the PR', async () => {
    const { run } = fakeRunner(() => new Error('gh api graphql failed: Could not resolve to a PullRequest with the number of 999.'))
    expect(await ghProvider(run).get(repo, 999)).toBeNull()
  })

  it('get rethrows other failures', async () => {
    const { run } = fakeRunner(() => new Error('gh api graphql failed: HTTP 502'))
    await expect(ghProvider(run).get(repo, 1)).rejects.toThrow('HTTP 502')
  })

  it('diff shells out to gh pr diff for the repo', async () => {
    const { run, calls } = fakeRunner(() => 'diff --git a/x b/x\n')
    expect(await ghProvider(run).diff(repo, 415)).toBe('diff --git a/x b/x\n')
    expect(calls[0].args).toEqual(['pr', 'diff', '415', '--repo', 'acme/widgets'])
  })

  it('comments flattens paginated REST pages', async () => {
    const { run, calls } = fakeRunner(() => fixture('rest_comments.json'))
    const comments = await ghProvider(run).comments(repo, 415)
    expect(comments.map((c) => c.remoteId)).toEqual(['2001', '2002', '2003'])
    expect(calls[0].args).toEqual(['api', '--paginate', '--slurp', 'repos/acme/widgets/pulls/415/comments?per_page=100'])
  })

  it('submitReview posts the review on stdin, then each reply as a comment', async () => {
    const { run, calls } = fakeRunner((call) => (call.args.includes('repos/acme/widgets/pulls/415/reviews') ? fixture('rest_review_created.json') : '{"id": 5}'))
    const payload: ReviewPayload = {
      verdict: 'REQUEST_CHANGES',
      body: 'Please split this.',
      comments: [
        { path: 'src/a.py', line: 3, startLine: 1, side: 'RIGHT', body: 'helper?', inReplyTo: null },
        { path: 'src/a.py', line: 2, startLine: null, side: 'RIGHT', body: 'agreed', inReplyTo: '2001' },
      ],
    }

    const result = await ghProvider(run).submitReview(repo, 415, payload)

    expect(result).toEqual({ remoteReviewId: '3100' })
    expect(calls).toHaveLength(2)
    expect(calls[0].args).toEqual(['api', '-X', 'POST', 'repos/acme/widgets/pulls/415/reviews', '--input', '-'])
    expect(JSON.parse(calls[0].input!)).toEqual({
      event: 'REQUEST_CHANGES',
      body: 'Please split this.',
      comments: [{ path: 'src/a.py', line: 3, side: 'RIGHT', start_line: 1, start_side: 'RIGHT', body: 'helper?' }],
    })
    expect(calls[1].args).toEqual(['api', '-X', 'POST', 'repos/acme/widgets/pulls/415/comments', '--input', '-'])
    expect(JSON.parse(calls[1].input!)).toEqual({ body: 'agreed', in_reply_to: 2001 })
  })
})

describe('splitReplies', () => {
  it('omits start_line when the range is a single line', () => {
    const { review } = splitReplies({
      verdict: 'COMMENT',
      body: '',
      comments: [{ path: 'a', line: 4, startLine: 4, side: 'LEFT', body: 'x', inReplyTo: null }],
    })
    expect(review.comments).toEqual([{ path: 'a', line: 4, side: 'LEFT', body: 'x' }])
  })
})
