import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Store } from '../store.ts'
import { NotFound } from '../errors.ts'
import { GITHUB_REPO, NOW, openTestStore, remotePr } from '../testing/fakes.ts'
import { trackRepo, untrackRepo } from './trackRepos.ts'

describe('trackRepo / untrackRepo', () => {
  let store: Store
  let close: () => Promise<void>
  beforeEach(async () => {
    ;({ store, close } = await openTestStore())
  })
  afterEach(() => close())

  it('inserts a new tracked repo', () => {
    const repo = trackRepo({ store }, GITHUB_REPO)
    expect(store.repos.get(repo.id)).toEqual({ ...GITHUB_REPO, id: repo.id, tracked: true, autoReview: false, syncedAt: null, syncError: null })
  })

  it('untrack keeps the row and its PRs; re-track re-enables it', () => {
    const repo = trackRepo({ store }, GITHUB_REPO)
    store.transaction(() => store.pullRequests.upsert(repo.id, remotePr(), {}, NOW))

    untrackRepo({ store }, { repoId: repo.id })
    expect(store.repos.get(repo.id)?.tracked).toBe(false)
    expect(store.pullRequests.listByRepo(repo.id, {})).toHaveLength(1)

    expect(trackRepo({ store }, GITHUB_REPO)).toMatchObject({ id: repo.id, tracked: true })
    expect(store.repos.list()).toHaveLength(1)
  })

  it('untrack of an unknown repo throws NotFound', () => {
    expect(() => untrackRepo({ store }, { repoId: 42 })).toThrow(NotFound)
  })
})
