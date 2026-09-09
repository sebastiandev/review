import { serve } from '@hono/node-server'
import { mkdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from './app.ts'
import { prMode } from './prMode.ts'
import { fixedScope, LOCAL_SCOPE, localContext } from './scopes.ts'
import { localRepoSource, patchFileSource } from '../infrastructure/diffSources.ts'
import { eventBus } from '../infrastructure/events.ts'
import { fileLog, logEvents, teeConsole } from '../infrastructure/fileLog.ts'
import { fileExists, fsPayloads } from '../infrastructure/fsPayloads.ts'
import { ghProvider } from '../infrastructure/github/ghProvider.ts'
import { ghCliCredentials, githubDeviceFlow, withGithubToken } from '../infrastructure/github/oauthDeviceFlow.ts'
import { fileCredentialStore, keychainCredentialStore } from '../infrastructure/keychain.ts'
import { gitWorktrees } from '../infrastructure/gitWorktrees.ts'
import { openOpencodeChat } from '../infrastructure/opencodeChat.ts'
import { opencodeRunner } from '../infrastructure/opencodeRunner.ts'
import { execFileRunner } from '../infrastructure/process.ts'
import { openDatabase } from '../infrastructure/sqlite/database.ts'
import { writePidFile } from '../infrastructure/serverPid.ts'
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
  await startLogging(opts.cacheDir, events)

  const directory = isDir ? target : process.cwd()
  const chat = await openOpencodeChat({
    baseUrl: opts.opencodeUrl,
    directory,
    title: `review: ${target}`,
    systemContext: localContext(source),
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

  return listen(app.fetch, opts.port, opts.cacheDir)
}

/** Composition root for PR mode: store, providers, worktrees, scheduler, serve. */
export async function startPrMode(opts: PrModeOptions) {
  const store = sqliteStore(await openCacheDatabase(opts.cacheDir))
  const events = eventBus()
  await startLogging(opts.cacheDir, events)
  // The account session is created inside prMode; the runner reads its token lazily.
  let token: () => string | null = () => null
  const run = withGithubToken(execFileRunner, () => token())
  const github = ghProvider(run)
  const { app, scheduler, accounts } = prMode({
    store,
    // No GitLab adapter yet; `gh` under the gitlab key keeps the Record total until one exists.
    providers: { github, gitlab: github },
    worktrees: gitWorktrees({ cacheDir: opts.cacheDir, run }),
    credentials: process.platform === 'darwin' ? keychainCredentialStore(execFileRunner) : fileCredentialStore(join(opts.cacheDir, 'credentials.json')),
    deviceFlow: githubDeviceFlow(process.env.REVIEW_GITHUB_CLIENT_ID ?? null),
    cli: ghCliCredentials(execFileRunner),
    sleep: (seconds) => new Promise((r) => setTimeout(r, seconds * 1000)),
    runner: opencodeRunner({ baseUrl: opts.opencodeUrl }),
    payloads: fsPayloads(join(opts.cacheDir, 'payloads')),
    fileExists,
    events,
    clock: () => new Date().toISOString(),
    opencodeUrl: opts.opencodeUrl,
    directory: process.cwd(),
    staticDir: opts.serveBuiltClient ? clientDist() : null,
  })
  token = accounts.token
  await accounts.load()
  scheduler.start()
  return listen(app.fetch, opts.port, opts.cacheDir)
}

/** Bind the port or exit: a swallowed EADDRINUSE would open the UI against whatever server already answers there. */
async function listen(fetch: Parameters<typeof serve>[0]['fetch'], port: number, cacheDir: string) {
  const server = serve({ fetch, port })
  await new Promise<void>((resolveListening, reject) => {
    server.once('listening', () => resolveListening())
    server.once('error', reject)
  }).catch((e: NodeJS.ErrnoException) => {
    console.error(e.code === 'EADDRINUSE' ? `port ${port} is in use; stop the other server or pass --port` : e.message)
    process.exit(1)
  })
  await writePidFile(cacheDir)
  return server
}

/** `<cacheDir>/logs/review-YYYY-MM-DD.log`: console output and every bus event; seven days kept. */
async function startLogging(cacheDir: string, events: ReturnType<typeof eventBus>) {
  const log = fileLog(join(cacheDir, 'logs'))
  await log.prune()
  teeConsole(log)
  logEvents(events, log)
  console.log(`logging to ${log.dir}`)
}

async function openCacheDatabase(cacheDir: string) {
  await mkdir(cacheDir, { recursive: true })
  return openDatabase(join(cacheDir, 'review.sqlite'))
}

function clientDist(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '../../../client/dist')
}

