import { serve } from '@hono/node-server'
import { mkdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from './app.ts'
import { prMode } from './prMode.ts'
import { fixedScope, LOCAL_SCOPE } from './scopes.ts'
import { localRepoSource, patchFileSource } from '../infrastructure/diffSources.ts'
import { eventBus } from '../infrastructure/events.ts'
import { fileExists, fsPayloads } from '../infrastructure/fsPayloads.ts'
import { ghProvider } from '../infrastructure/github/ghProvider.ts'
import { gitWorktrees } from '../infrastructure/gitWorktrees.ts'
import { openOpencodeChat } from '../infrastructure/opencodeChat.ts'
import { opencodeRunner } from '../infrastructure/opencodeRunner.ts'
import { execFileRunner } from '../infrastructure/process.ts'
import { openDatabase } from '../infrastructure/sqlite/database.ts'
import { sqliteStore } from '../infrastructure/sqlite/store.ts'

/** `~/.cache/review`: the SQLite store, repo clones, PR worktrees and agent payloads. */
export const DEFAULT_CACHE_DIR = join(homedir(), '.cache', 'review')

export type DiffModeOptions = {
  target: string
  base: string | null
  port: number
  opencodeUrl: string
  cacheDir: string
  serveBuiltClient: boolean
}

export type PrModeOptions = {
  port: number
  opencodeUrl: string
  cacheDir: string
  serveBuiltClient: boolean
}

/** Composition root for diff mode: pick the source, open a chat, serve one `local` scope. */
export async function startDiffMode(opts: DiffModeOptions) {
  const target = resolve(opts.target)
  const isDir = (await stat(target)).isDirectory()
  const source = isDir ? localRepoSource(target, opts.base) : patchFileSource(target)
  const store = sqliteStore(await openCacheDatabase(opts.cacheDir))
  const events = eventBus()

  const directory = isDir ? target : process.cwd()
  const chat = await openOpencodeChat({
    baseUrl: opts.opencodeUrl,
    directory,
    title: `review: ${target}`,
    systemContext: await diffContext(source),
    defaultAgent: null,
  })

  const app = createApp({
    scopes: fixedScope(LOCAL_SCOPE, source, chat, events),
    store,
    events,
    settingsChanged: () => {},
    opencodeUrl: opts.opencodeUrl,
    directory,
    routes: [],
    staticDir: opts.serveBuiltClient ? clientDist() : null,
  })

  return serve({ fetch: app.fetch, port: opts.port })
}

/** Composition root for PR mode: store, providers, worktrees, scheduler, serve. */
export async function startPrMode(opts: PrModeOptions) {
  const store = sqliteStore(await openCacheDatabase(opts.cacheDir))
  const github = ghProvider(execFileRunner)
  const { app, scheduler } = prMode({
    store,
    // No GitLab adapter yet; `gh` under the gitlab key keeps the Record total until one exists.
    providers: { github, gitlab: github },
    worktrees: gitWorktrees({ cacheDir: opts.cacheDir, run: execFileRunner }),
    runner: opencodeRunner({ baseUrl: opts.opencodeUrl }),
    payloads: fsPayloads(join(opts.cacheDir, 'payloads')),
    fileExists,
    events: eventBus(),
    clock: () => new Date().toISOString(),
    opencodeUrl: opts.opencodeUrl,
    directory: process.cwd(),
    staticDir: opts.serveBuiltClient ? clientDist() : null,
  })
  scheduler.start()
  return serve({ fetch: app.fetch, port: opts.port })
}

async function openCacheDatabase(cacheDir: string) {
  await mkdir(cacheDir, { recursive: true })
  return openDatabase(join(cacheDir, 'review.sqlite'))
}

function clientDist(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '../../../client/dist')
}

async function diffContext(source: Awaited<ReturnType<typeof localRepoSource>>): Promise<string> {
  const patch = await source.read()
  const where =
    source.ref.kind === 'repo'
      ? `the working tree at ${source.ref.path}${source.ref.base ? ` compared against ${source.ref.base}` : ' (uncommitted changes)'}`
      : source.ref.kind === 'patch'
        ? `the patch file ${source.ref.path}`
        : `pull request ${source.ref.repo}#${source.ref.number}`
  return [
    `You are helping a human read a diff from ${where}. They will select ranges of it and ask questions.`,
    `Ranges are given as path:start-end on the new side unless marked LEFT. Read surrounding files when it helps.`,
    `Do not edit files unless explicitly asked.`,
    '',
    'The full diff:',
    '```diff',
    patch,
    '```',
  ].join('\n')
}
