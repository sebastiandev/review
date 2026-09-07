/** A run of prose or one backticked identifier inside an agent turn. */
export type InlineSegment = { kind: 'text'; text: string } | { kind: 'code'; text: string }

const BACKTICKED = /`([^`\n]+)`/g

/** Splits `text` into prose and single-backtick code spans; unmatched backticks stay as prose. */
export function splitInlineCode(text: string): InlineSegment[] {
  const segments: InlineSegment[] = []
  let cursor = 0
  for (const match of text.matchAll(BACKTICKED)) {
    if (match.index > cursor) segments.push({ kind: 'text', text: text.slice(cursor, match.index) })
    segments.push({ kind: 'code', text: match[1] ?? '' })
    cursor = match.index + match[0].length
  }
  if (cursor < text.length) segments.push({ kind: 'text', text: text.slice(cursor) })
  return segments
}
