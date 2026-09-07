import { buildDiffDocument } from '../diff.ts'
import { repoLabel, type PrDiff, type PullRequest, type RepoRef } from '../pullRequests.ts'
import type { Store } from '../store.ts'

/**
 * Store the parsed diff for the PR's current head, unless that head is already cached.
 * Pre-conditions:
 * - called inside `store.transaction`; `patch` is the diff of `pr.headSha`
 * Post-conditions:
 * - one `pr_diff` row per (pr, head sha); an existing row is returned as-is
 */
export function cachePrDiff(diffs: Store['diffs'], repo: RepoRef, pr: PullRequest, patch: string, now: string): PrDiff {
  const cached = diffs.get(pr.id, pr.headSha)
  if (cached) return cached
  const doc = buildDiffDocument({ kind: 'pr', repo: repoLabel(repo), number: pr.number, headSha: pr.headSha }, patch)
  const diff: PrDiff = { prId: pr.id, headSha: pr.headSha, baseSha: pr.baseSha, patch, files: doc.files, anchors: doc.anchors, fetchedAt: now }
  diffs.insert(diff)
  return diff
}
