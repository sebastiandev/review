import type { InboxRow, RepoSummary } from '@review/shared'

export type PaletteRow = { pr: InboxRow; repo: string; author: string }
export type PaletteGroup = { repo: string; rows: PaletteRow[] }

/** `owner/name` of a repo. */
export function paletteRepoLabel(repo: RepoSummary): string {
  return `${repo.owner}/${repo.name}`
}

/**
 * Case-insensitive substring match over title, number, author, branch and repo. Returns the flat match order
 * (what the arrow keys walk) — group it with `groupByRepo` for display.
 */
export function matchPrs(rows: PaletteRow[], query: string): PaletteRow[] {
  const q = query.trim().toLowerCase()
  if (!q) return rows
  return rows.filter((r) => `${r.pr.title} ${r.pr.number} ${r.author} ${r.pr.headRef} ${r.repo}`.toLowerCase().includes(q))
}

/** Groups matches by repository, keeping the flat order inside each group and the order of first appearance across groups. */
export function groupByRepo(rows: PaletteRow[]): PaletteGroup[] {
  const groups: PaletteGroup[] = []
  for (const row of rows) {
    const group = groups.find((g) => g.repo === row.repo)
    if (group) group.rows.push(row)
    else groups.push({ repo: row.repo, rows: [row] })
  }
  return groups
}

/** `32 pending` with no query, `7 of 32` while filtering. */
export function paletteCount(matched: number, total: number, query: string): string {
  return query.trim() ? `${matched} of ${total}` : `${total} pending`
}

/** `4 prs` / `1 pr`. */
export function groupCount(n: number): string {
  return `${n} ${n === 1 ? 'pr' : 'prs'}`
}

/** Highlighted index clamped to the match list; 0 when nothing matches. */
export function clampIndex(index: number, length: number): number {
  return length === 0 ? 0 : Math.max(0, Math.min(index, length - 1))
}
