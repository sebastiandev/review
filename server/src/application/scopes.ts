import type { ChatHub } from '../domain/chat.ts'
import type { DiffSource } from '../domain/diff.ts'
import { NotFound, WorktreeMissing } from '../domain/errors.ts'
import type { Events } from '../domain/ports.ts'
import { repoLabel, type PrDiff, type PullRequest, type Repo } from '../domain/pullRequests.ts'
import type { Store } from '../domain/store.ts'
import { stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { localRepoSource, patchFileSource, prDiffSource } from '../infrastructure/diffSources.ts'
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

export type LocalScopeRequest = { target: string; base: string | null }

export type LocalScopes = ScopeRegistry & {
  /** Replace the `local` scope with a diff of `target` (a repo dir or a patch file) and a chat rooted there. */
  open(req: LocalScopeRequest): Promise<DiffSource>
  /** The current local scope's source, or null when none was opened. */
  current(): DiffSource | null
}

/**
 * The `local` scope of a PR-mode server: absent until the user opens a folder or patch from the UI,
 * then one at a time. Chat events reach the bus stamped `local`.
 */
export function localScopes(deps: { opencodeUrl: string; events: Events; openChat?: (opts: OpencodeChatOptions) => Promise<ChatHub> }): LocalScopes {
  const openChat = deps.openChat ?? openOpencodeChat
  let scope: Scope | null = null
  let unsubscribe: (() => void) | null = null
  return {
    async resolve(id) {
      if (id !== LOCAL_SCOPE) throw new NotFound('scope', id)
      if (!scope) throw new NotFound('scope', `${LOCAL_SCOPE} (open a folder or .diff first)`)
      return scope
    },
    current: () => scope?.source ?? null,
    async open(req) {
      const target = resolve(req.target)
      const isDir = (await stat(target).catch(() => null))?.isDirectory()
      if (isDir === undefined) throw new NotFound('path', target)
      const source = isDir ? localRepoSource(target, req.base) : patchFileSource(target)
      const chat = await openChat({
        baseUrl: deps.opencodeUrl,
        directory: isDir ? target : process.cwd(),
        title: `review: ${target}`,
        systemContext: localContext(source),
        defaultAgent: null,
      })
      unsubscribe?.()
      unsubscribe = chat.subscribe((e) => deps.events.emit({ ...e, scope: LOCAL_SCOPE }))
      scope = { source, chat }
      return source
    },
  }
}

/** A registry that answers `local` from `local` and everything else from `rest`. */
export function combinedScopes(local: ScopeRegistry, rest: ScopeRegistry): ScopeRegistry {
  return { resolve: (id) => (id === LOCAL_SCOPE ? local.resolve(id) : rest.resolve(id)) }
}

/** Dock preamble for a working tree or patch: Q&A about the diff, no review unless asked. */
export function localContext(source: DiffSource): string {
  const ref = source.ref
  const where =
    ref.kind === 'repo'
      ? `the working tree at ${ref.path}${ref.base ? ` compared against ${ref.base}` : ' (uncommitted changes)'}`
      : ref.kind === 'patch'
        ? `the patch file ${ref.path}`
        : `pull request ${ref.repo}#${ref.number}`
  return [
    `You are a chat assistant sitting next to a human who is reading a diff from ${where}. They will select ranges of it and ask questions.`,
    'Answer briefly and conversationally. Do NOT perform a code review or produce findings unless they explicitly ask for that; a greeting gets a one-line greeting back.',
    'Ranges are given as path:start-end on the new side unless marked LEFT. Read the files in the working directory when it helps.',
    'Do not edit files unless explicitly asked.',
  ].join('\n')
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
  const files = diff.files.map((f) => `- ${f.path}`)
  return [
    `You are a chat assistant sitting next to a human who is reviewing pull request ${repoLabel(repo)}#${pr.number}: ${pr.title}`,
    `(${pr.url}, branch ${pr.headRef} into ${pr.baseRef}).`,
    'Your job is to answer their questions about this PR and the surrounding code, briefly and',
    'conversationally. Do NOT perform a code review, do NOT produce findings or a verdict, and do',
    'NOT write any review payload or file unless they explicitly ask for exactly that. A greeting',
    'gets a one-line greeting back. When asked something, look at the code before answering.',
    `The working directory is a checkout of the PR head (${pr.headSha}); read files there. The diff`,
    `against ${pr.baseSha} is \`git diff ${pr.baseSha}\` — run it for a single path when a question needs the change itself.`,
    'Ranges are given as path:start-end on the new side unless marked LEFT. Do not edit files unless explicitly asked.',
    '',
    'PR description:',
    pr.body || '(none)',
    '',
    `Files changed (${files.length}):`,
    ...files,
  ].join('\n')
}
