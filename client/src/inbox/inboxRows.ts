import type { InboxRow, UserSettings } from '@review/shared'

/** Manually added PRs first, then most recently updated first. */
export function sortInboxRows(rows: InboxRow[]): InboxRow[] {
  return filterInboxRows(rows, DEFAULT_INBOX_FILTER)
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** `40s ago`, `2h ago`, `yesterday`, `3 days ago`; `just now` under 5 s. */
export function relativeTime(iso: string, now: number): string {
  const elapsed = Math.max(0, now - Date.parse(iso))
  if (elapsed < 5_000) return 'just now'
  if (elapsed < MINUTE) return `${Math.floor(elapsed / 1000)}s ago`
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`
  const days = Math.floor(elapsed / DAY)
  return days === 1 ? 'yesterday' : `${days} days ago`
}

/** `polled every 5 min`, `polled manually`. */
export function pollLabel(interval: UserSettings['pollInterval']): string {
  return interval === 'manual' ? 'polled manually' : `polled every ${interval} min`
}

type SubtitleInput = {
  repo: string
  pending: number
  pollInterval: UserSettings['pollInterval']
  autoReviewOnFetch: boolean
}

/** `{repo} · {n} pending · polled every {interval}` plus the auto-review note when that setting is on. */
export function inboxSubtitle({ repo, pending, pollInterval, autoReviewOnFetch }: SubtitleInput): string {
  const parts = [repo, `${pending} pending`, pollLabel(pollInterval)]
  if (autoReviewOnFetch) parts.push('automatic review on new commits')
  return parts.join(' · ')
}

const PROVIDER_SHORT: Record<string, string> = { github: 'gh', gitlab: 'glab' }

type FetchLineInput = { syncedAt: string | null; provider: string; assigned: number; now: number }

/** `fetched 40s ago · gh · 4 assigned`; `never fetched` before the first sync. */
export function fetchLine({ syncedAt, provider, assigned, now }: FetchLineInput): string {
  const fetched = syncedAt ? `fetched ${relativeTime(syncedAt, now)}` : 'never fetched'
  return `${fetched} · ${PROVIDER_SHORT[provider] ?? provider} · ${assigned} assigned`
}

export type ReviewState = 'approved' | 'commented' | 'pending'
export type InboxSort = 'newest' | 'oldest'
export type InboxFilter = { show: Record<ReviewState, boolean>; sort: InboxSort }

export const DEFAULT_INBOX_FILTER: InboxFilter = { show: { approved: true, commented: true, pending: true }, sort: 'newest' }

export const REVIEW_STATE_LABEL: Record<ReviewState, string> = { approved: 'Approved', commented: 'Commented', pending: 'Pending' }

/** Where my review of the current head stands: approved, commented (incl. changes requested), or nothing yet. */
export function reviewStateOf(row: Pick<InboxRow, 'submittedVerdict'>): ReviewState {
  if (row.submittedVerdict === 'APPROVE') return 'approved'
  if (row.submittedVerdict === null) return 'pending'
  return 'commented'
}

/** Rows whose review state is switched on, in the requested date order (manually added PRs still first). */
export function filterInboxRows(rows: InboxRow[], filter: InboxFilter): InboxRow[] {
  const kept = rows.filter((r) => filter.show[reviewStateOf(r)])
  return kept.sort((a, b) => {
    if (a.addedByUser !== b.addedByUser) return a.addedByUser ? -1 : 1
    const byDate = b.updatedAt.localeCompare(a.updatedAt)
    return filter.sort === 'newest' ? byDate : -byDate
  })
}

/** Counts per review state, for the filter chips. */
export function countByReviewState(rows: InboxRow[]): Record<ReviewState, number> {
  const counts: Record<ReviewState, number> = { approved: 0, commented: 0, pending: 0 }
  for (const r of rows) counts[reviewStateOf(r)]++
  return counts
}
