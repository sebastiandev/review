import type { AgentRunner, PayloadFiles } from '../domain/agentRunner.ts'
import type { ChatHub } from '../domain/chat.ts'
import { makeOpenPullRequest } from '../domain/commands/openPullRequest.ts'
import { runReview } from '../domain/commands/runReview.ts'
import { syncRepo } from '../domain/commands/syncRepo.ts'
import type { Clock, Events } from '../domain/ports.ts'
import type { ProviderKind, PullRequest, PullRequestProvider } from '../domain/pullRequests.ts'
import type { Store } from '../domain/store.ts'
import type { Worktrees } from '../domain/worktrees.ts'
import type { OpencodeChatOptions } from '../infrastructure/opencodeChat.ts'
import { createApp } from './app.ts'
import { prRoutes } from './prRoutes.ts'
import { reviewQueue } from './reviewQueue.ts'
import { prScopes } from './scopes.ts'
import { scheduler, type Scheduler } from './scheduler.ts'

export type PrModeDeps = {
  store: Store
  providers: Record<ProviderKind, PullRequestProvider>
  worktrees: Worktrees
  runner: AgentRunner
  payloads: PayloadFiles
  fileExists: (path: string) => Promise<boolean>
  events: Events
  clock: Clock
  opencodeUrl: string
  /** Directory opencode resolves agents and config for. */
  directory: string
  staticDir: string | null
  /** Defaults to the real opencode hub; tests inject a fake. */
  openChat?: (opts: OpencodeChatOptions) => Promise<ChatHub>
}

/**
 * Wire the PR-mode app from its adapters. The scheduler is returned unstarted.
 * Policies, both "one agent run per head":
 * - a PR added with `reviewOnOpen` is reviewed when its worktree becomes ready;
 * - when `autoReviewOnFetch` is on and the synced repo has `autoReview`, every active PR with a
 *   worktree whose head has not been reviewed is reviewed. The queue holds one run, so the
 *   others are picked up on later syncs.
 */
export function prMode(deps: PrModeDeps): { app: ReturnType<typeof createApp>; scheduler: Scheduler } {
  const sync = scheduler({ store: deps.store, syncRepo: (repoId) => syncRepo(deps, { repoId }) })
  const reviews = reviewQueue({ runReview: (req) => runReview(deps, req) })
  const enqueueUnreviewed = (pr: PullRequest) => {
    if (deps.store.agentReviews.latest(pr.id, pr.headSha, null)) return
    const settings = deps.store.settings.read()
    reviews.enqueue({ prId: pr.id, agent: settings.defaultReviewAgent, model: settings.defaultModel, variant: settings.defaultVariant })
  }
  deps.events.subscribe((e) => {
    if (e.type === 'worktree.ready') {
      const pr = deps.store.pullRequests.get(e.prId)
      if (pr?.reviewOnOpen) enqueueUnreviewed(pr)
      return
    }
    if (e.type !== 'sync.finished') return
    if (!deps.store.settings.read().autoReviewOnFetch || !deps.store.repos.get(e.repoId)?.autoReview) return
    for (const pr of deps.store.pullRequests.listByRepo(e.repoId, { active: true })) {
      if (pr.worktreePath !== null) enqueueUnreviewed(pr)
    }
  })
  const app = createApp({
    scopes: prScopes({ store: deps.store, opencodeUrl: deps.opencodeUrl, events: deps.events, openChat: deps.openChat }),
    store: deps.store,
    events: deps.events,
    settingsChanged: sync.reschedule,
    opencodeUrl: deps.opencodeUrl,
    directory: deps.directory,
    routes: [prRoutes({ ...deps, openPullRequest: makeOpenPullRequest(deps), scheduler: sync, reviewQueue: reviews })],
    staticDir: deps.staticDir,
  })
  return { app, scheduler: sync }
}
