import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NotFound } from '../errors.ts'
import type { Store } from '../store.ts'
import { fakeProvider, fixedClock, GITHUB_REPO, NOW, openTestStore, remotePr, type FakeProvider } from '../testing/fakes.ts'
import { addPullRequests, listOpenPreviews, resolvePullRequest, type AddPullRequestsDeps } from './addPullRequests.ts'

describe('addPullRequests / resolvePullRequest', () => {
  let store: Store
  let close: () => Promise<void>
  let provider: FakeProvider
  let deps: AddPullRequestsDeps
  let repoId: number

  beforeEach(async () => {
    ;({ store, close } = await openTestStore())
    provider = fakeProvider([remotePr({ number: 10, reviewRequested: false }), remotePr({ number: 11, reviewRequested: false })])
    deps = { store, providers: { github: provider, gitlab: provider }, clock: fixedClock() }
    repoId = store.repos.insert({ ...GITHUB_REPO, tracked: true, autoReview: false, syncedAt: null, syncError: null }).id
  })
  afterEach(() => close())

  describe('addPullRequests', () => {
    it('stores each PR as user-added with diff and comments', async () => {
      provider.remoteComments.set(10, [
        { remoteId: 'c1', author: 'bob', path: 'src/a.py', line: 1, startLine: null, side: 'RIGHT', body: 'x', inReplyTo: null, createdAt: NOW, originalLine: null, originalCommitSha: null },
      ])

      const prs = await addPullRequests(deps, { repoId, numbers: [10, 11], reviewOnOpen: true })

      expect(prs.map((p) => [p.number, p.addedByUser, p.reviewOnOpen])).toEqual([
        [10, true, true],
        [11, true, true],
      ])
      expect(store.diffs.get(prs[0].id, prs[0].headSha)).not.toBeNull()
      expect(store.comments.list(prs[0].id)).toHaveLength(1)
      expect(store.views.inbox(repoId).map((r) => r.number)).toEqual([10, 11])
    })

    it('one missing number fails the whole request before anything is written', async () => {
      await expect(addPullRequests(deps, { repoId, numbers: [10, 404], reviewOnOpen: false })).rejects.toBeInstanceOf(NotFound)
      expect(store.pullRequests.listByRepo(repoId, {})).toEqual([])
    })

    it('throws NotFound for an unknown repo', async () => {
      await expect(addPullRequests(deps, { repoId: 99, numbers: [10], reviewOnOpen: false })).rejects.toBeInstanceOf(NotFound)
    })
  })

  describe('resolvePullRequest', () => {
    it('returns a preview for a bare number in the given repo', async () => {
      const result = await resolvePullRequest(deps, { repoId, input: '#10' })
      expect(result).toMatchObject({ repoId, preview: { repo: 'acme/widgets', number: 10, stored: false } })
    })

    it('marks a PR already in the inbox as stored', async () => {
      await addPullRequests(deps, { repoId, numbers: [10], reviewOnOpen: false })
      expect(await resolvePullRequest(deps, { repoId, input: '10' })).toMatchObject({ preview: { stored: true } })
    })

    it.each([
      ['not a reference', 'garbage'],
      ['a number the provider does not know', '404'],
    ])('returns null for %s', async (_label, input) => {
      expect(await resolvePullRequest(deps, { repoId, input })).toBeNull()
    })

    it('reports the repo when the reference points at one we do not track', async () => {
      const other = { provider: 'github' as const, owner: 'octo', name: 'cat' }
      provider.parseReference = () => ({ repo: other, number: 3 })
      expect(await resolvePullRequest(deps, { repoId, input: 'octo/cat#3' })).toEqual({ untrackedRepo: other })

      const untracked = store.repos.insert({ ...other, tracked: false, autoReview: false, syncedAt: null, syncError: null })
      expect(await resolvePullRequest(deps, { repoId, input: 'octo/cat#3' })).toEqual({ untrackedRepo: other })
      store.repos.update(untracked.id, { tracked: true })
      provider.remote.set(3, remotePr({ number: 3 }))
      expect(await resolvePullRequest(deps, { repoId, input: 'octo/cat#3' })).toMatchObject({ repoId: untracked.id, preview: { repo: 'octo/cat', number: 3 } })
    })
  })

  describe('listOpenPreviews', () => {
    it('lists open PRs that are neither review-requested nor already stored', async () => {
      provider.remote.set(12, remotePr({ number: 12, reviewRequested: true }))
      provider.remote.set(13, remotePr({ number: 13, reviewRequested: false, state: 'merged' }))
      await addPullRequests(deps, { repoId, numbers: [11], reviewOnOpen: false })

      const previews = await listOpenPreviews(deps, { repoId })

      expect(previews.map((p) => p.number)).toEqual([10])
      expect(previews[0]).toMatchObject({ repo: 'acme/widgets', stored: false })
    })

    it('rejects an unknown repo', async () => {
      await expect(listOpenPreviews(deps, { repoId: 999 })).rejects.toThrow(NotFound)
    })
  })
})
