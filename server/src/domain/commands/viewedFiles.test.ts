import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NotFound } from '../errors.ts'
import type { PullRequest } from '../pullRequests.ts'
import type { Store } from '../store.ts'
import { GITHUB_REPO, NOW, openTestStore, remotePr } from '../testing/fakes.ts'
import { markViewed } from './viewedFiles.ts'

describe('markViewed', () => {
  let store: Store
  let close: () => Promise<void>
  let pr: PullRequest

  beforeEach(async () => {
    ;({ store, close } = await openTestStore())
    const repo = store.repos.insert({ ...GITHUB_REPO, tracked: true, autoReview: false, syncedAt: null, syncError: null })
    pr = store.pullRequests.upsert(repo.id, remotePr({ number: 1 }), {}, NOW)
  })
  afterEach(() => close())

  it('sets a mark and returns all marks of the PR', () => {
    markViewed({ store }, { prId: pr.id, path: 'a.ts', headSha: pr.headSha })
    const marks = markViewed({ store }, { prId: pr.id, path: 'b.ts', headSha: pr.headSha })
    expect(marks).toEqual([
      { path: 'a.ts', headSha: pr.headSha },
      { path: 'b.ts', headSha: pr.headSha },
    ])
  })

  it('clears a mark with a null head', () => {
    markViewed({ store }, { prId: pr.id, path: 'a.ts', headSha: pr.headSha })
    expect(markViewed({ store }, { prId: pr.id, path: 'a.ts', headSha: null })).toEqual([])
  })

  it('rejects an unknown PR', () => {
    expect(() => markViewed({ store }, { prId: 999, path: 'a.ts', headSha: 'x' })).toThrow(NotFound)
  })
})
