import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cachePrDiff } from '../domain/actions/cachePrDiff.ts'
import { NotFound, WorktreeMissing } from '../domain/errors.ts'
import type { PullRequest, Repo } from '../domain/pullRequests.ts'
import type { Store } from '../domain/store.ts'
import { fakeChatHub, GITHUB_REPO, memoryEvents, NOW, openTestStore, remotePr, SAMPLE_PATCH, type MemoryEvents } from '../domain/testing/fakes.ts'
import type { OpencodeChatOptions } from '../infrastructure/opencodeChat.ts'
import { patchFileSource } from '../infrastructure/diffSources.ts'
import { fixedScope, prScopes, type ScopeRegistry } from './scopes.ts'

describe('fixedScope', () => {
  it('serves its one id and stamps chat events with it', async () => {
    const hub = fakeChatHub()
    const events = memoryEvents()
    const scopes = fixedScope('local', patchFileSource('/x.diff'), hub, events)

    const scope = await scopes.resolve('local')
    hub.emit({ type: 'chat.idle', thread: 'dock' })

    expect(scope.chat).toBe(hub)
    expect(events.events).toEqual([{ type: 'chat.idle', thread: 'dock', scope: 'local' }])
    await expect(scopes.resolve('pr:1')).rejects.toThrow(NotFound)
  })
})

describe('prScopes', () => {
  let store: Store
  let close: () => Promise<void>
  let events: MemoryEvents
  let opened: OpencodeChatOptions[]
  let scopes: ScopeRegistry
  let repo: Repo
  let pr: PullRequest

  beforeEach(async () => {
    ;({ store, close } = await openTestStore())
    events = memoryEvents()
    opened = []
    scopes = prScopes({
      store,
      opencodeUrl: 'http://opencode.test',
      events,
      openChat: async (opts) => {
        opened.push(opts)
        return fakeChatHub()
      },
    })
    repo = store.repos.insert({ ...GITHUB_REPO, tracked: true, autoReview: false, syncedAt: null, syncError: null })
    pr = store.pullRequests.upsert(repo.id, remotePr({ number: 3, title: 'Add thing', body: 'Because.' }), {}, NOW)
    store.transaction(() => cachePrDiff(store.diffs, repo, pr, SAMPLE_PATCH, NOW))
  })
  afterEach(() => close())

  it('hands the chat a persisted session map keyed by the PR scope, so a restart reopens the transcript', async () => {
    store.transaction(() => store.pullRequests.update(pr.id, { worktreePath: '/wt/3' }))
    await scopes.resolve(`pr:${pr.id}`)

    const sessions = opened[0]!.sessions!
    sessions.set({ threadId: 'dock', sessionId: 'ses_1', anchor: null })
    sessions.set({ threadId: 'line:src/a.py:2', sessionId: 'ses_2', anchor: { path: 'src/a.py', startLine: 2, endLine: 2, side: 'RIGHT', text: 'x' } })

    expect(store.chatSessions.list(`pr:${pr.id}`)).toEqual([
      { threadId: 'dock', sessionId: 'ses_1', anchor: null },
      { threadId: 'line:src/a.py:2', sessionId: 'ses_2', anchor: { path: 'src/a.py', startLine: 2, endLine: 2, side: 'RIGHT', text: 'x' } },
    ])
    expect(sessions.list()).toEqual(store.chatSessions.list(`pr:${pr.id}`))
    expect(store.chatSessions.list('pr:999')).toEqual([])
  })

  it('builds the scope from the cached diff and the worktree, once per PR', async () => {
    store.transaction(() => store.pullRequests.update(pr.id, { worktreePath: '/wt/3' }))

    const [first, second] = await Promise.all([scopes.resolve(`pr:${pr.id}`), scopes.resolve(`pr:${pr.id}`)])

    expect(first).toBe(second)
    expect(first.source.ref).toEqual({ kind: 'pr', repo: 'acme/widgets', number: 3, headSha: pr.headSha })
    await expect(first.source.read()).resolves.toBe(SAMPLE_PATCH)
    expect(opened).toHaveLength(1)
    expect(opened[0]).toMatchObject({ directory: '/wt/3', title: 'acme/widgets#3', baseUrl: 'http://opencode.test' })
    expect(opened[0].systemContext).toContain('Add thing')
    expect(opened[0].systemContext).toContain('Because.')
    expect(opened[0].systemContext).toContain('- src/a.py')
    expect(opened[0].systemContext).not.toContain('+new')
  })

  it('stamps forwarded chat events with the PR scope', async () => {
    store.transaction(() => store.pullRequests.update(pr.id, { worktreePath: '/wt/3' }))
    const scope = await scopes.resolve(`pr:${pr.id}`)

    ;(scope.chat as ReturnType<typeof fakeChatHub>).emit({ type: 'chat.idle', thread: 'dock' })

    expect(events.events).toEqual([{ type: 'chat.idle', thread: 'dock', scope: `pr:${pr.id}` }])
  })

  it('rejects with WorktreeMissing until the PR is opened, then succeeds', async () => {
    await expect(scopes.resolve(`pr:${pr.id}`)).rejects.toThrow(WorktreeMissing)
    store.transaction(() => store.pullRequests.update(pr.id, { worktreePath: '/wt/3' }))
    await expect(scopes.resolve(`pr:${pr.id}`)).resolves.toBeDefined()
  })

  it.each(['local', 'pr:abc', 'pr:999'])('rejects %s with NotFound', async (id) => {
    await expect(scopes.resolve(id)).rejects.toThrow(NotFound)
  })
})
