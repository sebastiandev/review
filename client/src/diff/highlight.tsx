import { refractor } from 'refractor/all'
import type { ReactNode } from 'react'
import type { RootContent } from 'hast'

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

/**
 * Highlight one line of code as React nodes. Lines are tokenized independently, so a
 * multi-line string or comment loses its colour on continuation lines — acceptable for a diff.
 */
export function highlightLine(text: string, language: string | null): ReactNode {
  if (!language || text.length === 0) return text
  try {
    return refractor.highlight(text, language).children.map(toNode)
  } catch {
    return text
  }
}

function toNode(node: RootContent, key = 0): ReactNode {
  if (node.type === 'text') return node.value
  if (node.type !== 'element') return null
  const classes = Array.isArray(node.properties?.className) ? node.properties.className : []
  const kinds = classes.filter((c) => c !== 'token').join(' ')
  return (
    <span key={key} className={`tok ${kinds}`}>
      {node.children.map((c, i) => toNode(c, i))}
    </span>
  )
}
