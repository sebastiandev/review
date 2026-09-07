import { describe, expect, it } from 'vitest'
import { extractSpecRef } from './pullRequests.ts'
import { isAnchorable, mergeSameLineComments, validateAnchors, type DraftComment } from './review.ts'
import { isActive, shouldReleaseWorktree } from './rules.ts'

const anchors = { 'src/a.py': [1, 2, 3, 10], 'src/b.py': [] }

const comment = (overrides: Partial<DraftComment>): DraftComment => ({
  id: 1,
  draftId: 1,
  path: 'src/a.py',
  line: 2,
  startLine: null,
  side: 'RIGHT',
  body: 'b',
  agentBody: null,
  origin: 'human',
  selected: true,
  anchorValid: true,
  inReplyTo: null,
  findingId: null,
  ...overrides,
})

describe('isAnchorable', () => {
  it.each([
    ['a single anchored line', { path: 'src/a.py', line: 2, startLine: null, side: 'RIGHT' as const }, true],
    ['a contiguous anchored range', { path: 'src/a.py', line: 3, startLine: 1, side: 'RIGHT' as const }, true],
    ['a line not in the diff', { path: 'src/a.py', line: 5, startLine: null, side: 'RIGHT' as const }, false],
    ['a range crossing an unanchored gap', { path: 'src/a.py', line: 10, startLine: 3, side: 'RIGHT' as const }, false],
    ['a file not in the diff', { path: 'src/zzz.py', line: 1, startLine: null, side: 'RIGHT' as const }, false],
    ['a LEFT-side line in a file that is in the diff', { path: 'src/b.py', line: 7, startLine: null, side: 'LEFT' as const }, true],
    ['a LEFT-side line in a file not in the diff', { path: 'src/zzz.py', line: 7, startLine: null, side: 'LEFT' as const }, false],
  ])('%s → %s', (_label, anchor, expected) => {
    expect(isAnchorable(anchors, anchor)).toBe(expected)
  })
})

describe('validateAnchors', () => {
  it('returns the ids of comments that no longer anchor', () => {
    const comments = [comment({ id: 1, line: 2 }), comment({ id: 2, line: 99 }), comment({ id: 3, path: 'gone.py' })]
    expect(validateAnchors(comments, anchors)).toEqual([2, 3])
  })

  it('returns nothing when every comment anchors', () => {
    expect(validateAnchors([comment({ id: 1 })], anchors)).toEqual([])
  })
})

describe('mergeSameLineComments', () => {
  it('joins bodies of comments on the same location, in first-seen order', () => {
    const merged = mergeSameLineComments([
      comment({ id: 1, line: 2, body: 'first' }),
      comment({ id: 2, line: 3, body: 'other line' }),
      comment({ id: 3, line: 2, body: 'second' }),
    ])
    expect(merged).toEqual([
      { path: 'src/a.py', line: 2, startLine: null, side: 'RIGHT', body: 'first\n\nsecond', inReplyTo: null },
      { path: 'src/a.py', line: 3, startLine: null, side: 'RIGHT', body: 'other line', inReplyTo: null },
    ])
  })

  it('keeps different sides and different ranges apart', () => {
    const merged = mergeSameLineComments([
      comment({ id: 1, line: 2, side: 'RIGHT' }),
      comment({ id: 2, line: 2, side: 'LEFT' }),
      comment({ id: 3, line: 2, startLine: 1 }),
    ])
    expect(merged).toHaveLength(3)
  })

  it('never merges replies', () => {
    const merged = mergeSameLineComments([
      comment({ id: 1, inReplyTo: '9', body: 'a' }),
      comment({ id: 2, inReplyTo: '9', body: 'b' }),
      comment({ id: 3, body: 'top' }),
    ])
    expect(merged.map((c) => c.body)).toEqual(['a', 'b', 'top'])
  })
})

describe('extractSpecRef', () => {
  it.each([
    ['Implements X.\n\nSpec: docs/spec.md\n', 'docs/spec.md'],
    ['spec-ref: SPEC-12', 'SPEC-12'],
    ['Spec Ref: https://example.com/s', 'https://example.com/s'],
    ['No spec here', null],
    ['', null],
  ])('%j → %j', (body, expected) => {
    expect(extractSpecRef(body)).toBe(expected)
  })
})

describe('rules', () => {
  it.each([
    [{ doneAt: null, state: 'open' as const, worktreePath: '/wt' }, false],
    [{ doneAt: '2026', state: 'open' as const, worktreePath: '/wt' }, true],
    [{ doneAt: null, state: 'merged' as const, worktreePath: '/wt' }, true],
    [{ doneAt: null, state: 'closed' as const, worktreePath: null }, false],
  ])('shouldReleaseWorktree(%j) → %s', (pr, expected) => {
    expect(shouldReleaseWorktree(pr)).toBe(expected)
  })

  it('isActive is not-done regardless of remote state', () => {
    expect(isActive({ doneAt: null })).toBe(true)
    expect(isActive({ doneAt: '2026' })).toBe(false)
  })
})
