import { describe, expect, it } from 'vitest'
import type { InboxRow } from '@review/shared'
import { fetchLine, inboxSubtitle, relativeTime, sortInboxRows, DEFAULT_INBOX_FILTER, countByReviewState, filterInboxRows } from './inboxRows'

function row(over: Partial<InboxRow> & Pick<InboxRow, 'id' | 'updatedAt'>): InboxRow {
  return {
    repoId: 1,
    number: over.id,
    title: '',
    author: '',
    url: '',
    isDraft: false,
    state: 'open',
    additions: 0,
    deletions: 0,
    changedFiles: 0,
    headSha: '',
    headRef: '',
    specRef: null,
    reviewRequested: true,
    addedByUser: false,
    doneAt: null,
    hasWorktree: false,
    createdAt: over.updatedAt,
    remoteCommentCount: 0,
    draftCommentCount: 0,
    submittedVerdict: null,
    agentStatus: null,
    agentVerdict: null,
    agentCoverage: null,
    ...over,
  }
}

describe('sortInboxRows', () => {
  it('puts manually added rows first, then newest update first', () => {
    const rows = [
      row({ id: 1, updatedAt: '2026-09-07T10:00:00Z' }),
      row({ id: 2, updatedAt: '2026-09-01T10:00:00Z', addedByUser: true }),
      row({ id: 3, updatedAt: '2026-09-07T12:00:00Z' }),
      row({ id: 4, updatedAt: '2026-09-05T10:00:00Z', addedByUser: true }),
    ]
    expect(sortInboxRows(rows).map((r) => r.id)).toEqual([4, 2, 3, 1])
  })

  it('does not mutate its input', () => {
    const rows = [row({ id: 1, updatedAt: '2026-09-01T00:00:00Z' }), row({ id: 2, updatedAt: '2026-09-02T00:00:00Z' })]
    sortInboxRows(rows)
    expect(rows.map((r) => r.id)).toEqual([1, 2])
  })
})

describe('relativeTime', () => {
  const now = Date.parse('2026-09-07T12:00:00Z')
  it.each([
    ['2026-09-07T11:59:58Z', 'just now'],
    ['2026-09-07T11:59:20Z', '40s ago'],
    ['2026-09-07T11:15:00Z', '45m ago'],
    ['2026-09-07T10:00:00Z', '2h ago'],
    ['2026-09-06T10:00:00Z', 'yesterday'],
    ['2026-09-04T10:00:00Z', '3 days ago'],
  ])('%s -> %s', (iso, label) => {
    expect(relativeTime(iso, now)).toBe(label)
  })
})

describe('inboxSubtitle', () => {
  it('joins repo, pending count and poll interval', () => {
    expect(inboxSubtitle({ repo: 'shiphero/Shiphero-API', pending: 25, pollInterval: 5, autoReviewOnFetch: false })).toBe(
      'shiphero/Shiphero-API · 25 pending · polled every 5 min',
    )
  })

  it('names manual polling and the auto-review note', () => {
    expect(inboxSubtitle({ repo: 'r', pending: 0, pollInterval: 'manual', autoReviewOnFetch: true })).toBe(
      'r · 0 pending · polled manually · automatic review on new commits',
    )
  })
})

describe('fetchLine', () => {
  const now = Date.parse('2026-09-07T12:00:40Z')
  it('shortens the provider and shows the relative sync time', () => {
    expect(fetchLine({ syncedAt: '2026-09-07T12:00:00Z', provider: 'github', assigned: 4, now })).toBe('fetched 40s ago · gh · 4 assigned')
  })

  it('says never fetched before the first sync', () => {
    expect(fetchLine({ syncedAt: null, provider: 'gitlab', assigned: 0, now })).toBe('never fetched · glab · 0 assigned')
  })
})

describe('filterInboxRows', () => {
  const rows = [
    row({ id: 1, updatedAt: '2026-09-01T00:00:00Z', submittedVerdict: 'APPROVE' }),
    row({ id: 2, updatedAt: '2026-09-03T00:00:00Z', submittedVerdict: null }),
    row({ id: 3, updatedAt: '2026-09-02T00:00:00Z', submittedVerdict: 'REQUEST_CHANGES' }),
  ]

  it('keeps everything, newest first, by default', () => {
    expect(filterInboxRows(rows, DEFAULT_INBOX_FILTER).map((r) => r.id)).toEqual([2, 3, 1])
  })

  it('hides the states switched off', () => {
    const filter = { ...DEFAULT_INBOX_FILTER, show: { approved: false, commented: true, pending: true } }
    expect(filterInboxRows(rows, filter).map((r) => r.id)).toEqual([2, 3])
  })

  it('sorts oldest first when asked', () => {
    expect(filterInboxRows(rows, { ...DEFAULT_INBOX_FILTER, sort: 'oldest' }).map((r) => r.id)).toEqual([1, 3, 2])
  })

  it('counts per state, changes requested counting as commented', () => {
    expect(countByReviewState(rows)).toEqual({ approved: 1, commented: 1, pending: 1 })
  })
})
