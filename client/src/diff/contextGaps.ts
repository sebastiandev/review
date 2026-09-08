import type { DiffHunk, DiffLine } from './parsePatch'

/**
 * Unchanged lines the patch left out: between two hunks, above the first, or below the last
 * (`newEnd === null` — the file length is unknown until its content is loaded).
 * `delta` maps a new-side line number to the old side (`old = new + delta`); it is constant inside a gap.
 */
export type ContextGap = { id: string; newStart: number; newEnd: number | null; delta: number }

type Range = { oldStart: number; oldCount: number; newStart: number; newCount: number }

/** `@@ -a,b +c,d @@` → numbers; a count left out means 1. Null when the header is not a hunk header. */
export function parseHunkHeader(header: string): Range | null {
  const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(header)
  if (!m) return null
  return { oldStart: Number(m[1]), oldCount: m[2] === undefined ? 1 : Number(m[2]), newStart: Number(m[3]), newCount: m[4] === undefined ? 1 : Number(m[4]) }
}

/** The gaps around and between `hunks`, in document order; empty gaps (adjacent hunks) are left out. */
export function contextGaps(hunks: DiffHunk[]): ContextGap[] {
  const ranges = hunks.map((h) => parseHunkHeader(h.header))
  if (ranges.some((r) => r === null) || ranges.length === 0) return []
  const rs = ranges as Range[]
  const gaps: ContextGap[] = []
  const first = rs[0]!
  if (first.newStart > 1) gaps.push({ id: 'before', newStart: 1, newEnd: first.newStart - 1, delta: first.oldStart - first.newStart })
  for (let i = 1; i < rs.length; i++) {
    const prev = rs[i - 1]!
    const next = rs[i]!
    const newStart = prev.newStart + prev.newCount
    const newEnd = next.newStart - 1
    if (newEnd >= newStart) gaps.push({ id: `after:${i - 1}`, newStart, newEnd, delta: next.oldStart - next.newStart })
  }
  const last = rs[rs.length - 1]!
  gaps.push({ id: 'after', newStart: last.newStart + last.newCount, newEnd: null, delta: last.oldStart + last.oldCount - (last.newStart + last.newCount) })
  return gaps
}

/** The gap's lines from the file's full new-side content, as context `DiffLine`s. Empty when the gap is past the end. */
export function gapLines(gap: ContextGap, fileLines: string[]): DiffLine[] {
  const end = Math.min(gap.newEnd ?? fileLines.length, fileLines.length)
  const out: DiffLine[] = []
  for (let n = gap.newStart; n <= end; n++) out.push({ kind: 'normal', oldLine: n + gap.delta, newLine: n, text: fileLines[n - 1] ?? '' })
  return out
}

/** Lines of a file body; a trailing newline does not add an empty last line. */
export function splitFileLines(content: string): string[] {
  const lines = content.split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  return lines
}
