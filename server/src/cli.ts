#!/usr/bin/env -S npx tsx
import { parseArgs } from 'node:util'
import { exec } from 'node:child_process'
import { startDiffMode } from './application/main.ts'

const USAGE = `usage:
  review diff <patch-file>                 view a patch file
  review diff <repo-dir> [--base <ref>]    view uncommitted changes, or branch vs base

options:
  --port <n>          server port (default 5178)
  --opencode <url>    opencode serve url (default http://localhost:4096)
  --dev               do not serve the built client (use Vite on :5177)
  --no-open           do not open the browser`

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    base: { type: 'string' },
    port: { type: 'string', default: '5178' },
    opencode: { type: 'string', default: 'http://localhost:4096' },
    dev: { type: 'boolean', default: false },
    'no-open': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
})

const [command, target] = positionals
if (values.help || command !== 'diff' || !target) {
  console.log(USAGE)
  process.exit(command === 'diff' || values.help ? 0 : 1)
}

const port = Number(values.port)
await startDiffMode({
  target,
  base: values.base ?? null,
  port,
  opencodeUrl: values.opencode,
  serveBuiltClient: !values.dev,
})

const url = values.dev ? 'http://localhost:5177' : `http://localhost:${port}`
console.log(`review: ${url}`)
if (!values['no-open']) exec(`open ${url}`)
