import type { RunReviewRequest, RunReviewResult } from '../domain/agentReview.ts'

export type ReviewQueueDeps = {
  /** The `runReview` Command, bound to its deps. */
  runReview: (req: RunReviewRequest) => Promise<RunReviewResult>
  log?: (message: string) => void
}

export type ReviewQueue = {
  /** Start a run now, or report `busy` while one is in progress. Depth 1: nothing waits. */
  enqueue(req: RunReviewRequest): 'queued' | 'busy'
}

/** Serialises agent runs: one at a time, no backlog. The run itself emits `review.*`. */
export function reviewQueue(deps: ReviewQueueDeps): ReviewQueue {
  const log = deps.log ?? ((m) => console.error(m))
  let running = false
  return {
    enqueue(req) {
      if (running) return 'busy'
      running = true
      deps
        .runReview(req)
        .catch((e: unknown) => log(`review pr ${req.prId}: ${e instanceof Error ? e.message : String(e)}`))
        .finally(() => {
          running = false
        })
      return 'queued'
    },
  }
}
