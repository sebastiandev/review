import type { DiffSelection } from '@revu/shared'

/** A quoted diff range inside a user turn. */
export type Quote = { path: string; startLine: number; endLine: number; text: string }

export type TextSegment = { kind: 'text'; text: string } | { kind: 'quote'; quote: Quote }

/** Fenced block a selection becomes in the composer: ```path:start-end ... ``` */
export function quoteSelection(selection: DiffSelection): string {
  return `\`\`\`${selection.path}:${selection.startLine}-${selection.endLine}\n${selection.text}\n\`\`\`\n`
}

const FENCE = /```([^\s`]+):(\d+)-(\d+)\n([\s\S]*?)\n```\n?/g

/** Splits a user turn into plain text and quoted diff ranges. */
export function splitQuotes(text: string): TextSegment[] {
  const segments: TextSegment[] = []
  let cursor = 0
  for (const match of text.matchAll(FENCE)) {
    const [whole, path, start, end, body] = match
    if (match.index > cursor) segments.push({ kind: 'text', text: text.slice(cursor, match.index) })
    segments.push({
      kind: 'quote',
      quote: { path: path!, startLine: Number(start), endLine: Number(end), text: body ?? '' },
    })
    cursor = match.index + whole.length
  }
  if (cursor < text.length) segments.push({ kind: 'text', text: text.slice(cursor) })
  return segments
}
