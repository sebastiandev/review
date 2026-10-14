import { refractor } from 'refractor/all'
import type { RootContent } from 'hast'
import type { DiffHunk, DiffLine } from './parsePatch'

/** A run of text on one line, with the token classes of every enclosing Prism token, outermost first. */
export type Token = { text: string; scopes: string[] }

// GitHub colours attribute access (`self.qspec`, `attributes.copy()`); Prism's Python grammar leaves it plain.
if (refractor.registered('python') && !('property' in refractor.languages.python!)) {
  refractor.languages.insertBefore('python', 'punctuation', { property: { pattern: /(\.)[A-Za-z_]\w*/, lookbehind: true } })
}

/**
 * Tokenize `code` as one unit and split the result into lines, so a token spanning lines (a
 * docstring, a block comment) keeps its colour on every line. Plain text when `language` is null
 * or the grammar throws.
 */
export function tokenLines(code: string, language: string | null): Token[][] {
  const lines: Token[][] = [[]]
  const push = (text: string, scopes: string[]) => {
    text.split('\n').forEach((part, i) => {
      if (i > 0) lines.push([])
      if (part) lines[lines.length - 1]!.push({ text: part, scopes })
    })
  }
  const walk = (nodes: RootContent[], scopes: string[]) => {
    for (const node of nodes) {
      if (node.type === 'text') push(node.value, scopes)
      else if (node.type === 'element') {
        const classes = Array.isArray(node.properties?.className) ? node.properties.className : []
        walk(node.children, [...scopes, classes.filter((c) => c !== 'token').join(' ')])
      }
    }
  }
  if (!language) {
    push(code, [])
    return lines
  }
  try {
    walk(refractor.highlight(code, language).children, [])
  } catch {
    lines.length = 0
    lines.push([])
    push(code, [])
  }
  return lines
}

/**
 * Tokens for any line of one file's diff. New-side lines come from the whole file when it is
 * loaded and matches the patch; otherwise, and for removed lines, from their hunk's side tokenized
 * as one block (the old file is never fetched, so a hunk starting mid-string can still miscolour).
 */
export function diffLineTokens(hunks: DiffHunk[], fileLines: string[] | null, language: string | null): (line: DiffLine) => Token[] {
  const file = fileLines && language ? tokenLines(fileLines.join('\n'), language) : null
  const oldSide = new Map<number, Token[]>()
  const newSide = new Map<number, Token[]>()
  for (const hunk of hunks) {
    const olds = hunk.lines.filter((l) => l.kind !== 'add')
    const news = hunk.lines.filter((l) => l.kind !== 'del')
    tokenLines(olds.map((l) => l.text).join('\n'), language).forEach((tokens, i) => olds[i]?.oldLine != null && oldSide.set(olds[i]!.oldLine!, tokens))
    tokenLines(news.map((l) => l.text).join('\n'), language).forEach((tokens, i) => news[i]?.newLine != null && newSide.set(news[i]!.newLine!, tokens))
  }
  return (line) => {
    if (line.kind !== 'del' && line.newLine != null) {
      if (file && fileLines![line.newLine - 1] === line.text) return file[line.newLine - 1] ?? []
      const block = newSide.get(line.newLine)
      if (block) return block
    }
    if (line.kind === 'del' && line.oldLine != null) {
      const block = oldSide.get(line.oldLine)
      if (block) return block
    }
    return tokenLines(line.text, language)[0] ?? []
  }
}
