import type { ChatHub } from '../domain/chat.ts'
import type { DiffSource } from '../domain/diff.ts'
import { NotFound, WorktreeMissing } from '../domain/errors.ts'
import type { Events } from '../domain/ports.ts'
import { repoLabel, type PrDiff, type PullRequest, type Repo } from '../domain/pullRequests.ts'
import type { Store } from '../domain/store.ts'
import { prDiffSource } from '../infrastructure/diffSources.ts'
import { openOpencodeChat, type OpencodeChatOptions } from '../infrastructure/opencodeChat.ts'

/** What one `/api/scopes/:scope` serves: the diff and the conversations about it. */
export type Scope = { source: DiffSource; chat: ChatHub }

/** Maps a scope id (`local` | `pr:<id>`) to its diff and chat. Throws `NotFound` for unknown ids. */
export type ScopeRegistry = { resolve(id: string): Promise<Scope> }

export const LOCAL_SCOPE = 'local'

/** Scope id for a stored PR. */
export const prScopeId = (prId: number) => `pr:${prId}`

/** One scope, fixed for the process (diff mode). Its chat events reach the bus stamped with `id`. */
export function fixedScope(id: string, source: DiffSource, chat: ChatHub, events: Events): ScopeRegistry {
  forwardChatEvents(chat, id, events)
  const scope: Scope = { source, chat }
  return {
    async resolve(requested) {
      if (requested !== id) throw new NotFound('scope', requested)
      return scope
    },
  }
}

export type PrScopesDeps = {
  store: Pick<Store, 'repos' | 'pullRequests' | 'diffs'>
  opencodeUrl: string
  events: Events
  /** Defaults to `openOpencodeChat`; tests inject a fake. */
  openChat?: (opts: OpencodeChatOptions) => Promise<ChatHub>
}

/**
 * One scope per PR, built on first request from the cached diff for `pr.headSha` and a chat
 * rooted in the PR's worktree. Requires the worktree to exist (else `WorktreeMissing`).
 */
export function prScopes(deps: PrScopesDeps): ScopeRegistry {
  const openChat = deps.openChat ?? openOpencodeChat
  const cache = new Map<number, Promise<Scope>>()

  const build = async (prId: number): Promise<Scope> => {
    const pr = deps.store.pullRequests.get(prId)
    if (!pr) throw new NotFound('pull request', prId)
    const repo = deps.store.repos.get(pr.repoId)
    if (!repo) throw new NotFound('repo', pr.repoId)
    const diff = deps.store.diffs.get(pr.id, pr.headSha)
    if (!diff) throw new NotFound('diff', `${prId}@${pr.headSha}`)
    if (!pr.worktreePath) throw new WorktreeMissing(prId)

    const source = prDiffSource({ kind: 'pr', repo: repoLabel(repo), number: pr.number, headSha: pr.headSha }, diff, pr.worktreePath)
    const chat = await openChat({
      baseUrl: deps.opencodeUrl,
      directory: pr.worktreePath,
      title: `${repoLabel(repo)}#${pr.number}`,
      systemContext: prContext(repo, pr, diff),
      defaultAgent: null,
    })
    forwardChatEvents(chat, prScopeId(prId), deps.events)
    return { source, chat }
  }

  return {
    async resolve(id) {
      const prId = parsePrScope(id)
      if (prId === null) throw new NotFound('scope', id)
      const cached = cache.get(prId)
      if (cached) return cached
      const pending = build(prId)
      cache.set(prId, pending)
      // A failed build (no worktree yet) must not poison the cache.
      pending.catch(() => cache.delete(prId))
      return pending
    },
  }
}

function parsePrScope(id: string): number | null {
  const m = /^pr:(\d+)$/.exec(id)
  return m ? Number(m[1]) : null
}

function forwardChatEvents(chat: ChatHub, scope: string, events: Events): void {
  chat.subscribe((e) => events.emit({ ...e, scope }))
}

function prContext(repo: Repo, pr: PullRequest, diff: PrDiff): string {
  return [
    `You are helping a human review pull request ${repoLabel(repo)}#${pr.number}: ${pr.title}`,
    `The working directory is a checkout of its head (${pr.headSha}). Read files there when it helps.`,
    `Ranges are given as path:start-end on the new side unless marked LEFT. Do not edit files unless explicitly asked.`,
    '',
    'PR description:',
    pr.body || '(none)',
    '',
    'The full diff:',
    '```diff',
    diff.patch,
    '```',
  ].join('\n')
}
