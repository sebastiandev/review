import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NotFound } from '../errors.ts'
import type { PullRequest } from '../pullRequests.ts'
import type { Store } from '../store.ts'
import {
  fakeProvider,
  fakeWorktrees,
  GITHUB_REPO,
  memoryEvents,
  NOW,
  openTestStore,
  remotePr,
  type FakeWorktrees,
  type MemoryEvents,
} from '../testing/fakes.ts'
import { makeOpenPullRequest, type OpenPullRequest } from './openPullRequest.ts'

describe('openPullRequest', () => {
  let store: Store
  let close: () => Promise<void>
  let worktrees: FakeWorktrees
  let events: MemoryEvents
  let open: OpenPullRequest
  let pr: PullRequest

  beforeEach(async () => {
    ;({ store, close } = await openTestStore())
    worktrees = fakeWorktrees()
    events = memoryEvents()
    const provider = fakeProvider()
    open = makeOpenPullRequest({ store, providers: { github: provider, gitlab: provider }, worktrees, events })
    const repo = store.repos.insert({ ...GITHUB_REPO, tracked: true, autoReview: false, syncedAt: null, syncError: null })
    pr = store.pullRequests.upsert(repo.id, remotePr({ number: 415 }), {}, NOW)
  })
  afterEach(() => close())

  it('creates the worktree, stores the path and emits stages in order', async () => {
    const { path } = await open({ prId: pr.id })

    expect(path).toBe('/wt/acme/widgets/415')
    expect(store.pullRequests.get(pr.id)?.worktreePath).toBe(path)
    expect(worktrees.created[0]).toMatchObject({ number: 415, headSha: pr.headSha, cloneUrl: 'https://github.com/acme/widgets.git' })
    expect(events.events).toEqual([
      { type: 'worktree.progress', prId: pr.id, stage: 'cloning' },
      { type: 'worktree.progress', prId: pr.id, stage: 'fetching' },
      { type: 'worktree.progress', prId: pr.id, stage: 'checking-out' },
      { type: 'worktree.progress', prId: pr.id, stage: 'ready' },
      { type: 'worktree.ready', prId: pr.id, path },
    ])
  })

  it('returns the existing path without creating when it is still on disk', async () => {
    const first = await open({ prId: pr.id })
    events.events.length = 0

    expect(await open({ prId: pr.id })).toEqual(first)
    expect(worktrees.created).toHaveLength(1)
    expect(events.events).toEqual([{ type: 'worktree.ready', prId: pr.id, path: first.path }])
  })

  it('recreates when the stored path vanished from disk', async () => {
    const first = await open({ prId: pr.id })
    worktrees.paths.delete(first.path)

    await open({ prId: pr.id })
    expect(worktrees.created).toHaveLength(2)
  })

  it('concurrent calls for one PR share a single creation', async () => {
    let release!: () => void
    worktrees.gate = new Promise<void>((r) => (release = r))

    const a = open({ prId: pr.id })
    const b = open({ prId: pr.id })
    release()

    expect(await Promise.all([a, b])).toEqual([{ path: '/wt/acme/widgets/415' }, { path: '/wt/acme/widgets/415' }])
    expect(worktrees.created).toHaveLength(1)
    expect(events.ofType('worktree.ready')).toHaveLength(1)
  })

  it('emits worktree.failed, leaves the path unset and rethrows when git fails', async () => {
    worktrees.failWith = new Error('clone exploded')

    await expect(open({ prId: pr.id })).rejects.toThrow('clone exploded')

    expect(store.pullRequests.get(pr.id)?.worktreePath).toBeNull()
    expect(events.ofType('worktree.failed')).toEqual([{ type: 'worktree.failed', prId: pr.id, message: 'clone exploded' }])
    // The failed attempt is no longer in flight; a retry creates again.
    worktrees.failWith = null
    await open({ prId: pr.id })
    expect(worktrees.created).toHaveLength(2)
  })

  it('throws NotFound for an unknown PR', async () => {
    await expect(open({ prId: 999 })).rejects.toBeInstanceOf(NotFound)
  })
})
