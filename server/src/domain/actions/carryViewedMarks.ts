import { unchangedFiles } from '../diff.ts'
import type { PrDiff } from '../pullRequests.ts'
import type { Store } from '../store.ts'

/**
 * When a PR moves to a new head, keep "viewed" on the files whose change did not move with it,
 * so the reviewer only re-reads what is new.
 * Pre-conditions:
 * - called inside `store.transaction`; both diffs belong to the same PR
 * Post-conditions:
 * - every file viewed at `previous.headSha` whose change is identical in `next` is viewed at
 *   `next.headSha`; returns those paths
 */
export function carryViewedMarks(viewed: Store['viewed'], prId: number, previous: PrDiff, next: PrDiff): string[] {
  const seen = new Set(
    viewed
      .list(prId)
      .filter((m) => m.headSha === previous.headSha)
      .map((m) => m.path),
  )
  if (seen.size === 0) return []
  const carried = unchangedFiles(previous.patch, next.patch).filter((path) => seen.has(path))
  for (const path of carried) viewed.set(prId, path, next.headSha)
  return carried
}
