import { NotFound } from '../errors.ts'
import type { Store } from '../store.ts'

export type MarkViewedDeps = { store: Pick<Store, 'transaction' | 'pullRequests' | 'viewed'> }

export type MarkViewedRequest = { prId: number; path: string; headSha: string | null }

/**
 * Record (or clear, with `headSha = null`) that a file was viewed at a given head.
 * Pre-conditions:
 * - the PR exists (else `NotFound`)
 * Post-conditions:
 * - returns every viewed mark of the PR
 */
export function markViewed(deps: MarkViewedDeps, req: MarkViewedRequest): { path: string; headSha: string }[] {
  const { store } = deps
  return store.transaction(() => {
    if (!store.pullRequests.get(req.prId)) throw new NotFound('pull request', req.prId)
    store.viewed.set(req.prId, req.path, req.headSha)
    return store.viewed.list(req.prId)
  })
}
