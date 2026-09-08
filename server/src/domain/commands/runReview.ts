import { join } from 'node:path'
import { buildReviewPrompt, InvalidPayload, parsePayload, type RunReviewRequest, type RunReviewResult } from '../agentReview.ts'
import type { AgentRunner, PayloadFiles } from '../agentRunner.ts'
import { NotFound, WorktreeMissing } from '../errors.ts'
import type { Clock, Events } from '../ports.ts'
import { repoLabel, type ProviderKind, type PullRequestProvider } from '../pullRequests.ts'
import type { Store } from '../store.ts'

export type RunReviewDeps = {
  store: Pick<Store, 'transaction' | 'repos' | 'pullRequests' | 'diffs' | 'comments' | 'agentReviews'>
  providers: Record<ProviderKind, Pick<PullRequestProvider, 'viewerLogin'>>
  runner: AgentRunner
  payloads: PayloadFiles
  /** Absolute path exists on disk. Used for the linked spec. */
  fileExists: (path: string) => Promise<boolean>
  events: Events
  clock: Clock
  /** Give up on the agent after this long. Default 20 minutes. */
  timeoutMs?: number
}

export const DEFAULT_REVIEW_TIMEOUT_MS = 20 * 60_000

/**
 * Run the agent once over the PR's current head and ingest what it wrote.
 * Pre-conditions:
 * - the PR and its repo exist (else `NotFound`)
 * - the PR has a worktree path (else `WorktreeMissing`) and a cached diff for its head (else `NotFound`)
 * Post-conditions:
 * - one `agent_review` row moves queued → running → ready with verdict, summary and findings;
 *   comments the agent anchored outside the diff are dropped and counted in `invalidAnchorCount`
 * - `review.queued`, `review.running`, then `review.ready` emitted; on any failure after the
 *   row exists it is marked failed with the message, `review.failed` emitted, and the error rethrown
 */
export async function runReview(deps: RunReviewDeps, req: RunReviewRequest): Promise<RunReviewResult> {
  const { store, events } = deps
  const pr = store.pullRequests.get(req.prId)
  if (!pr) throw new NotFound('pull request', req.prId)
  const repo = store.repos.get(pr.repoId)
  if (!repo) throw new NotFound('repo', pr.repoId)
  const worktreePath = pr.worktreePath
  if (!worktreePath) throw new WorktreeMissing(pr.id)
  const diff = store.diffs.get(pr.id, pr.headSha)
  if (!diff) throw new NotFound('diff', `${pr.id}@${pr.headSha}`)

  const review = store.transaction(() =>
    store.agentReviews.insert({ prId: pr.id, headSha: pr.headSha, agent: req.agent, model: req.model, variant: req.variant }),
  )
  events.emit({ type: 'review.queued', prId: pr.id, agentReviewId: review.id })

  try {
    store.transaction(() => store.agentReviews.update(review.id, { status: 'running', startedAt: deps.clock() }))
    events.emit({ type: 'review.running', prId: pr.id, agentReviewId: review.id })

    const viewer = await deps.providers[repo.provider].viewerLogin()
    const priorComments = store.comments
      .list(pr.id)
      .filter((c) => c.author === viewer)
      .map((c) => (c.line === null ? `${c.path}: ${c.body}` : `${c.path}:${c.line}: ${c.body}`))
    const specPath = pr.specRef ? join(worktreePath, pr.specRef) : null
    const spec = specPath && (await deps.fileExists(specPath)) ? specPath : null

    const payloadPath = deps.payloads.pathFor(review)
    const diffPath = deps.payloads.diffPathFor(review)
    await deps.payloads.write(diffPath, diff.patch)
    const prompt = buildReviewPrompt({ pr, repo, worktreePath, diffPath, payloadPath, priorComments, specPath: spec })
    await withTimeout(
      deps.runner.run(
        { directory: worktreePath, title: `review ${repoLabel(repo)}#${pr.number}`, agent: req.agent, model: req.model, variant: req.variant, prompt },
        (sessionId) => store.transaction(() => store.agentReviews.update(review.id, { sessionId })),
      ),
      deps.timeoutMs ?? DEFAULT_REVIEW_TIMEOUT_MS,
    )

    const text = await deps.payloads.read(payloadPath)
    if (text === null) throw new InvalidPayload(`agent wrote nothing to ${payloadPath}`)
    const parsed = parsePayload(text, diff.anchors)

    const result = store.transaction(() => {
      store.agentReviews.update(review.id, {
        status: 'ready',
        verdict: parsed.verdict,
        summary: parsed.body,
        invalidAnchorCount: parsed.invalid,
        finishedAt: deps.clock(),
      })
      const findings = store.agentReviews.insertFindings(review.id, parsed.findings)
      return { review: store.agentReviews.get(review.id)!, findings }
    })
    events.emit({ type: 'review.ready', prId: pr.id, agentReviewId: review.id, verdict: parsed.verdict, findingCount: result.findings.length })
    return result
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    store.transaction(() => store.agentReviews.update(review.id, { status: 'failed', error: message, finishedAt: deps.clock() }))
    events.emit({ type: 'review.failed', prId: pr.id, agentReviewId: review.id, message })
    throw e
  }
}

function withTimeout(run: Promise<void>, ms: number): Promise<void> {
  let timer: NodeJS.Timeout
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`agent did not finish within ${Math.round(ms / 60_000)} min`)), ms)
  })
  return Promise.race([run, timeout]).finally(() => clearTimeout(timer))
}
