import { Hono } from 'hono'
import type { ModelRef, Verdict } from '@review/shared'
import { addPullRequests, listOpenPreviews, resolvePullRequest } from '../domain/commands/addPullRequests.ts'
import { dismissFinding, keepAllFindings, keepFinding } from '../domain/commands/agentFindings.ts'
import { addDraftComment, deleteDraftComment, editDraftComment } from '../domain/commands/draftComments.ts'
import { markDone, reopenPullRequest } from '../domain/commands/markDone.ts'
import type { OpenPullRequest } from '../domain/commands/openPullRequest.ts'
import { removeWorktrees } from '../domain/commands/removeWorktrees.ts'
import { submitReview } from '../domain/commands/submitReview.ts'
import { trackRepo, untrackRepo } from '../domain/commands/trackRepos.ts'
import { markViewed } from '../domain/commands/viewedFiles.ts'
import type { Clock, Events } from '../domain/ports.ts'
import type { ProviderKind, PullRequestProvider, RepoRef } from '../domain/pullRequests.ts'
import type { Anchor } from '../domain/review.ts'
import type { Store } from '../domain/store.ts'
import type { Worktrees } from '../domain/worktrees.ts'
import type { ReviewQueue } from './reviewQueue.ts'
import type { Scheduler } from './scheduler.ts'

export type PrRoutesDeps = {
  store: Store
  providers: Record<ProviderKind, PullRequestProvider>
  worktrees: Worktrees
  events: Events
  clock: Clock
  openPullRequest: OpenPullRequest
  scheduler: Pick<Scheduler, 'runNow'>
  reviewQueue: ReviewQueue
}

