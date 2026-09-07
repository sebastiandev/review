import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cachePrDiff } from '../actions/cachePrDiff.ts'
import { NotFound } from '../errors.ts'
import type { PullRequest, Repo } from '../pullRequests.ts'
import type { Store } from '../store.ts'
import { fixedClock, GITHUB_REPO, NOW, openTestStore, remotePr, SAMPLE_PATCH } from '../testing/fakes.ts'
import { addDraftComment, deleteDraftComment, editDraftComment, type DraftCommentsDeps } from './draftComments.ts'

describe('draft comments', () => {
  let store: Store
  let close: () => Promise<void>
  let deps: DraftCommentsDeps
  let repo: Repo
  let pr: PullRequest
  const anchor = { path: 'src/a.py', line: 2, startLine: null, side: 'RIGHT' as const, body: 'why?', inReplyTo: null }

  beforeEach(async () => {
    ;({ store, close } = await openTestStore())
    deps = { store, clock: fixedClock() }
    repo = store.repos.insert({ ...GITHUB_REPO, tracked: true, autoReview: false, syncedAt: null, syncError: null })
    pr = store.pullRequests.upsert(repo.id, remotePr(), {}, NOW)
    store.transaction(() => cachePrDiff(store.diffs, repo, pr, SAMPLE_PATCH, NOW))
  })
  afterEach(() => close())

  it('creates the draft on the first comment and reuses it afterwards', () => {
    const first = addDraftComment(deps, { prId: pr.id, ...anchor })
    const second = addDraftComment(deps, { prId: pr.id, ...anchor, line: 3 })

    expect(first).toMatchObject({ origin: 'human', selected: true, anchorValid: true, body: 'why?' })
    expect(second.draftId).toBe(first.draftId)
    expect(store.drafts.open(pr.id, pr.headSha)).toMatchObject({ id: first.draftId, status: 'open' })
    expect(store.drafts.comments(first.draftId)).toHaveLength(2)
  })

  it.each([
    ['a line outside the diff', { line: 42 }],
    ['a file outside the diff', { path: 'nope.py' }],
  ])('flags %s as not anchorable', (_label, override) => {
    expect(addDraftComment(deps, { prId: pr.id, ...anchor, ...override }).anchorValid).toBe(false)
  })

  it('is not anchorable when no diff is cached for the head', () => {
    const other = store.pullRequests.upsert(repo.id, remotePr({ number: 2 }), {}, NOW)
    expect(addDraftComment(deps, { prId: other.id, ...anchor }).anchorValid).toBe(false)
  })

  it('edits body and selection, then deletes', () => {
    const c = addDraftComment(deps, { prId: pr.id, ...anchor })
    expect(editDraftComment(deps, { prId: pr.id, commentId: c.id, body: 'better', selected: false })).toMatchObject({ body: 'better', selected: false })
    deleteDraftComment(deps, { prId: pr.id, commentId: c.id })
    expect(store.drafts.comments(c.draftId)).toEqual([])
  })

  it('refuses to edit a comment that belongs to another PR draft', () => {
    const other = store.pullRequests.upsert(repo.id, remotePr({ number: 2 }), {}, NOW)
    const c = addDraftComment(deps, { prId: pr.id, ...anchor })
    expect(() => editDraftComment(deps, { prId: other.id, commentId: c.id, body: 'x' })).toThrow(NotFound)
    expect(() => deleteDraftComment(deps, { prId: other.id, commentId: c.id })).toThrow(NotFound)
  })

  it('throws NotFound for an unknown PR', () => {
    expect(() => addDraftComment(deps, { prId: 999, ...anchor })).toThrow(NotFound)
  })
})
