import type { RemoteComment } from '../pullRequests.ts'
import type { Store } from '../store.ts'

/**
 * Make the local copy of a PR's review comments equal to what the provider returned.
 * Pre-conditions:
 * - called inside `store.transaction`
 * Post-conditions:
 * - comments no longer present remotely are gone locally
 */
export function replaceComments(comments: Pick<Store['comments'], 'replace'>, prId: number, rows: RemoteComment[], now: string): void {
  comments.replace(prId, rows, now)
}
