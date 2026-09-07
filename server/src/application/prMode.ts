import type { ChatHub } from '../domain/chat.ts'
import { makeOpenPullRequest } from '../domain/commands/openPullRequest.ts'
import { syncRepo } from '../domain/commands/syncRepo.ts'
import type { Clock, Events } from '../domain/ports.ts'
import type { ProviderKind, PullRequestProvider } from '../domain/pullRequests.ts'
import type { Store } from '../domain/store.ts'
import type { Worktrees } from '../domain/worktrees.ts'
import type { OpencodeChatOptions } from '../infrastructure/opencodeChat.ts'
import { createApp } from './app.ts'
import { prRoutes } from './prRoutes.ts'
import { prScopes } from './scopes.ts'
import { scheduler, type Scheduler } from './scheduler.ts'

export type PrModeDeps = {
  store: Store
  providers: Record<ProviderKind, PullRequestProvider>
  worktrees: Worktrees
  events: Events
  clock: Clock
  opencodeUrl: string
  /** Directory opencode resolves agents and config for. */
  directory: string
  staticDir: string | null
  /** Defaults to the real opencode hub; tests inject a fake. */
  openChat?: (opts: OpencodeChatOptions) => Promise<ChatHub>
}

/** Wire the PR-mode app from its adapters. The scheduler is returned unstarted. */
export function prMode(deps: PrModeDeps): { app: ReturnType<typeof createApp>; scheduler: Scheduler } {
  const sync = scheduler({ store: deps.store, syncRepo: (repoId) => syncRepo(deps, { repoId }) })
  const app = createApp({
    scopes: prScopes({ store: deps.store, opencodeUrl: deps.opencodeUrl, events: deps.events, openChat: deps.openChat }),
    store: deps.store,
    events: deps.events,
    settingsChanged: sync.reschedule,
    opencodeUrl: deps.opencodeUrl,
    directory: deps.directory,
    routes: [prRoutes({ ...deps, openPullRequest: makeOpenPullRequest(deps), scheduler: sync })],
    staticDir: deps.staticDir,
  })
  return { app, scheduler: sync }
}
