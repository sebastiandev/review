import { refractor } from 'refractor/all'
import { Fragment, type ReactNode } from 'react'
import { tokenLines, type Token } from './tokenLines'

const BY_EXTENSION: Record<string, string> = {
  py: 'python',
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  jsonc: 'json',
  css: 'css',
  scss: 'scss',
  html: 'markup',
  xml: 'markup',
  svg: 'markup',
  md: 'markdown',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'toml',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  sql: 'sql',
  go: 'go',
  rs: 'rust',
  rb: 'ruby',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  php: 'php',
  dockerfile: 'docker',
  diff: 'diff',
  patch: 'diff',
}

/** Prism language id for a path, or null when we have no grammar for it. */
export function languageOf(path: string): string | null {
  const base = path.split('/').pop() ?? ''
  if (base.toLowerCase() === 'dockerfile') return 'docker'
  const ext = base.includes('.') ? base.split('.').pop()!.toLowerCase() : ''
  const lang = BY_EXTENSION[ext]
  return lang && refractor.registered(lang) ? lang : null
}

/** Highlight one line on its own (quotes in the dock). Diffs use `tokenLines` over whole blocks instead. */
export function highlightLine(text: string, language: string | null): ReactNode {
  return renderTokens(tokenLines(text, language)[0] ?? [])
}

/** Tokens of one line as nested `.tok` spans, innermost token class last, so CSS specificity follows Prism nesting. */
export function renderTokens(tokens: Token[]): ReactNode {
  return tokens.map((t, i) => <Fragment key={i}>{t.scopes.reduceRight<ReactNode>((inner, scope) => <span className={`tok ${scope}`}>{inner}</span>, t.text)}</Fragment>)
}
