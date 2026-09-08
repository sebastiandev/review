import type { PullRequest, RemoteReview } from '../pullRequests.ts'
import type { Store } from '../store.ts'

/**
 * Store reviews the user submitted on the provider (e.g. in the browser) that this app has not
 * seen, so they count like reviews submitted from here.
 * Pre-conditions:
 * - called inside `store.transaction`; `reviews` are the viewer's own
 * Post-conditions:
 * - one `submission` row with `source = 'remote'` per unseen review; when one targets the PR's
 *   current head, every file of the cached diff is marked viewed; returns the ids recorded
 */
export function recordRemoteReviews(
  store: Pick<Store, 'submissions' | 'diffs' | 'viewed'>,
  pr: Pick<PullRequest, 'id' | 'headSha'>,
  reviews: RemoteReview[],
): string[] {
  const known = store.submissions.remoteIds(pr.id)
  const recorded: string[] = []
  for (const review of reviews) {
    if (known.has(review.remoteId)) continue
    store.submissions.insert(
      {
        prId: pr.id,
        headSha: review.headSha,
        draftId: null,
        remoteReviewId: review.remoteId,
        source: 'remote',
        verdict: review.verdict,
        body: review.body,
        agentVerdict: null,
        submittedAt: review.submittedAt,
      },
      '{}',
    )
    recorded.push(review.remoteId)
    if (review.headSha === pr.headSha) {
      for (const file of store.diffs.get(pr.id, pr.headSha)?.files ?? []) store.viewed.set(pr.id, file.path, pr.headSha)
    }
  }
  return recorded
}