/** PR-mode routes. Each one parses input, calls one Command or one read model, and maps the result. */
export function prRoutes(deps: PrRoutesDeps) {
  const { store } = deps
  const app = new Hono()
  const id = (value: string) => Number(value)

  app.get('/api/repos', (c) => c.json(store.views.repoCounts()))

  app.post('/api/repos', async (c) => {
    const ref = (await c.req.json()) as RepoRef
    return c.json(trackRepo(deps, { provider: ref.provider, owner: ref.owner, name: ref.name }), 201)
  })

  app.delete('/api/repos/:id', (c) => {
    untrackRepo(deps, { repoId: id(c.req.param('id')) })
    return c.body(null, 204)
  })

  app.post('/api/repos/:id/sync', (c) => c.json({ status: deps.scheduler.runNow(id(c.req.param('id'))) }, 202))

  app.post('/api/sync', (c) => c.json({ status: deps.scheduler.runNow() }, 202))

  app.get('/api/repos/:id/prs', (c) => c.json(store.views.inbox(id(c.req.param('id')))))

  app.get('/api/repos/:id/prs/open', async (c) => c.json(await listOpenPreviews(deps, { repoId: id(c.req.param('id')) })))

  app.post('/api/repos/:id/prs/resolve', async (c) => {
    const { input } = (await c.req.json()) as { input: string }
    const result = await resolvePullRequest(deps, { repoId: id(c.req.param('id')), input })
    return result ? c.json(result) : c.json({ code: 'not_found' }, 404)
  })

  app.post('/api/repos/:id/prs', async (c) => {
    const body = (await c.req.json()) as { numbers: number[]; reviewOnOpen?: boolean }
    const repoId = id(c.req.param('id'))
    const added = new Set((await addPullRequests(deps, { repoId, numbers: body.numbers, reviewOnOpen: body.reviewOnOpen ?? false })).map((p) => p.id))
    return c.json(store.views.inbox(repoId).filter((row) => added.has(row.id)), 201)
  })

  app.get('/api/prs/:id', (c) => {
    const detail = store.views.prDetail(id(c.req.param('id')))
    return detail ? c.json(detail) : c.json({ code: 'not_found' }, 404)
  })

  /** Starts (or confirms) the worktree checkout; progress arrives over /api/events. */
  app.post('/api/prs/:id/open', (c) => {
    const prId = id(c.req.param('id'))
    deps.openPullRequest({ prId }).catch((e: unknown) => console.error(`open pr ${prId}:`, e))
    return c.body(null, 202)
  })

  app.post('/api/prs/:id/done', async (c) => {
    await markDone(deps, { prId: id(c.req.param('id')) })
    return c.body(null, 204)
  })

  app.delete('/api/prs/:id/done', (c) => {
    reopenPullRequest(deps, { prId: id(c.req.param('id')) })
    return c.body(null, 204)
  })

  app.put('/api/prs/:id/viewed', async (c) => {
    const body = (await c.req.json()) as { path: string; headSha: string | null }
    return c.json(markViewed(deps, { prId: id(c.req.param('id')), path: body.path, headSha: body.headSha }))
  })

  app.post('/api/prs/:id/comments', async (c) => {
    const body = (await c.req.json()) as Anchor & { body: string; inReplyTo?: string | null }
    const comment = addDraftComment(deps, {
      prId: id(c.req.param('id')),
      path: body.path,
      line: body.line,
      startLine: body.startLine ?? null,
      side: body.side,
      body: body.body,
      inReplyTo: body.inReplyTo ?? null,
    })
    return c.json(comment, 201)
  })

  app.patch('/api/prs/:id/comments/:cid', async (c) => {
    const body = (await c.req.json()) as { body?: string; selected?: boolean }
    return c.json(editDraftComment(deps, { prId: id(c.req.param('id')), commentId: id(c.req.param('cid')), ...body }))
  })

  app.delete('/api/prs/:id/comments/:cid', (c) => {
    deleteDraftComment(deps, { prId: id(c.req.param('id')), commentId: id(c.req.param('cid')) })
    return c.body(null, 204)
  })

  app.post('/api/prs/:id/submit', async (c) => {
    const body = (await c.req.json()) as { verdict: Verdict; body: string; confirmApprove?: boolean }
    const submission = await submitReview(deps, {
      prId: id(c.req.param('id')),
      verdict: body.verdict,
      body: body.body,
      confirmApprove: body.confirmApprove ?? false,
    })
    return c.json(submission)
  })

  /** Start an agent run; `agent`/`model`/`variant` default to the settings. Progress arrives over /api/events. */
  app.post('/api/prs/:id/review', async (c) => {
    const prId = id(c.req.param('id'))
    if (!store.pullRequests.get(prId)) return c.json({ code: 'not_found' }, 404)
    // Body is optional: defaults alone are a valid request.
    const body = (await c.req.json().catch(() => ({}))) as { agent?: string; model?: ModelRef | null; variant?: string | null }
    const settings = store.settings.read()
    const status = deps.reviewQueue.enqueue({
      prId,
      agent: body.agent ?? settings.defaultReviewAgent,
      model: body.model === undefined ? settings.defaultModel : body.model,
      variant: body.variant === undefined ? settings.defaultVariant : body.variant,
    })
    return c.json({ status }, 202)
  })

  app.get('/api/prs/:id/reviews', (c) => c.json(store.agentReviews.listForPr(id(c.req.param('id')))))

  app.post('/api/prs/:id/findings/:fid/keep', (c) =>
    c.json(keepFinding(deps, { prId: id(c.req.param('id')), findingId: id(c.req.param('fid')) }), 201),
  )

  app.delete('/api/prs/:id/findings/:fid/keep', (c) => {
    dismissFinding(deps, { prId: id(c.req.param('id')), findingId: id(c.req.param('fid')) })
    return c.body(null, 204)
  })

  app.post('/api/prs/:id/reviews/:rid/keep-all', (c) =>
    c.json(keepAllFindings(deps, { prId: id(c.req.param('id')), agentReviewId: id(c.req.param('rid')) })),
  )

  app.get('/api/reviews', (c) => c.json(store.views.pastReviews((c.req.query('verdict') as Verdict | undefined) ?? null)))

  app.get('/api/worktrees', async (c) => {
    const rows = await Promise.all(
      store.views.worktrees().map(async (row) => ({ ...row, sizeBytes: await deps.worktrees.sizeBytes(row.path) })),
    )
    return c.json({ rows, totalBytes: rows.reduce((sum, r) => sum + r.sizeBytes, 0) })
  })

  app.delete('/api/worktrees', async (c) => {
    const { prIds } = (await c.req.json()) as { prIds: number[] }
    return c.json({ removed: await removeWorktrees(deps, { prIds }) })
  })

  return app
}
