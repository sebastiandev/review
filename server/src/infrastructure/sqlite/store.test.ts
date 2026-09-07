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
    expect(versions).toEqual(['0001'])

    const second = openDatabase(path)
    expect(runMigrations(second)).toEqual([])
    expect(second.prepare('SELECT COUNT(*) AS n FROM schema_migration').get()?.n).toBe(1)
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
        { draftId: draft.id, remoteReviewId: 'r1', verdict: 'COMMENT', body: 'lgtm-ish', agentVerdict: null, submittedAt: NOW },
        '{}',
      )
      store.drafts.markSubmitted(draft.id, NOW)
      expect(store.drafts.open(pr.id, pr.headSha)).toBeNull()
      expect(store.views.pastReviews(null)).toMatchObject([{ submissionId: sub.id, verdict: 'COMMENT', agentAgreement: 'not run' }])

      store.drafts.deleteComment(c.id)
      expect(store.drafts.comments(draft.id)).toEqual([])
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
        [{ remoteId: 'c1', author: 'bob', path: 'a.py', line: 1, startLine: null, side: 'RIGHT', body: 'x', inReplyTo: null, createdAt: NOW }],
        NOW,
      )
      const draft = store.drafts.insert(pr.id, pr.headSha, NOW)
      store.drafts.insertComment(
        { draftId: draft.id, path: 'a.py', line: 1, startLine: null, side: 'RIGHT', body: 'b', agentBody: null, origin: 'human', selected: true, anchorValid: true, inReplyTo: null, findingId: null },
        NOW,
      )
      const rows = store.views.inbox(repo.id)
      expect(rows.map((r) => r.number)).toEqual([1])
      expect(rows[0]).toMatchObject({ remoteCommentCount: 1, draftCommentCount: 1, submittedVerdict: null, hasWorktree: false })
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
      store.submissions.insert({ draftId: d1.id, remoteReviewId: 'r1', verdict: 'APPROVE', body: '', agentVerdict: 'APPROVE', submittedAt: NOW }, '{}')
      store.submissions.insert({ draftId: d2.id, remoteReviewId: 'r2', verdict: 'REQUEST_CHANGES', body: '', agentVerdict: 'APPROVE', submittedAt: NOW }, '{}')
      expect(store.views.pastReviews(null).map((r) => r.agentAgreement).sort()).toEqual(['agreed', 'disagreed'])
      expect(store.views.pastReviews('APPROVE')).toMatchObject([{ verdict: 'APPROVE', agentAgreement: 'agreed' }])
    })
  })
})
