import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { RepoRef } from '../../domain/pullRequests.ts'
import { mapAccountRepo, mapComment, mapPullRequest, parseReference, type GraphqlPullRequest, type GraphqlRepository, type RestReviewComment } from './mapping.ts'

const fixture = <T>(name: string): T => JSON.parse(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8')) as T

const repo: RepoRef = { provider: 'github', owner: 'acme', name: 'widgets' }

describe('mapPullRequest', () => {
  const pages = fixture<{ data: { viewer: { login: string }; repository: { pullRequests: { nodes: GraphqlPullRequest[] } } } }[]>('graphql_list_open.json')
  const nodes = pages[0].data.repository.pullRequests.nodes
  const viewer = pages[0].data.viewer.login

  it('maps a review-requested open PR', () => {
    expect(mapPullRequest(nodes[0], viewer)).toEqual({
      number: 415,
      title: 'Add PR mode store',
      author: 'alice',
      url: 'https://github.com/acme/widgets/pull/415',
      body: 'Implements the store.\n\nSpec: docs/pr-mode-design.md\n',
      headRef: 'feat/store',
      baseRef: 'main',
      headSha: '9f2c1c3e6b0a4d5e8f7a6b5c4d3e2f1a0b9c8d7e',
      baseSha: '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b',
      isDraft: false,
      state: 'open',
      additions: 412,
      deletions: 37,
      changedFiles: 9,
      reviewRequested: true,
      createdAt: '2026-09-01T09:12:00Z',
      updatedAt: '2026-09-06T17:45:10Z',
    })
  })

  it('a deleted author becomes ghost and a team-only request is not mine', () => {
    expect(mapPullRequest(nodes[1], viewer)).toMatchObject({ author: 'ghost', isDraft: true, reviewRequested: false })
  })

  it('maps MERGED state', () => {
    const page = fixture<{ data: { viewer: { login: string }; repository: { pullRequest: GraphqlPullRequest } } }>('graphql_get_merged.json')
    expect(mapPullRequest(page.data.repository.pullRequest, page.data.viewer.login)).toMatchObject({ number: 400, state: 'merged', reviewRequested: false })
  })
})

describe('mapAccountRepo', () => {
  const nodes = fixture<{ data: { viewer: { repositories: { nodes: GraphqlRepository[] } } } }>('graphql_viewer_repos.json').data.viewer.repositories.nodes

  it('maps owner, name and the open-PR count', () => {
    expect(nodes.map(mapAccountRepo)).toEqual([
      { owner: 'seba', name: 'atelier', openPrCount: 3 },
      { owner: 'acme', name: 'widgets', openPrCount: 0 },
      { owner: 'acme', name: 'gadgets', openPrCount: 12 },
    ])
  })
})

describe('mapComment', () => {
  const comments = fixture<RestReviewComment[][]>('rest_comments.json').flat()

  it('maps a top-level single-line comment', () => {
    expect(mapComment(comments[0])).toEqual({
      remoteId: '2001',
      author: 'bob',
      path: 'src/a.py',
      line: 2,
      startLine: null,
      side: 'RIGHT',
      body: 'Why not keep the old name?',
      inReplyTo: null,
      createdAt: '2026-09-03T11:00:00Z',
      originalLine: 2,
      originalCommitSha: '9f2c1c3e6b0a4d5e8f7a6b5c4d3e2f1a0b9c8d7e',
    })
  })

  it('an outdated comment has no current line but keeps where it was left', () => {
    const outdated = { ...comments[0], line: null, original_line: 234, original_commit_id: 'old-sha' }
    expect(mapComment(outdated)).toMatchObject({ line: null, originalLine: 234, originalCommitSha: 'old-sha' })
  })

  it('a reply keeps its parent id as a string', () => {
    expect(mapComment(comments[1])).toMatchObject({ remoteId: '2002', inReplyTo: '2001', author: 'ghost' })
  })

  it('a multi-line comment keeps its start line', () => {
    expect(mapComment(comments[2])).toMatchObject({ line: 3, startLine: 1, side: 'RIGHT' })
  })
})

describe('parseReference', () => {
  const other = { provider: 'github', owner: 'octo', name: 'cat' }
  it.each([
    ['https://github.com/octo/cat/pull/415', { repo: other, number: 415 }],
    ['https://github.com/octo/cat/pull/415/files#diff-abc', { repo: other, number: 415 }],
    ['http://github.com/octo/cat/pull/7?x=1', { repo: other, number: 7 }],
    ['octo/cat#415', { repo: other, number: 415 }],
    ['#415', { repo, number: 415 }],
    ['415', { repo, number: 415 }],
    ['  415  ', { repo, number: 415 }],
  ])('%s', (input, expected) => {
    expect(parseReference(input, repo)).toEqual(expected)
  })

  it.each(['', 'abc', 'octo/cat', 'https://gitlab.com/octo/cat/-/merge_requests/1', 'https://github.com/octo/cat/issues/3', '#'])(
    '%s is not a reference',
    (input) => {
      expect(parseReference(input, repo)).toBeNull()
    },
  )
})
