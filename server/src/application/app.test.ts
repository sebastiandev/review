import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AttentionThread, RemoteCommentRow, AgentReviewDetail, InboxRow, PastReviewRow, PrDetail, RepoSummary, ServerEvent, UserSettings } from '@review/shared'
import type { DraftComment, Submission } from '../domain/review.ts'
import type { Repo } from '../domain/pullRequests.ts'
import type { Store } from '../domain/store.ts'
import {
  fakeChatHub,
  fakeCli,
  fakeCredentialStore,
  fakeDeviceFlow,
  fakeProvider,
  fakeRunner,
  fakeWorktrees,
  fixedClock,
  memoryEvents,
  memoryPayloads,
  noSleep,
  openTestStore,
  remotePr,
  SAMPLE_PATCH,
  type FakeCredentialStore,
  type FakeDeviceFlow,
  type FakeProvider,
  type FakeRunner,
  type FakeWorktrees,
  type MemoryEvents,
} from '../domain/testing/fakes.ts'
import { prMode } from './prMode.ts'

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

describe('PR mode app', () => {
  let store: Store
  let close: () => Promise<void>
  let provider: FakeProvider
  let worktrees: FakeWorktrees
  let runner: FakeRunner
  let events: MemoryEvents
  let credentials: FakeCredentialStore
  let deviceFlow: FakeDeviceFlow
  let app: ReturnType<typeof prMode>['app']
  let accounts: ReturnType<typeof prMode>['accounts']
  let hub: ReturnType<typeof fakeChatHub>

  const PAYLOAD = JSON.stringify({
    pr: 415,
    repo: 'acme/widgets',
    event: 'COMMENT',
    body: 'One remark.',
    comments: [{ path: 'src/a.py', line: 2, side: 'RIGHT', body: 'Note: consider renaming' }],
  })

  beforeEach(async () => {
    ;({ store, close } = await openTestStore())
    provider = fakeProvider([remotePr({ number: 415, title: 'Fix widgets' })])
    worktrees = fakeWorktrees()
    const payloads = memoryPayloads()
    runner = fakeRunner({ kind: 'reply', text: PAYLOAD })
    events = memoryEvents()
    credentials = fakeCredentialStore()
    deviceFlow = fakeDeviceFlow()
    hub = fakeChatHub()
    ;({ app, accounts } = prMode({
      store,
      providers: { github: provider, gitlab: provider },
      worktrees,
      runner,
      payloads,
      fileExists: async () => false,
      events,
      clock: fixedClock(),
      credentials,
      deviceFlow,
      cli: fakeCli(),
      sleep: noSleep,
      opencodeUrl: 'http://opencode.test',
      directory: '/tmp',
      staticDir: null,
      openChat: async () => hub,
    }))
  })
  afterEach(() => close())

  /** Resolves when the bus carries an event of `type`. */
  const nextEvent = <T extends ServerEvent['type']>(type: T) =>
    new Promise<Extract<ServerEvent, { type: T }>>((resolve) => {
      const off = events.subscribe((e) => {
        if (e.type !== type) return
        off()
        resolve(e as Extract<ServerEvent, { type: T }>)
      })
    })

  const trackRepo = async (): Promise<Repo> => {
    const res = await app.request('/api/repos', json('POST', { provider: 'github', owner: 'acme', name: 'widgets', autoReview: false }))
    expect(res.status).toBe(201)
    return res.json()
  }

  const syncRepo = async (repoId: number) => {
    const finished = nextEvent('sync.finished')
    const res = await app.request(`/api/repos/${repoId}/sync`, { method: 'POST' })
    expect(res.status).toBe(202)
    await finished
  }

  /** A remote inline comment in the fixture's diff. */
  const conversationComment = (remoteId: string, author: string, body: string, inReplyTo: string | null = null): RemoteCommentRow => ({
    remoteId, author, body, inReplyTo, path: 'src/a.py', line: 2, startLine: null, side: 'RIGHT',
    createdAt: `2026-09-07T09:00:0${remoteId}Z`, originalLine: null, originalCommitSha: null,
  })

  it('keeps a reply unread until the displayed comment is acknowledged, including after resync', async () => {
    provider.remoteComments.set(415, [conversationComment('1', 'me', 'Please explain'), conversationComment('2', 'alice', 'Explained', '1')])
    const repo = await trackRepo()
    await syncRepo(repo.id)
    const before: AttentionThread[] = await (await app.request(`/api/repos/${repo.id}/attention`)).json()
    expect(before[0]).toMatchObject({ awaitingReply: false, unreadReplies: ['2'], mine: true })
    const prId = before[0]!.prId
    await app.request(`/api/prs/${prId}`)
    expect((await (await app.request(`/api/repos/${repo.id}/attention`)).json())[0].unreadReplies).toEqual(['2'])
    const read = await app.request(`/api/prs/${prId}/comments/read`, json('POST', { comments: [{ remoteId: '2', body: 'Explained' }] }))
    expect(read.status).toBe(200)
    await syncRepo(repo.id)
    expect((await (await app.request(`/api/repos/${repo.id}/attention`)).json())[0].unreadReplies).toEqual([])
    provider.remoteComments.get(415)!.push(conversationComment('3', 'alice', 'Another reply', '1'))
    await syncRepo(repo.id)
    expect((await (await app.request(`/api/repos/${repo.id}/attention`)).json())[0].unreadReplies).toEqual(['3'])
  })

  it.each([
    ['own follow-up', [conversationComment('1', 'me', 'Question'), conversationComment('2', 'alice', 'Answer', '1'), conversationComment('3', 'me', 'Follow-up', '1')], true],
    ['someone answered', [conversationComment('1', 'me', 'Question'), conversationComment('2', 'alice', 'Answer', '1')], false],
  ] as const)('classifies awaiting replies by the latest own comment: %s', async (_name, comments, awaitingReply) => {
    provider.remoteComments.set(415, [...comments])
    const repo = await trackRepo()
    await syncRepo(repo.id)
    const rows = await (await app.request(`/api/repos/${repo.id}/attention`)).json()
    expect(rows[0].awaitingReply).toBe(awaitingReply)
  })

  it('includes direct mentions in general discussion without requiring my participation', async () => {
    provider.remoteComments.set(415, [{ ...conversationComment('1', 'alice', '@me please check'), kind: 'discussion', path: '', line: null, side: null }])
    const repo = await trackRepo()
    await syncRepo(repo.id)
    const rows = await (await app.request(`/api/repos/${repo.id}/attention`)).json()
    expect(rows).toMatchObject([{ rootId: 'discussion', mine: false, unreadMentions: ['1'], unreadReplies: [] }])
  })

  it('discovers unread description mentions and acknowledges their displayed version', async () => {
    provider.remote.get(415)!.body = '@me could you review this?'
    const repo = await trackRepo()
    await syncRepo(repo.id)
    const [thread] = await (await app.request(`/api/repos/${repo.id}/attention`)).json()
    expect(thread).toMatchObject({ rootId: 'description', unreadMentions: ['description'] })
    await app.request(`/api/prs/${thread.prId}/comments/read`, json('POST', { comments: [{ remoteId: 'description', body: provider.remote.get(415)!.body }] }))
    expect((await (await app.request(`/api/repos/${repo.id}/attention`)).json())[0].unreadMentions).toEqual([])
  })

  it('does not let stale acknowledgements mark edited comments read', async () => {
    provider.remoteComments.set(415, [conversationComment('1', 'alice', '@me new text')])
    const repo = await trackRepo()
    await syncRepo(repo.id)
    const [thread] = await (await app.request(`/api/repos/${repo.id}/attention`)).json()
    await app.request(`/api/prs/${thread.prId}/comments/read`, json('POST', { comments: [{ remoteId: '1', body: '@me old text' }] }))
    expect((await (await app.request(`/api/repos/${repo.id}/attention`)).json())[0].unreadMentions).toEqual(['1'])
  })

  it('isolates attention and read receipts by repository and authenticated viewer', async () => {
    provider.remoteComments.set(415, [conversationComment('1', 'alice', '@me and @bob')])
    const repo = await trackRepo()
    await syncRepo(repo.id)
    const other = await (await app.request('/api/repos', json('POST', { provider: 'github', owner: 'other', name: 'repo', autoReview: false }))).json()
    expect(await (await app.request(`/api/repos/${other.id}/attention`)).json()).toEqual([])
    const [thread] = await (await app.request(`/api/repos/${repo.id}/attention`)).json()
    await app.request(`/api/prs/${thread.prId}/comments/read`, json('POST', { comments: [{ remoteId: '1', body: '@me and @bob' }] }))
    provider.viewer = 'bob'
    expect((await (await app.request(`/api/repos/${repo.id}/attention`)).json())[0].unreadMentions).toEqual(['1'])
  })

  it('returns not found for attention requests on unknown repos and PRs', async () => {
    expect((await app.request('/api/repos/999/attention')).status).toBe(404)
    expect((await app.request('/api/prs/999/comments/read', json('POST', { comments: [] }))).status).toBe(404)
  })

  it('walks a review from tracking the repo to the submitted review', async () => {
    expect(await (await app.request('/api/repos')).json()).toEqual([])

    const repo = await trackRepo()
    expect(repo).toMatchObject({ id: 1, provider: 'github', owner: 'acme', name: 'widgets', tracked: true })
    await syncRepo(repo.id)

    const repos: RepoSummary[] = await (await app.request('/api/repos')).json()
    expect(repos).toMatchObject([{ id: repo.id, activeCount: 1, reviewRequestedCount: 1 }])
    const inbox: InboxRow[] = await (await app.request(`/api/repos/${repo.id}/prs`)).json()
    expect(inbox).toMatchObject([{ number: 415, title: 'Fix widgets', hasWorktree: false }])
    const [pr] = inbox

    // The scope needs a worktree; opening the PR creates it.
    const beforeOpen = await app.request(`/api/scopes/pr:${pr.id}/diff`)
    expect(beforeOpen.status).toBe(409)
    expect(await beforeOpen.json()).toEqual({ code: 'worktree_missing' })

    const ready = nextEvent('worktree.ready')
    expect((await app.request(`/api/prs/${pr.id}/open`, { method: 'POST' })).status).toBe(202)
    expect(await ready).toMatchObject({ prId: pr.id, path: '/wt/acme/widgets/415' })

    const diff = await app.request(`/api/scopes/pr:${pr.id}/diff`)
    expect(diff.status).toBe(200)
    expect(await diff.json()).toMatchObject({
      source: { kind: 'pr', repo: 'acme/widgets', number: 415, headSha: pr.headSha },
      files: [{ path: 'src/a.py' }],
    })
    expect(await (await app.request(`/api/scopes/pr:${pr.id}/threads`)).json()).toEqual([{ id: 'dock', anchor: null }])
    expect((await app.request(`/api/scopes/pr:${pr.id}/chat/dock/abort`, { method: 'POST' })).status).toBe(204)
    expect(hub.aborted).toEqual(['dock'])
    expect((await app.request(`/api/scopes/pr:${pr.id}/chat/nope/abort`, { method: 'POST' })).status).toBe(404)

    const detail = await (await app.request(`/api/prs/${pr.id}`)).json()
    expect(detail).toMatchObject({ pr: { id: pr.id, worktreePath: '/wt/acme/widgets/415' }, draft: null })

    // A comment on a line the diff does not have blocks submission until fixed.
    const created = await app.request(
      `/api/prs/${pr.id}/comments`,
      json('POST', { path: 'src/a.py', line: 40, startLine: null, side: 'RIGHT', body: 'Hmm' }),
    )
    expect(created.status).toBe(201)
    const comment: DraftComment = await created.json()
    expect(comment).toMatchObject({ origin: 'human', anchorValid: false })

    const rejected = await app.request(`/api/prs/${pr.id}/submit`, json('POST', { verdict: 'COMMENT', body: 'Notes' }))
    expect(rejected.status).toBe(409)
    expect(await rejected.json()).toEqual({ code: 'invalid_anchors', ids: [comment.id] })

    const deselected = await app.request(`/api/prs/${pr.id}/comments/${comment.id}`, json('PATCH', { selected: false }))
    expect(await deselected.json()).toMatchObject({ id: comment.id, selected: false })
    const fixed = await app.request(
      `/api/prs/${pr.id}/comments`,
      json('POST', { path: 'src/a.py', line: 2, startLine: null, side: 'RIGHT', body: 'Rename this' }),
    )
    expect(fixed.status).toBe(201)

    const submitted = await app.request(`/api/prs/${pr.id}/submit`, json('POST', { verdict: 'COMMENT', body: 'Notes' }))
    expect(submitted.status).toBe(200)
    const submission: Submission = await submitted.json()
    expect(submission).toMatchObject({ verdict: 'COMMENT', remoteReviewId: 'review-1' })
    expect(provider.submitted[0].payload.comments).toEqual([
      { path: 'src/a.py', line: 2, startLine: null, side: 'RIGHT', body: 'Rename this', inReplyTo: null },
    ])

    const reviews: PastReviewRow[] = await (await app.request('/api/reviews')).json()
    expect(reviews).toMatchObject([{ submissionId: submission.id, prId: pr.id, repo: 'acme/widgets', number: 415, verdict: 'COMMENT', agentAgreement: 'not run' }])
    expect(await (await app.request('/api/reviews?verdict=APPROVE')).json()).toEqual([])
  })

  it.each(['complete', 'incomplete', 'unknown'] as const)('shows %s coverage and keeps the agent finding into the draft', async (coverage) => {
    const repo = await trackRepo()
    await syncRepo(repo.id)
    const [pr]: InboxRow[] = await (await app.request(`/api/repos/${repo.id}/prs`)).json()
    runner.behaviour = { kind: 'reply', text: JSON.stringify({ ...JSON.parse(PAYLOAD), coverage, commit_id: 'sha-415-a' }) }
    const ready = nextEvent('worktree.ready')
    await app.request(`/api/prs/${pr.id}/open`, { method: 'POST' })
    await ready

    const reviewReady = nextEvent('review.ready')
    const started = await app.request(`/api/prs/${pr.id}/review`, json('POST', { agent: 'reviewer' }))
    expect(started.status).toBe(202)
    expect(await started.json()).toEqual({ status: 'queued' })
    expect(await reviewReady).toMatchObject({ prId: pr.id, verdict: 'COMMENT', findingCount: 1 })
    expect(runner.runs).toMatchObject([{ directory: '/wt/acme/widgets/415', agent: 'reviewer', model: null, variant: null }])

    const runs: AgentReviewDetail[] = await (await app.request(`/api/prs/${pr.id}/reviews`)).json()
    expect(runs).toMatchObject([{ review: { status: 'ready', coverage, verdict: 'COMMENT', summary: 'One remark.', agent: 'reviewer' }, findings: [{ line: 2, severity: 'note' }] }])
    const [{ review, findings }] = runs

    const kept = await app.request(`/api/prs/${pr.id}/findings/${findings[0].id}/keep`, { method: 'POST' })
    expect(kept.status).toBe(201)
    expect(await kept.json()).toMatchObject({ origin: 'agent', findingId: findings[0].id, body: 'Note: consider renaming' })
    const detail: PrDetail = await (await app.request(`/api/prs/${pr.id}`)).json()
    expect(detail.agentReview).toEqual({ review, findings })
    expect(detail.draft?.comments).toMatchObject([{ origin: 'agent', findingId: findings[0].id }])
    expect(detail.pr).toMatchObject({ agentStatus: 'ready', agentVerdict: 'COMMENT', agentCoverage: coverage })
    const inbox: InboxRow[] = await (await app.request(`/api/repos/${repo.id}/prs`)).json()
    expect(inbox.find((row) => row.id === pr.id)?.agentCoverage).toBe(coverage)

    expect((await app.request(`/api/prs/${pr.id}/findings/${findings[0].id}/keep`, { method: 'DELETE' })).status).toBe(204)
    const all = await app.request(`/api/prs/${pr.id}/reviews/${review.id}/keep-all`, { method: 'POST' })
    expect(await all.json()).toMatchObject([{ findingId: findings[0].id }])
  })

  it('starts a review on worktree.ready for PRs added with reviewOnOpen, once per head', async () => {
    const repo = await trackRepo()
    runner.behaviour = { kind: 'reply', text: JSON.stringify({ ...JSON.parse(PAYLOAD), pr: 7 }) }
    provider.remote.set(7, remotePr({ number: 7, reviewRequested: false }))
    const [added]: InboxRow[] = await (await app.request(`/api/repos/${repo.id}/prs`, json('POST', { numbers: [7], reviewOnOpen: true }))).json()

    const reviewReady = nextEvent('review.ready')
    await app.request(`/api/prs/${added.id}/open`, { method: 'POST' })
    await reviewReady
    expect(runner.runs).toHaveLength(1)

    const ready = nextEvent('worktree.ready')
    await app.request(`/api/prs/${added.id}/open`, { method: 'POST' })
    await ready
    await new Promise((r) => setTimeout(r, 0))
    expect(runner.runs).toHaveLength(1)
  })

  it('shows the blocking explanation when every inline anchor is invalid', async () => {
    const repo = await trackRepo()
    await syncRepo(repo.id)
    const [pr]: InboxRow[] = await (await app.request(`/api/repos/${repo.id}/prs`)).json()
    const ready = nextEvent('worktree.ready')
    await app.request(`/api/prs/${pr.id}/open`, { method: 'POST' })
    await ready
    runner.behaviour = { kind: 'reply', text: JSON.stringify({
      ...JSON.parse(PAYLOAD), event: 'REQUEST_CHANGES', body: 'Review finished.',
      comments: [
        { path: 'src/a.py', line: 585, side: 'RIGHT', body: 'Block: the lock is missing.' },
        { path: 'src/a.py', line: 541, side: 'RIGHT', body: 'Question: reuse the existing helper?' },
      ],
    }) }
    const reviewed = nextEvent('review.ready')
    await app.request(`/api/prs/${pr.id}/review`, json('POST', { agent: 'pr-reviewer' }))
    await reviewed

    const detail: PrDetail = await (await app.request(`/api/prs/${pr.id}`)).json()
    expect(detail.agentReview?.review).toMatchObject({ verdict: 'REQUEST_CHANGES', invalidAnchorCount: 2 })
    expect(detail.agentReview?.findings).toEqual([])
    expect(detail.agentReview?.review.summary).toContain('Block: the lock is missing.')
    expect(detail.agentReview?.review.summary).toContain('Question: reuse the existing helper?')
  })

  it('reviews the new source revision after sync advances an already-open PR', async () => {
    const repo = await trackRepo()
    await syncRepo(repo.id)
    const [pr]: InboxRow[] = await (await app.request(`/api/repos/${repo.id}/prs`)).json()
    const worktreeReady = nextEvent('worktree.ready')
    await app.request(`/api/prs/${pr.id}/open`, { method: 'POST' })
    await worktreeReady
    const path = store.pullRequests.get(pr.id)!.worktreePath!
    const oldHead = worktrees.heads.get(path)
    provider.remote.set(415, remotePr({ number: 415, headSha: 'new-head' }))
    await syncRepo(repo.id)
    expect(worktrees.heads.get(path)).toBe(oldHead)

    runner.behaviour = { kind: 'reply', text: JSON.stringify({ ...JSON.parse(PAYLOAD), commit_id: 'new-head', coverage: 'complete' }) }
    const run = runner.run
    runner.run = async (...args) => {
      expect(await worktrees.headSha(args[0].directory)).toBe('new-head')
      return run(...args)
    }
    const reviewReady = nextEvent('review.ready')
    await app.request(`/api/prs/${pr.id}/review`, json('POST', { agent: 'pr-reviewer' }))
    await reviewReady

    const detail: PrDetail = await (await app.request(`/api/prs/${pr.id}`)).json()
    expect(detail.agentReview?.review).toMatchObject({ status: 'ready', headSha: 'new-head', coverage: 'complete' })
    expect(worktrees.checkedOut).toEqual([{ path, headSha: 'new-head' }])
  })

  it('tracks a repo with autoReview and patches it', async () => {
    const created = await app.request('/api/repos', json('POST', { provider: 'github', owner: 'acme', name: 'widgets', autoReview: true }))
    expect(created.status).toBe(201)
    const repo: Repo = await created.json()
    expect(repo.autoReview).toBe(true)

    const patched = await app.request(`/api/repos/${repo.id}`, json('PATCH', { autoReview: false }))
    expect(patched.status).toBe(200)
    expect(await patched.json()).toMatchObject({ id: repo.id, autoReview: false })
    expect(await (await app.request('/api/repos')).json()).toMatchObject([{ id: repo.id, autoReview: false }])
  })

  it('lists the repositories on the account', async () => {
    provider.accountRepos = [{ owner: 'acme', name: 'widgets', openPrCount: 2 }]
    expect(await (await app.request('/api/account/repos')).json()).toEqual([{ owner: 'acme', name: 'widgets', openPrCount: 2 }])
  })

  describe('local scope in PR mode', () => {
    it('is absent until a folder or patch is opened, then serves its diff and chat', async () => {
      expect((await app.request('/api/scopes/local')).status).toBe(404)
      expect((await app.request('/api/scopes/local/diff')).status).toBe(404)

      const dir = await mkdtemp(join(tmpdir(), 'review-local-'))
      try {
        await writeFile(join(dir, 'change.diff'), SAMPLE_PATCH)
        const opened = await app.request('/api/scopes/local', json('POST', { target: join(dir, 'change.diff') }))
        expect(opened.status).toBe(201)
        expect(await opened.json()).toEqual({ source: { kind: 'patch', path: join(dir, 'change.diff') } })
        expect(events.events).toContainEqual({ type: 'scope.opened', scope: 'local' })
        const diff = await (await app.request('/api/scopes/local/diff')).json()
        expect(diff).toMatchObject({ source: { kind: 'patch' }, files: [{ path: 'src/a.py' }] })
        expect(await (await app.request('/api/scopes/local/threads')).json()).toEqual([{ id: 'dock', anchor: null }])
      } finally {
        await rm(dir, { recursive: true, force: true })
      }
    })

    it('rejects a path that does not exist', async () => {
      expect((await app.request('/api/scopes/local', json('POST', { target: '/nope/none.diff' }))).status).toBe(404)
    })
  })

  describe('accounts', () => {
    it('is disconnected until something connects it', async () => {
      expect(await (await app.request('/api/account')).json()).toMatchObject({ phase: 'disconnected', login: null, deviceFlowAvailable: true })
    })

    it('borrows the gh token on load when nothing is stored', async () => {
      await accounts.load()
      expect(await (await app.request('/api/account')).json()).toMatchObject({ phase: 'connected', login: 'sebastiandev', source: 'cli' })
      expect(credentials.stored.get('github')).toMatchObject({ token: 'tok-cli', source: 'cli' })
    })

    it('connects through the CLI on request and emits account.connected', async () => {
      const res = await app.request('/api/account/connect', json('POST', { via: 'cli' }))
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ phase: 'connected', login: 'sebastiandev', source: 'cli', scopes: ['repo', 'read:org'] })
      expect(events.ofType('account.connected')).toEqual([{ type: 'account.connected', provider: 'github', login: 'sebastiandev', source: 'cli' }])
    })

    it('runs the device flow: pending with the code, then connected once approved', async () => {
      const connected = nextEvent('account.connected')
      const res = await app.request('/api/account/connect', json('POST', { via: 'device' }))
      expect(res.status).toBe(202)
      expect(await res.json()).toMatchObject({ userCode: 'ABCD-1234', verificationUri: 'https://github.com/login/device', interval: 5 })
      expect(events.ofType('account.pending')).toHaveLength(1)
      await connected
      expect(await (await app.request('/api/account')).json()).toMatchObject({ phase: 'connected', login: 'sebastiandev', source: 'oauth', pending: null })
      expect(credentials.stored.get('github')).toMatchObject({ token: 'tok-oauth', source: 'oauth' })
    })

    it('reports a denied device flow and stays disconnected', async () => {
      deviceFlow.polls.splice(0, deviceFlow.polls.length, { status: 'failed', message: 'authorization was denied' })
      const failed = nextEvent('account.failed')
      await app.request('/api/account/connect', json('POST', { via: 'device' }))
      expect(await failed).toMatchObject({ message: 'authorization was denied' })
      expect(await (await app.request('/api/account')).json()).toMatchObject({ phase: 'disconnected' })
    })

    it('refuses the device flow when no client id is configured', async () => {
      deviceFlow.available = false
      const res = await app.request('/api/account/connect', json('POST', { via: 'device' }))
      expect(res.status).toBe(409)
      expect(await res.json()).toEqual({ code: 'device_flow_unavailable' })
    })

    it('disconnects: the credential is gone and the account reads disconnected', async () => {
      await app.request('/api/account/connect', json('POST', { via: 'cli' }))
      expect((await app.request('/api/account', { method: 'DELETE' })).status).toBe(204)
      expect(credentials.stored.size).toBe(0)
      expect(await (await app.request('/api/account')).json()).toMatchObject({ phase: 'disconnected', login: null })
    })
  })

  it('removes the worktrees of merged PRs, keeping the open ones', async () => {
    const repo = await trackRepo()
    provider.remote.set(7, remotePr({ number: 7 }))
    await syncRepo(repo.id)
    const inbox: InboxRow[] = await (await app.request(`/api/repos/${repo.id}/prs`)).json()
    for (const pr of inbox) {
      const ready = nextEvent('worktree.ready')
      await app.request(`/api/prs/${pr.id}/open`, { method: 'POST' })
      await ready
    }
    const merged = inbox.find((p) => p.number === 7)!
    // Flip the row directly: a sync would already release the worktree of a merged PR.
    store.transaction(() => store.pullRequests.update(merged.id, { state: 'merged' }))

    const res = await app.request('/api/worktrees/merged', { method: 'DELETE' })
    expect(await res.json()).toEqual({ removed: [merged.id] })
    expect(worktrees.removed).toEqual(['/wt/acme/widgets/7'])
    const { rows } = await (await app.request('/api/worktrees')).json()
    expect(rows).toMatchObject([{ number: 415, path: '/wt/acme/widgets/415' }])
  })

  describe('autoReviewOnFetch', () => {
    /** A tracked repo with one opened PR (worktree ready) and no agent run yet. */
    const openedRepo = async (autoReview: boolean) => {
      const created = await app.request('/api/repos', json('POST', { provider: 'github', owner: 'acme', name: 'widgets', autoReview }))
      const repo: Repo = await created.json()
      await syncRepo(repo.id)
      const [pr]: InboxRow[] = await (await app.request(`/api/repos/${repo.id}/prs`)).json()
      const ready = nextEvent('worktree.ready')
      await app.request(`/api/prs/${pr.id}/open`, { method: 'POST' })
      await ready
      return { repo, pr }
    }

    it('reviews each opened PR with an unreviewed head once, when the setting and the repo flag are on', async () => {
      const { repo, pr } = await openedRepo(true)
      await app.request('/api/settings', json('PATCH', { autoReviewOnFetch: true }))

      const reviewReady = nextEvent('review.ready')
      await syncRepo(repo.id)
      expect(await reviewReady).toMatchObject({ prId: pr.id })
      expect(runner.runs).toMatchObject([{ directory: '/wt/acme/widgets/415' }])

      await syncRepo(repo.id)
      await new Promise((r) => setTimeout(r, 0))
      expect(runner.runs).toHaveLength(1)
    })

    it('reviews again when the head moves', async () => {
      const { repo, pr } = await openedRepo(true)
      await app.request('/api/settings', json('PATCH', { autoReviewOnFetch: true }))
      const first = nextEvent('review.ready')
      await syncRepo(repo.id)
      await first

      provider.remote.set(415, remotePr({ number: 415, title: 'Fix widgets', headSha: 'sha-415-b' }))
      const second = nextEvent('review.ready')
      await syncRepo(repo.id)
      expect(await second).toMatchObject({ prId: pr.id })
      expect(runner.runs).toHaveLength(2)
    })

    it.each([
      ['the setting is off', false, true],
      ['the repo has autoReview off', true, false],
    ])('does nothing when %s', async (_, setting, repoFlag) => {
      const { repo } = await openedRepo(repoFlag)
      await app.request('/api/settings', json('PATCH', { autoReviewOnFetch: setting }))
      await syncRepo(repo.id)
      await new Promise((r) => setTimeout(r, 0))
      expect(runner.runs).toEqual([])
    })

    it('skips PRs without a worktree', async () => {
      const created = await app.request('/api/repos', json('POST', { provider: 'github', owner: 'acme', name: 'widgets', autoReview: true }))
      const repo: Repo = await created.json()
      await app.request('/api/settings', json('PATCH', { autoReviewOnFetch: true }))
      await syncRepo(repo.id)
      await new Promise((r) => setTimeout(r, 0))
      expect(runner.runs).toEqual([])
    })
  })

  it('lists worktrees with sizes and removes them on request', async () => {
    const repo = await trackRepo()
    await syncRepo(repo.id)
    const [pr]: InboxRow[] = await (await app.request(`/api/repos/${repo.id}/prs`)).json()
    const ready = nextEvent('worktree.ready')
    await app.request(`/api/prs/${pr.id}/open`, { method: 'POST' })
    await ready

    const listed = await (await app.request('/api/worktrees')).json()
    expect(listed).toEqual({
      rows: [{ prId: pr.id, repo: 'acme/widgets', number: 415, title: 'Fix widgets', path: '/wt/acme/widgets/415', state: 'open', doneAt: null, sizeBytes: 1024 }],
      totalBytes: 1024,
    })

    const removed = await app.request('/api/worktrees', json('DELETE', { prIds: [pr.id] }))
    expect(await removed.json()).toEqual({ removed: [pr.id] })
    expect(worktrees.removed).toEqual(['/wt/acme/widgets/415'])
    expect(await (await app.request('/api/worktrees')).json()).toEqual({ rows: [], totalBytes: 0 })
  })

  it('marks done, reopens, tracks viewed files and untracks the repo', async () => {
    const repo = await trackRepo()
    await syncRepo(repo.id)
    const [pr]: InboxRow[] = await (await app.request(`/api/repos/${repo.id}/prs`)).json()

    const viewed = await app.request(`/api/prs/${pr.id}/viewed`, json('PUT', { path: 'src/a.py', headSha: pr.headSha }))
    expect(await viewed.json()).toEqual([{ path: 'src/a.py', headSha: pr.headSha }])

    expect((await app.request(`/api/prs/${pr.id}/done`, { method: 'POST' })).status).toBe(204)
    expect(await (await app.request(`/api/repos/${repo.id}/prs`)).json()).toEqual([])
    expect((await app.request(`/api/prs/${pr.id}/done`, { method: 'DELETE' })).status).toBe(204)
    expect(await (await app.request(`/api/repos/${repo.id}/prs`)).json()).toMatchObject([{ id: pr.id }])

    expect((await app.request(`/api/repos/${repo.id}`, { method: 'DELETE' })).status).toBe(204)
    expect(await (await app.request('/api/repos')).json()).toMatchObject([{ id: repo.id, tracked: false }])
  })

  it('offers open PRs for the picker, resolves references and adds the chosen ones', async () => {
    const repo = await trackRepo()
    provider.remote.set(7, remotePr({ number: 7, reviewRequested: false, title: 'Optional' }))

    expect(await (await app.request(`/api/repos/${repo.id}/prs/open`)).json()).toMatchObject([{ number: 7, stored: false }])

    const resolved = await app.request(`/api/repos/${repo.id}/prs/resolve`, json('POST', { input: '#7' }))
    expect(await resolved.json()).toMatchObject({ repoId: repo.id, preview: { number: 7, title: 'Optional' } })
    expect((await app.request(`/api/repos/${repo.id}/prs/resolve`, json('POST', { input: 'nonsense' }))).status).toBe(404)

    const added = await app.request(`/api/repos/${repo.id}/prs`, json('POST', { numbers: [7], reviewOnOpen: true }))
    expect(added.status).toBe(201)
    expect(await added.json()).toMatchObject([{ number: 7, addedByUser: true }])
    expect(await (await app.request(`/api/repos/${repo.id}/prs/open`)).json()).toEqual([])
  })

  it('reads and patches settings, exposing them through /api/config too', async () => {
    const before: UserSettings = await (await app.request('/api/settings')).json()
    expect(before.pollInterval).toBe(5)

    const patched = await app.request('/api/settings', json('PATCH', { pollInterval: 'manual' }))
    expect(await patched.json()).toMatchObject({ ...before, pollInterval: 'manual' })
    expect(store.settings.read().pollInterval).toBe('manual')
  })

  it.each([
    ['GET', '/api/prs/999', 404, { code: 'not_found' }],
    ['GET', '/api/scopes/pr:999/diff', 404, { code: 'not_found' }],
    ['GET', '/api/scopes/local/diff', 404, { code: 'not_found' }],
    ['DELETE', '/api/repos/999', 404, { code: 'not_found' }],
    ['POST', '/api/prs/999/done', 404, { code: 'not_found' }],
    ['POST', '/api/prs/999/review', 404, { code: 'not_found' }],
    ['POST', '/api/prs/999/findings/1/keep', 404, { code: 'not_found' }],
  ])('%s %s -> %d', async (method, path, status, body) => {
    const res = await app.request(path, { method })
    expect(res.status).toBe(status)
    expect(await res.json()).toEqual(body)
  })

  it('refuses APPROVE without confirmation with 409', async () => {
    const repo = await trackRepo()
    await syncRepo(repo.id)
    const [pr]: InboxRow[] = await (await app.request(`/api/repos/${repo.id}/prs`)).json()
    const res = await app.request(`/api/prs/${pr.id}/submit`, json('POST', { verdict: 'APPROVE', body: 'LGTM' }))
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ code: 'approve_not_confirmed' })
  })
})
