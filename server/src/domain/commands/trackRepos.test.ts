import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Store } from '../store.ts'
import { NotFound } from '../errors.ts'
import { GITHUB_REPO, NOW, openTestStore, remotePr } from '../testing/fakes.ts'
import { trackRepo, untrackRepo, updateRepo } from './trackRepos.ts'

describe('trackRepo / untrackRepo', () => {
  let store: Store
  let close: () => Promise<void>
  beforeEach(async () => {
    ;({ store, close } = await openTestStore())
  })
  afterEach(() => close())

  it.each([true, false])('inserts a new tracked repo with autoReview=%s', (autoReview) => {
    const repo = trackRepo({ store }, { ...GITHUB_REPO, autoReview })
    expect(store.repos.get(repo.id)).toEqual({ ...GITHUB_REPO, id: repo.id, tracked: true, autoReview, syncedAt: null, syncError: null })
  })

  it('untrack keeps the row and its PRs; re-track re-enables it and applies the new autoReview', () => {
    const repo = trackRepo({ store }, { ...GITHUB_REPO, autoReview: false })
    store.transaction(() => store.pullRequests.upsert(repo.id, remotePr(), {}, NOW))

    untrackRepo({ store }, { repoId: repo.id })
    expect(store.repos.get(repo.id)?.tracked).toBe(false)
    expect(store.pullRequests.listByRepo(repo.id, {})).toHaveLength(1)

    expect(trackRepo({ store }, { ...GITHUB_REPO, autoReview: true })).toMatchObject({ id: repo.id, tracked: true, autoReview: true })
    expect(store.repos.get(repo.id)).toMatchObject({ tracked: true, autoReview: true })
    expect(store.repos.list()).toHaveLength(1)
  })

  it('untrack of an unknown repo throws NotFound', () => {
    expect(() => untrackRepo({ store }, { repoId: 42 })).toThrow(NotFound)
  })
})

describe('updateRepo', () => {
  let store: Store
  let close: () => Promise<void>
  beforeEach(async () => {
    ;({ store, close } = await openTestStore())
  })
  afterEach(() => close())

  it('toggles autoReview and returns the updated row', () => {
    const repo = trackRepo({ store }, { ...GITHUB_REPO, autoReview: false })
    expect(updateRepo({ store }, { repoId: repo.id, autoReview: true })).toEqual({ ...repo, autoReview: true })
    expect(store.repos.get(repo.id)?.autoReview).toBe(true)
  })

  it('leaves autoReview alone when the patch omits it', () => {
    const repo = trackRepo({ store }, { ...GITHUB_REPO, autoReview: true })
    expect(updateRepo({ store }, { repoId: repo.id })).toEqual(repo)
    expect(store.repos.get(repo.id)?.autoReview).toBe(true)
  })

  it('throws NotFound for an unknown repo', () => {
    expect(() => updateRepo({ store }, { repoId: 42, autoReview: true })).toThrow(NotFound)
  })
})
