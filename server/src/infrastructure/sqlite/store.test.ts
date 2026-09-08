import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Store } from '../../domain/store.ts'
import { DEFAULT_USER_SETTINGS } from '../../domain/settings.ts'
import { GITHUB_REPO, NOW, openTestStore, remotePr } from '../../domain/testing/fakes.ts'
import { openDatabase, runMigrations } from './database.ts'

describe('migrations', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'review-mig-'))
  })
  afterEach(() => rm(dir, { recursive: true, force: true }))

  it('applies every migration on first open and none on the second', () => {
    const path = join(dir, 'db.sqlite')
    const first = openDatabase(path)
    const versions = first.prepare('SELECT version FROM schema_migration ORDER BY version').all().map((r) => r.version)
    first.close()
    expect(versions).toEqual(['0001', '0002', '0003', '0004', '0005'])

    const second = openDatabase(path)
    expect(runMigrations(second)).toEqual([])
    expect(second.prepare('SELECT COUNT(*) AS n FROM schema_migration').get()?.n).toBe(5)
    second.close()
  })

  it('enables foreign keys', () => {
    const db = openDatabase(join(dir, 'fk.sqlite'))
    expect(() =>
      db
        .prepare(
          `INSERT INTO pull_request (repo_id, number, title, author, url, head_ref, base_ref, head_sha, base_sha, is_draft, state,
             additions, deletions, changed_files, remote_created_at, remote_updated_at, synced_at)
           VALUES (999, 1, 't', 'a', 'u', 'h', 'b', 's', 's', 0, 'open', 0, 0, 0, 'x', 'x', 'x')`,
        )
        .run(),
    ).toThrow(/FOREIGN KEY/)
    db.close()
  })
})

