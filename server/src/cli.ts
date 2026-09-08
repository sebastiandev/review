#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { DEFAULT_CACHE_DIR, startDiffMode, startPrMode } from './application/main.ts'
import { formatReview, parsePrTarget, ReviewClient } from './application/cliReview.ts'
import { updateApp } from './application/update.ts'
import { openUi, type OpenMode } from './infrastructure/appWindow.ts'
import { ensureOpencode } from './infrastructure/opencodeServer.ts'

const USAGE = `usage:
  review                                   PR inbox in an app window (tracked repos, worktrees, reviews)
  review diff <patch-file>                 view a patch file
  review diff <repo-dir> [--base <ref>]    view uncommitted changes, or branch vs base
  review pr <url | owner/repo#n> [--cli]   add / open the PR and run the agent review;
                                           --cli prints the result here instead of opening the UI
  review update                            pull the latest version, install, build

options:
  --port <n>          server port (default 5178)
  --opencode <url>    opencode serve url (default http://localhost:4096); started if not running
  --cache-dir <dir>   store, clones and worktrees (default ~/.cache/review)
  --tab               open the UI in a browser tab instead of an app window
  --no-open           do not open the UI at all
  --dev               do not serve the built client (use Vite on :5177)

review pr options:
  --agent <name>      reviewing agent (default: Settings → Review agent)
  --model <p/m>       model as provider/model
  --variant <v>       effort / variant
  --cli               do not open the UI; print feedback, conclusion and comments, then exit`

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    base: { type: 'string' },
    port: { type: 'string', default: '5178' },
    opencode: { type: 'string', default: 'http://localhost:4096' },
    'cache-dir': { type: 'string', default: DEFAULT_CACHE_DIR },
    dev: { type: 'boolean', default: false },
    tab: { type: 'boolean', default: false },
    'no-open': { type: 'boolean', default: false },
    cli: { type: 'boolean', default: false },
    agent: { type: 'string' },
    model: { type: 'string' },
    variant: { type: 'string' },
    help: { type: 'boolean', short: 'h', default: false },
  },
})

const [command, target] = positionals
const port = Number(values.port)
const cacheDir = values['cache-dir']
const serverUrl = `http://localhost:${port}`
const uiUrl = values.dev ? 'http://localhost:5177' : serverUrl
const openMode: OpenMode = values['no-open'] ? 'none' : values.tab ? 'tab' : 'window'
const common = { port, opencodeUrl: values.opencode, cacheDir, serveBuiltClient: !values.dev }

function usage(code: number): never {
  console.log(USAGE)
  process.exit(code)
}

if (values.help) usage(0)

switch (command) {
  case undefined:
    await startPr()
    break
  case 'diff':
    if (!target) usage(1)
    await startDiff(target)
    break
  case 'pr':
    if (!target) usage(1)
    await reviewPr(target)
    break
  case 'update':
    process.exit(await updateApp(console.log))
    break
  default:
    usage(1)
}

async function startPr() {
  // PR mode only talks to opencode on demand: listen right away so the client can connect.
  await Promise.all([startPrMode(common), ensureOpencode(values.opencode, console.error)])
  console.log(`review: ${uiUrl}`)
  openUi(uiUrl, openMode, cacheDir, console.error)
}

async function startDiff(path: string) {
  // Diff mode opens a chat session at startup, so opencode has to be there first.
  await ensureOpencode(values.opencode, console.error)
  await startDiffMode({ ...common, target: path, base: values.base ?? null })
  console.log(`review: ${uiUrl}`)
  openUi(uiUrl, openMode, cacheDir, console.error)
}

async function reviewPr(reference: string) {
  const parsed = parsePrTarget(reference)
  if (!parsed) {
    console.error(`not a pull request reference: ${reference} (use a github.com URL or owner/repo#n)`)
    process.exit(1)
  }
  const client = new ReviewClient(serverUrl, console.error)
  // Reuse a running server; otherwise this process becomes it (and stays up unless --cli).
  const ownServer = !(await client.reachable())
  if (ownServer) {
    console.error(`no review server on :${port}; starting one`)
    await Promise.all([startPrMode(common), ensureOpencode(values.opencode, console.error)])
  }

  const repo = await client.ensureRepo(parsed)
  const pr = await client.ensurePr(repo, parsed)
  await client.ensureWorktree(pr.id)

  if (!values.cli) {
    const url = `${uiUrl}/?pr=${pr.id}`
    console.log(`review: ${url}`)
    openUi(url, openMode, cacheDir, console.error)
  }

  const model = values.model ? parseModel(values.model) : undefined
  console.error(`reviewing #${pr.number} ${pr.title}…`)
  const detail = await client.runReview(pr.id, { agent: values.agent, model, variant: values.variant }, (step) => console.error(`  ${step}`))

  if (values.cli) {
    console.log(formatReview(pr, detail))
    process.exit(0)
  }
  console.error(`done: ${detail.review.verdict} · ${detail.findings.length} comment${detail.findings.length === 1 ? '' : 's'}`)
  if (!ownServer) process.exit(0)
}

function parseModel(text: string): { providerID: string; modelID: string } {
  const slash = text.indexOf('/')
  if (slash <= 0) {
    console.error(`--model must be provider/model, got ${text}`)
    process.exit(1)
  }
  return { providerID: text.slice(0, slash), modelID: text.slice(slash + 1) }
}
