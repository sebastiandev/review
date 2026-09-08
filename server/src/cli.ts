#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { exec } from 'node:child_process'
import { DEFAULT_CACHE_DIR, startDiffMode, startPrMode } from './application/main.ts'
import { ensureOpencode } from './infrastructure/opencodeServer.ts'

const USAGE = `usage:
  review                                   PR inbox (tracked repos, worktrees, reviews)
  review diff <patch-file>                 view a patch file
  review diff <repo-dir> [--base <ref>]    view uncommitted changes, or branch vs base

options:
  --port <n>          server port (default 5178)
  --opencode <url>    opencode serve url (default http://localhost:4096); started if not running
  --cache-dir <dir>   store, clones and worktrees (default ~/.cache/review)
  --dev               do not serve the built client (use Vite on :5177)
  --no-open           do not open the browser`

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    base: { type: 'string' },
    port: { type: 'string', default: '5178' },
    opencode: { type: 'string', default: 'http://localhost:4096' },
    'cache-dir': { type: 'string', default: DEFAULT_CACHE_DIR },
    dev: { type: 'boolean', default: false },
    'no-open': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
})

const [command, target] = positionals
const prMode = command === undefined
const diffMode = command === 'diff' && target !== undefined
if (values.help || !(prMode || diffMode)) {
  console.log(USAGE)
  process.exit(values.help ? 0 : 1)
}

const port = Number(values.port)
const common = { port, opencodeUrl: values.opencode, cacheDir: values['cache-dir'], serveBuiltClient: !values.dev }
const opencode = ensureOpencode(values.opencode, console.error)
if (diffMode) {
  // Diff mode opens a chat session at startup, so opencode has to be there first.
  await opencode
  await startDiffMode({ ...common, target, base: values.base ?? null })
} else {
  // PR mode only talks to opencode on demand: listen right away so the client can connect.
  await Promise.all([startPrMode(common), opencode])
}

const url = values.dev ? 'http://localhost:5177' : `http://localhost:${port}`
console.log(`review: ${url}`)
if (!values['no-open']) exec(`open ${url}`)