describe('sqliteStore', () => {
  let store: Store
  let close: () => Promise<void>
  beforeEach(async () => {
    ;({ store, close } = await openTestStore())
  })
  afterEach(() => close())

  const seedRepo = () => store.repos.insert({ ...GITHUB_REPO, tracked: true, autoReview: false, syncedAt: null, syncError: null })

  describe('transaction', () => {
    it('rolls back on throw', () => {
      expect(() =>
        store.transaction(() => {
          seedRepo()
          throw new Error('boom')
        }),
      ).toThrow('boom')
      expect(store.repos.list()).toEqual([])
    })

    it('rejects nesting', () => {
      expect(() => store.transaction(() => store.transaction(() => 1))).toThrow(/nested/)
      // The outer transaction rolled back and left the connection usable.
      expect(store.repos.list()).toEqual([])
    })
  })

  describe('repos', () => {
    it('round-trips insert, find, update', () => {
      const repo = seedRepo()
      expect(store.repos.find(GITHUB_REPO)).toEqual(repo)
      store.repos.update(repo.id, { tracked: false, syncError: 'nope', syncedAt: NOW })
      expect(store.repos.get(repo.id)).toEqual({ ...repo, tracked: false, syncError: 'nope', syncedAt: NOW })
    })

    it('find returns null for an unknown repo', () => {
      expect(store.repos.find({ ...GITHUB_REPO, name: 'other' })).toBeNull()
    })
  })

  describe('pullRequests', () => {
    it('upsert inserts with local fields, then refreshes remote fields while preserving local ones', () => {
      const repo = seedRepo()
      const inserted = store.pullRequests.upsert(repo.id, remotePr({ number: 7 }), { addedByUser: true, reviewOnOpen: true, specRef: 'S-1' }, NOW)
      expect(inserted).toMatchObject({ repoId: repo.id, number: 7, addedByUser: true, reviewOnOpen: true, specRef: 'S-1', syncedAt: NOW })
      store.pullRequests.update(inserted.id, { doneAt: NOW, worktreePath: '/wt/7' })

      const later = '2026-09-08T00:00:00.000Z'
      const refreshed = store.pullRequests.upsert(repo.id, remotePr({ number: 7, title: 'renamed', headSha: 'sha-7-b' }), {}, later)
      expect(refreshed).toMatchObject({
        id: inserted.id,
        title: 'renamed',
        headSha: 'sha-7-b',
        syncedAt: later,
        addedByUser: true,
        reviewOnOpen: true,
        specRef: 'S-1',
        doneAt: NOW,
        worktreePath: '/wt/7',
      })
      expect(store.pullRequests.find(repo.id, 7)).toEqual(refreshed)
    })

    it.each([
      [{ active: true }, [1, 3]],
      [{ open: true }, [1, 2]],
      [{ active: true, open: true }, [1]],
      [{}, [1, 2, 3]],
    ])('listByRepo(%j) returns %j', (filter, numbers) => {
      const repo = seedRepo()
      store.pullRequests.upsert(repo.id, remotePr({ number: 1 }), {}, NOW)
      const done = store.pullRequests.upsert(repo.id, remotePr({ number: 2 }), {}, NOW)
      store.pullRequests.update(done.id, { doneAt: NOW })
      store.pullRequests.upsert(repo.id, remotePr({ number: 3, state: 'merged' }), {}, NOW)
      expect(store.pullRequests.listByRepo(repo.id, filter).map((p) => p.number)).toEqual(numbers)
    })
  })

  describe('diffs and comments', () => {
    it('round-trips a diff keyed by head sha', () => {
      const repo = seedRepo()
      const pr = store.pullRequests.upsert(repo.id, remotePr(), {}, NOW)
      const diff = { prId: pr.id, headSha: pr.headSha, baseSha: pr.baseSha, patch: 'p', files: [], anchors: { 'a.py': [1, 2] }, fetchedAt: NOW }
      store.diffs.insert(diff)
      expect(store.diffs.get(pr.id, pr.headSha)).toEqual(diff)
      expect(store.diffs.get(pr.id, 'other')).toBeNull()
    })

    it('replace swaps the whole comment set', () => {
      const repo = seedRepo()
      const pr = store.pullRequests.upsert(repo.id, remotePr(), {}, NOW)
      const comment = (remoteId: string) => ({
        remoteId,
        author: 'bob',
        path: 'a.py',
        line: 2,
        startLine: null,
        side: 'RIGHT' as const,
        body: 'hm',
        inReplyTo: null,
        createdAt: '2026-09-03T00:00:00.000Z',
        originalLine: 2,
        originalCommitSha: 'sha-1-a',
      })
      store.comments.replace(pr.id, [comment('c1'), comment('c2')], NOW)
      store.comments.replace(pr.id, [comment('c2'), comment('c3')], NOW)
      expect(store.comments.list(pr.id).map((c) => c.remoteId)).toEqual(['c2', 'c3'])
    })
  })

  describe('drafts and submissions', () => {
    it('round-trips a draft with comments, then a submission', () => {
      const repo = seedRepo()
      const pr = store.pullRequests.upsert(repo.id, remotePr(), {}, NOW)
      const draft = store.drafts.insert(pr.id, pr.headSha, NOW)
      expect(store.drafts.open(pr.id, pr.headSha)).toEqual(draft)
      expect(store.drafts.latestOpen(pr.id)).toEqual(draft)

      const c = store.drafts.insertComment(
        { draftId: draft.id, path: 'a.py', line: 2, startLine: null, side: 'RIGHT', body: 'b', agentBody: null, origin: 'human', selected: true, anchorValid: true, inReplyTo: null, findingId: null },
        NOW,
      )
      store.drafts.updateComment(c.id, { body: 'edited', selected: false }, NOW)
      expect(store.drafts.getComment(c.id)).toEqual({ ...c, body: 'edited', selected: false })
      expect(store.drafts.comments(draft.id)).toHaveLength(1)

      const sub = store.submissions.insert(
        { prId: pr.id, headSha: pr.headSha, draftId: draft.id, remoteReviewId: 'r1', source: 'app', verdict: 'COMMENT', body: 'lgtm-ish', agentVerdict: null, submittedAt: NOW },
        '{}',
      )
      store.drafts.markSubmitted(draft.id, NOW)
      expect(store.drafts.open(pr.id, pr.headSha)).toBeNull()
      expect(store.views.pastReviews(null)).toMatchObject([{ submissionId: sub.id, verdict: 'COMMENT', agentAgreement: 'not run' }])

      store.drafts.deleteComment(c.id)
      expect(store.drafts.comments(draft.id)).toEqual([])
    })
  })

  describe('agentReviews', () => {
    const finding = { path: 'a.py', line: 2, startLine: null, side: 'RIGHT' as const, severity: 'note' as const, body: 'hm' }

    it('inserts queued, updates through the run, and lists runs newest first with their findings', () => {
      const repo = seedRepo()
      const pr = store.pullRequests.upsert(repo.id, remotePr(), {}, NOW)
      const first = store.agentReviews.insert({ prId: pr.id, headSha: pr.headSha, agent: 'pr-reviewer', model: { providerID: 'p', modelID: 'm' }, variant: 'high' })
      expect(first).toMatchObject({ status: 'queued', model: { providerID: 'p', modelID: 'm' }, variant: 'high', sessionId: null, verdict: null, invalidAnchorCount: 0 })

      store.agentReviews.update(first.id, { status: 'running', sessionId: 'ses_1', startedAt: NOW })
      store.agentReviews.update(first.id, { status: 'ready', verdict: 'COMMENT', summary: 'ok', invalidAnchorCount: 1, finishedAt: NOW })
      const findings = store.agentReviews.insertFindings(first.id, [finding, { ...finding, line: 3 }])
      expect(findings.map((f) => f.line)).toEqual([2, 3])
      expect(store.agentReviews.getFinding(findings[0].id)).toEqual(findings[0])
      expect(store.agentReviews.get(first.id)).toMatchObject({ status: 'ready', sessionId: 'ses_1', verdict: 'COMMENT', summary: 'ok', invalidAnchorCount: 1 })

      const second = store.agentReviews.insert({ prId: pr.id, headSha: pr.headSha, agent: 'pr-reviewer', model: null, variant: null })
      expect(store.agentReviews.listForPr(pr.id)).toEqual([
        { review: second, findings: [] },
        { review: store.agentReviews.get(first.id), findings },
      ])
    })

    it('latest picks the newest run for the head, optionally by status', () => {
      const repo = seedRepo()
      const pr = store.pullRequests.upsert(repo.id, remotePr(), {}, NOW)
      const ready = store.agentReviews.insert({ prId: pr.id, headSha: pr.headSha, agent: 'a', model: null, variant: null })
      store.agentReviews.update(ready.id, { status: 'ready', verdict: 'APPROVE' })
      const failed = store.agentReviews.insert({ prId: pr.id, headSha: pr.headSha, agent: 'a', model: null, variant: null })
      store.agentReviews.update(failed.id, { status: 'failed', error: 'x' })
      store.agentReviews.insert({ prId: pr.id, headSha: 'other-sha', agent: 'a', model: null, variant: null })

      expect(store.agentReviews.latest(pr.id, pr.headSha, null)?.id).toBe(failed.id)
      expect(store.agentReviews.latest(pr.id, pr.headSha, 'ready')?.id).toBe(ready.id)
      expect(store.agentReviews.latest(pr.id, 'unknown', null)).toBeNull()
    })

    it('commentForFinding finds the draft comment kept from a finding', () => {
      const repo = seedRepo()
      const pr = store.pullRequests.upsert(repo.id, remotePr(), {}, NOW)
      const review = store.agentReviews.insert({ prId: pr.id, headSha: pr.headSha, agent: 'a', model: null, variant: null })
      const [f] = store.agentReviews.insertFindings(review.id, [finding])
      const draft = store.drafts.insert(pr.id, pr.headSha, NOW)
      expect(store.drafts.commentForFinding(draft.id, f.id)).toBeNull()
      const kept = store.drafts.insertComment(
        { draftId: draft.id, ...finding, body: 'hm', agentBody: 'hm', origin: 'agent', selected: true, anchorValid: true, inReplyTo: null, findingId: f.id },
        NOW,
      )
      expect(store.drafts.commentForFinding(draft.id, f.id)).toEqual(kept)
    })
  })

  describe('viewed and settings', () => {
    it('viewed marks are per path and cleared with null', () => {
      const repo = seedRepo()
      const pr = store.pullRequests.upsert(repo.id, remotePr(), {}, NOW)
      store.viewed.set(pr.id, 'a.py', 'sha1')
      store.viewed.set(pr.id, 'a.py', 'sha2')
      store.viewed.set(pr.id, 'b.py', 'sha1')
      expect(store.viewed.list(pr.id)).toEqual([
        { path: 'a.py', headSha: 'sha2' },
        { path: 'b.py', headSha: 'sha1' },
      ])
      store.viewed.set(pr.id, 'a.py', null)
      expect(store.viewed.list(pr.id)).toEqual([{ path: 'b.py', headSha: 'sha1' }])
    })

    it('settings default until written', () => {
      expect(store.settings.read()).toEqual(DEFAULT_USER_SETTINGS)
      store.settings.write({ ...DEFAULT_USER_SETTINGS, pollInterval: 'manual', theme: 'dark' })
      expect(store.settings.read()).toEqual({ ...DEFAULT_USER_SETTINGS, pollInterval: 'manual', theme: 'dark' })
    })
  })

  describe('views', () => {
    it('inbox aggregates comment counts and the submitted verdict for the current head', () => {
      const repo = seedRepo()
      const pr = store.pullRequests.upsert(repo.id, remotePr({ number: 1 }), {}, NOW)
      const done = store.pullRequests.upsert(repo.id, remotePr({ number: 2 }), {}, NOW)
      store.pullRequests.update(done.id, { doneAt: NOW })
      store.comments.replace(
        pr.id,
        [{ remoteId: 'c1', author: 'bob', path: 'a.py', line: 1, startLine: null, side: 'RIGHT', body: 'x', inReplyTo: null, createdAt: NOW, originalLine: null, originalCommitSha: null }],
        NOW,
      )
      const draft = store.drafts.insert(pr.id, pr.headSha, NOW)
      store.drafts.insertComment(
        { draftId: draft.id, path: 'a.py', line: 1, startLine: null, side: 'RIGHT', body: 'b', agentBody: null, origin: 'human', selected: true, anchorValid: true, inReplyTo: null, findingId: null },
        NOW,
      )
      const rows = store.views.inbox(repo.id)
      expect(rows.map((r) => r.number)).toEqual([1])
      expect(rows[0]).toMatchObject({ remoteCommentCount: 1, draftCommentCount: 1, submittedVerdict: null, hasWorktree: false, agentStatus: null, agentVerdict: null })
    })

    it('inbox reports the latest agent run for the current head only', () => {
      const repo = seedRepo()
      const pr = store.pullRequests.upsert(repo.id, remotePr({ number: 1 }), {}, NOW)
      const old = store.agentReviews.insert({ prId: pr.id, headSha: 'old-sha', agent: 'a', model: null, variant: null })
      store.agentReviews.update(old.id, { status: 'ready', verdict: 'APPROVE' })
      expect(store.views.inbox(repo.id)[0]).toMatchObject({ agentStatus: null, agentVerdict: null })

      const ready = store.agentReviews.insert({ prId: pr.id, headSha: pr.headSha, agent: 'a', model: null, variant: null })
      store.agentReviews.update(ready.id, { status: 'ready', verdict: 'REQUEST_CHANGES' })
      store.agentReviews.insert({ prId: pr.id, headSha: pr.headSha, agent: 'a', model: null, variant: null })
      expect(store.views.inbox(repo.id)[0]).toMatchObject({ agentStatus: 'queued', agentVerdict: null })
    })

    it('prDetail joins the PR row with its diff, comments, open draft and viewed marks', () => {
      const repo = seedRepo()
      const pr = store.pullRequests.upsert(repo.id, remotePr({ number: 7, body: 'Spec: X' }), { specRef: 'X' }, NOW)
      store.diffs.insert({ prId: pr.id, headSha: pr.headSha, baseSha: pr.baseSha, patch: 'p', files: [], anchors: { 'a.py': [1] }, fetchedAt: NOW })
      const draft = store.drafts.insert(pr.id, pr.headSha, NOW)
      const comment = store.drafts.insertComment(
        { draftId: draft.id, path: 'a.py', line: 1, startLine: null, side: 'RIGHT', body: 'b', agentBody: null, origin: 'human', selected: true, anchorValid: true, inReplyTo: null, findingId: null },
        NOW,
      )
      store.viewed.set(pr.id, 'a.py', pr.headSha)

      const detail = store.views.prDetail(pr.id)!

      expect(detail.pr).toMatchObject({ id: pr.id, number: 7, body: 'Spec: X', specRef: 'X', worktreePath: null, draftCommentCount: 1 })
      expect(detail.diff).toEqual({ source: { kind: 'pr', repo: 'acme/widgets', number: 7, headSha: pr.headSha }, patch: 'p', files: [], anchors: { 'a.py': [1] } })
      expect(detail.draft).toEqual({ id: draft.id, headSha: pr.headSha, status: 'open', comments: [expect.objectContaining({ id: comment.id, body: 'b' })] })
      expect(detail.draft?.comments[0]).not.toHaveProperty('draftId')
      expect(detail.agentReview).toBeNull()
      expect(detail.viewed).toEqual([{ path: 'a.py', headSha: pr.headSha }])

      const review = store.agentReviews.insert({ prId: pr.id, headSha: pr.headSha, agent: 'a', model: null, variant: null })
      const findings = store.agentReviews.insertFindings(review.id, [{ path: 'a.py', line: 1, startLine: null, side: 'RIGHT', severity: 'note', body: 'x' }])
      expect(store.views.prDetail(pr.id)?.agentReview).toEqual({ review, findings })
    })

    it('prDetail is null for an unknown id and has null diff/draft before they exist', () => {
      const repo = seedRepo()
      const pr = store.pullRequests.upsert(repo.id, remotePr({ number: 8 }), {}, NOW)
      expect(store.views.prDetail(999)).toBeNull()
      expect(store.views.prDetail(pr.id)).toMatchObject({ diff: null, draft: null, comments: [], viewed: [] })
    })

    it('repoCounts counts active and review-requested PRs per repo', () => {
      const repo = seedRepo()
      store.pullRequests.upsert(repo.id, remotePr({ number: 1, reviewRequested: true }), { reviewRequested: true }, NOW)
      store.pullRequests.upsert(repo.id, remotePr({ number: 2, reviewRequested: false }), { reviewRequested: false }, NOW)
      const done = store.pullRequests.upsert(repo.id, remotePr({ number: 3 }), { reviewRequested: true }, NOW)
      store.pullRequests.update(done.id, { doneAt: NOW })
      expect(store.views.repoCounts()).toEqual([{ ...repo, activeCount: 2, reviewRequestedCount: 1 }])
    })

    it('worktrees lists PRs with a path, labelled by repo', () => {
      const repo = seedRepo()
      const pr = store.pullRequests.upsert(repo.id, remotePr({ number: 4 }), {}, NOW)
      store.pullRequests.upsert(repo.id, remotePr({ number: 5 }), {}, NOW)
      store.pullRequests.update(pr.id, { worktreePath: '/wt/4' })
      expect(store.views.worktrees()).toEqual([
        { prId: pr.id, repo: 'acme/widgets', number: 4, title: 'PR 4', path: '/wt/4', state: 'open', doneAt: null },
      ])
    })

    it('pastReviews filters by verdict and derives agent agreement', () => {
      const repo = seedRepo()
      const pr = store.pullRequests.upsert(repo.id, remotePr(), {}, NOW)
      const d1 = store.drafts.insert(pr.id, 'sha-x', NOW)
      const d2 = store.drafts.insert(pr.id, 'sha-y', NOW)
      store.submissions.insert(
        { prId: pr.id, headSha: 'sha-x', draftId: d1.id, remoteReviewId: 'r1', source: 'app', verdict: 'APPROVE', body: '', agentVerdict: 'APPROVE', submittedAt: NOW },
        '{}',
      )
      store.submissions.insert(
        { prId: pr.id, headSha: 'sha-y', draftId: d2.id, remoteReviewId: 'r2', source: 'app', verdict: 'REQUEST_CHANGES', body: '', agentVerdict: 'APPROVE', submittedAt: NOW },
        '{}',
      )
      expect(store.submissions.remoteIds(pr.id)).toEqual(new Set(['r1', 'r2']))
      expect(store.views.pastReviews(null).map((r) => r.agentAgreement).sort()).toEqual(['agreed', 'disagreed'])
      expect(store.views.pastReviews('APPROVE')).toMatchObject([{ verdict: 'APPROVE', agentAgreement: 'agreed' }])
    })
  })
})
