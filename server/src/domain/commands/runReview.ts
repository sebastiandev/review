import { join } from 'node:path'
import { buildReviewPrompt, extractInlinePayload, InvalidPayload, parsePayload, type RunReviewRequest, type RunReviewResult } from '../agentReview.ts'
import type { AgentRunner, PayloadFiles } from '../agentRunner.ts'
import { NotFound, WorktreeMissing, WorktreeRevisionMismatch } from '../errors.ts'
import type { Clock, Events } from '../ports.ts'
import { repoLabel, type ProviderKind, type PullRequestProvider } from '../pullRequests.ts'
import type { Store } from '../store.ts'
import type { Worktrees } from '../worktrees.ts'

export type RunReviewDeps = {
  store: Pick<Store, 'transaction' | 'repos' | 'pullRequests' | 'diffs' | 'comments' | 'agentReviews'>
  providers: Record<ProviderKind, Pick<PullRequestProvider, 'viewerLogin' | 'cloneUrl'>>
  worktrees: Pick<Worktrees, 'exists' | 'headSha' | 'checkout'>
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
 * - the worktree is fetched/checked out to the run's head before the agent starts;
 *   preparation failures are recorded without launching an agent
 * - one `agent_review` row moves queued → running → ready with verdict, summary and findings;
 *   comments outside the diff are preserved in the summary and counted in `invalidAnchorCount`
 * - `review.queued`, `review.running`, one `review.progress` per completed tool call, then
 *   `review.ready` emitted; on any failure after the
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

    // Sync can advance the cached diff without moving an existing checkout. Reserve the
    // run before preparing its source so refresh/release paths see it as active.
    if (!(await deps.worktrees.exists(worktreePath))) throw new WorktreeMissing(pr.id)
    if ((await deps.worktrees.headSha(worktreePath)) !== pr.headSha) {
      try {
        await deps.worktrees.checkout(
          worktreePath,
          { repo, cloneUrl: deps.providers[repo.provider].cloneUrl(repo), number: pr.number, headRef: pr.headRef, headSha: pr.headSha },
          (stage) => events.emit({ type: 'worktree.progress', prId: pr.id, stage }),
        )
        const preparedHead = await deps.worktrees.headSha(worktreePath)
        if (preparedHead !== pr.headSha) throw new WorktreeRevisionMismatch(pr.headSha, preparedHead)
        events.emit({ type: 'worktree.ready', prId: pr.id, path: worktreePath })
      } catch (error) {
        events.emit({ type: 'worktree.failed', prId: pr.id, message: error instanceof Error ? error.message : String(error) })
        throw error
      }
    }

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
    const prompt = buildReviewPrompt({ pr, repo, worktreePath, diffPath, priorComments, specPath: spec })
    const actualHead = await deps.worktrees.headSha(worktreePath)
    if (actualHead !== pr.headSha) throw new WorktreeRevisionMismatch(pr.headSha, actualHead)
    const outcome = await deps.runner.run(
      {
        directory: worktreePath, title: `review ${repoLabel(repo)}#${pr.number}`,
        agent: req.agent, model: req.model, variant: req.variant, prompt,
        timeoutMs: deps.timeoutMs ?? DEFAULT_REVIEW_TIMEOUT_MS,
      },
      (sessionId) => store.transaction(() => store.agentReviews.update(review.id, { sessionId })),
      (step) => events.emit({ type: 'review.progress', prId: pr.id, agentReviewId: review.id, tool: step.tool, title: step.title }),
    )

    const text = extractInlinePayload(outcome.finalText)
    if (text === null) throw new InvalidPayload('agent replied without a valid JSON payload')
    await deps.payloads.write(payloadPath, text)
    const parsed = parsePayload(text, diff.anchors, { pr: pr.number, repo: repoLabel(repo), headSha: pr.headSha })

    const result = store.transaction(() => {
      store.agentReviews.update(review.id, {
        status: 'ready',
        verdict: parsed.verdict,
        summary: parsed.body,
        invalidAnchorCount: parsed.invalid,
        coverage: parsed.coverage,
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
