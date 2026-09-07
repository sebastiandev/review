import { serve } from '@hono/node-server'
import { stat } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Settings } from '@review/shared'
import { createApp } from './app.ts'
import { localRepoSource, patchFileSource } from '../infrastructure/diffSources.ts'
import { openOpencodeChat } from '../infrastructure/opencodeChat.ts'

export type DiffModeOptions = {
  target: string
  base: string | null
  port: number
  opencodeUrl: string
  serveBuiltClient: boolean
}

const DEFAULT_SETTINGS: Settings = {
  defaultReviewAgent: 'pr-reviewer',
  defaultModel: null,
  theme: 'system',
  chatAgent: null,
}

/** Composition root for diff mode: pick the source, open a chat, serve. */
export async function startDiffMode(opts: DiffModeOptions) {
  const target = resolve(opts.target)
  const isDir = (await stat(target)).isDirectory()
  const source = isDir ? localRepoSource(target, opts.base) : patchFileSource(target)

  const directory = isDir ? target : process.cwd()
  const chat = await openOpencodeChat({
    baseUrl: opts.opencodeUrl,
    directory,
    title: `review: ${target}`,
    systemContext: await diffContext(source),
    defaultAgent: DEFAULT_SETTINGS.chatAgent,
  })

  const here = dirname(fileURLToPath(import.meta.url))
  const app = createApp({
    source,
    chat,
    settings: DEFAULT_SETTINGS,
    opencodeUrl: opts.opencodeUrl,
    directory,
    staticDir: opts.serveBuiltClient ? resolve(here, '../../../client/dist') : null,
  })

  return serve({ fetch: app.fetch, port: opts.port })
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
