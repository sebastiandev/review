import { refractor } from 'refractor'
import tsx from 'refractor/tsx'
import jsx from 'refractor/jsx'
import toml from 'refractor/toml'
import graphql from 'refractor/graphql'

refractor.register(tsx)
refractor.register(jsx)
refractor.register(toml)
refractor.register(graphql)

const BY_EXTENSION: Record<string, string> = {
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'jsx',
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  php: 'php',
  lua: 'lua',
  pl: 'perl',
  r: 'r',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  sql: 'sql',
  css: 'css',
  scss: 'scss',
  sass: 'sass',
  less: 'less',
  html: 'markup',
  htm: 'markup',
  xml: 'markup',
  svg: 'markup',
  json: 'json',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'toml',
  ini: 'ini',
  md: 'markdown',
  graphql: 'graphql',
  gql: 'graphql',
  diff: 'diff',
  patch: 'diff',
}

const BY_BASENAME: Record<string, string> = {
  makefile: 'makefile',
  dockerfile: 'bash',
}

/** refractor language for a file path, or null when no registered grammar fits. */
export function languageForPath(path: string): string | null {
  const basename = path.slice(path.lastIndexOf('/') + 1).toLowerCase()
  const byName = BY_BASENAME[basename]
  if (byName) return byName
  const dot = basename.lastIndexOf('.')
  if (dot < 0) return null
  const language = BY_EXTENSION[basename.slice(dot + 1)]
  return language && refractor.registered(language) ? language : null
}
