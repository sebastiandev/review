import type { PastReviewRow, Verdict, WorktreeRow } from '@review/shared'

export const PAST_FILTERS = ['all', 'approved', 'changes', 'commented'] as const
export type PastFilter = (typeof PAST_FILTERS)[number]

export const FILTER_LABEL: Record<PastFilter, string> = {
  all: 'All',
  approved: 'Approved',
  changes: 'Changes requested',
  commented: 'Commented',
}

/** The `?verdict=` value a sidebar filter asks the server for; `all` asks for nothing. */
export function filterVerdict(filter: PastFilter): Verdict | null {
  switch (filter) {
    case 'all':
      return null
    case 'approved':
      return 'APPROVE'
    case 'changes':
      return 'REQUEST_CHANGES'
    case 'commented':
      return 'COMMENT'
  }
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  APPROVE: 'approved',
  REQUEST_CHANGES: 'changes requested',
  COMMENT: 'commented',
}

/** Pill modifier per README §6: green for approved, red for changes requested, neutral for commented. */
export function verdictPillClass(verdict: Verdict): string {
  switch (verdict) {
    case 'APPROVE':
      return 'pill pill-approved'
    case 'REQUEST_CHANGES':
      return 'pill pill-changes'
    case 'COMMENT':
      return 'pill'
  }
}

export type PastReviewLine = PastReviewRow & { worktreePath: string | null }

/** Joins each review with its PR's worktree path (the inventory is keyed by PR, reviews by submission). */
export function withWorktreePaths(rows: PastReviewRow[], worktrees: Pick<WorktreeRow, 'prId' | 'path'>[]): PastReviewLine[] {
  const byPr = new Map(worktrees.map((w) => [w.prId, w.path]))
  return rows.map((row) => ({ ...row, worktreePath: byPr.get(row.prId) ?? null }))
}
