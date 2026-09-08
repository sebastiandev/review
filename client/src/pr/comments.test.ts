import { describe, expect, it } from 'vitest'
import type { DraftCommentRow, RemoteCommentRow } from '@review/shared'
import { countByPath, draftAnchorKey, draftsByLine, groupThreads, outdatedThreads, remoteAnchorKey, threadsByLine } from './comments'

function remote(over: Partial<RemoteCommentRow> & Pick<RemoteCommentRow, 'remoteId' | 'createdAt'>): RemoteCommentRow {
  return {
    author: 'ana',
    path: 'a.py',
    line: 10,
    startLine: null,
    side: 'RIGHT',
    body: over.remoteId,
    inReplyTo: null,
    originalLine: null,
    originalCommitSha: null,
    ...over,
  }
}

function draft(over: Partial<DraftCommentRow> & Pick<DraftCommentRow, 'id'>): DraftCommentRow {
  return {
    path: 'a.py',
    line: 10,
    startLine: null,
    side: 'RIGHT',
    body: '',
    agentBody: null,
    origin: 'human',
    selected: true,
    anchorValid: true,
    inReplyTo: null,
    findingId: null,
    ...over,
  }
}

describe('groupThreads', () => {
  it('attaches replies to their root and orders both by createdAt', () => {
    const rows = [
      remote({ remoteId: 'r2', createdAt: '2026-01-03T00:00:00Z', inReplyTo: 'root' }),
      remote({ remoteId: 'root', createdAt: '2026-01-01T00:00:00Z' }),
      remote({ remoteId: 'later-root', createdAt: '2026-01-04T00:00:00Z' }),
      remote({ remoteId: 'r1', createdAt: '2026-01-02T00:00:00Z', inReplyTo: 'root' }),
    ]
    const threads = groupThreads(rows)
    expect(threads.map((t) => t.root.remoteId)).toEqual(['root', 'later-root'])
    expect(threads[0]?.replies.map((r) => r.remoteId)).toEqual(['r1', 'r2'])
  })

  it('promotes a reply whose parent is missing to a root', () => {
    const threads = groupThreads([remote({ remoteId: 'orphan', createdAt: '2026-01-01T00:00:00Z', inReplyTo: 'gone' })])
    expect(threads).toEqual([{ root: expect.objectContaining({ remoteId: 'orphan' }), replies: [] }])
  })
})

describe('anchor keys', () => {
  it.each([
    [{ line: 5, side: 'RIGHT' as const }, 'new:5'],
    [{ line: 5, side: 'LEFT' as const }, 'old:5'],
    [{ line: 5, side: null }, 'new:5'],
    [{ line: null, side: 'RIGHT' as const }, null],
  ])('remote %j -> %s', (comment, key) => {
    expect(remoteAnchorKey(comment)).toBe(key)
  })

  it('anchors a draft on its side and line', () => {
    expect(draftAnchorKey({ line: 7, side: 'LEFT' })).toBe('old:7')
  })
})

describe('by-line views', () => {
  it('keeps only the file asked for and drops unanchored threads', () => {
    const threads = groupThreads([
      remote({ remoteId: 'a', createdAt: '1', path: 'a.py', line: 3 }),
      remote({ remoteId: 'b', createdAt: '2', path: 'b.py', line: 3 }),
      remote({ remoteId: 'c', createdAt: '3', path: 'a.py', line: null }),
    ])
    expect(Object.keys(threadsByLine(threads, 'a.py'))).toEqual(['new:3'])
  })

  it('excludes pending replies from the per-line pending cards', () => {
    const rows = [draft({ id: 1, line: 3 }), draft({ id: 2, line: 3, inReplyTo: 'root' })]
    expect(draftsByLine(rows, 'a.py')['new:3']?.map((d) => d.id)).toEqual([1])
  })
})

describe('countByPath', () => {
  it('counts rows per path', () => {
    expect(countByPath([{ path: 'a' }, { path: 'a' }, { path: 'b' }])).toEqual({ a: 2, b: 1 })
  })

  it('is empty without rows', () => {
    expect(countByPath([])).toEqual({})
  })
})

describe('outdatedThreads', () => {
  it('keeps only threads of the file whose root lost its line', () => {
    const threads = groupThreads([
      remote({ remoteId: 'live', createdAt: '2026-09-01T00:00:00Z' }),
      remote({ remoteId: 'old', createdAt: '2026-09-01T00:01:00Z', line: null, originalLine: 234 }),
      remote({ remoteId: 'reply', createdAt: '2026-09-01T00:02:00Z', line: null, inReplyTo: 'old' }),
      remote({ remoteId: 'elsewhere', createdAt: '2026-09-01T00:03:00Z', line: null, path: 'b.py' }),
    ])
    const outdated = outdatedThreads(threads, 'a.py')
    expect(outdated.map((t) => t.root.remoteId)).toEqual(['old'])
    expect(outdated[0]!.replies.map((r) => r.remoteId)).toEqual(['reply'])
  })
})
