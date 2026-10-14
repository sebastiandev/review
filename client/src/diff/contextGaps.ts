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

/** Lines one click on an expand control reveals, like GitHub. */
export const EXPAND_STEP = 20

/** Which way an expand control grows a gap: `down` from the hunk above, `up` from the hunk below, or all of it. */
export type ExpandDirection = 'up' | 'down' | 'all'

/** How much of a gap is showing: `top` lines under the hunk above, `bottom` lines over the hunk below. */
export type GapReveal = { top: number; bottom: number }

export const HIDDEN: GapReveal = { top: 0, bottom: 0 }

/** Lines in the gap; null for the trailing gap until the file length is known. */
export function gapSize(gap: ContextGap, fileLength: number | null): number | null {
  if (gap.newEnd !== null) return gap.newEnd - gap.newStart + 1
  return fileLength === null ? null : Math.max(0, fileLength - gap.newStart + 1)
}

/** Lines still hidden; null while the size is unknown. */
export function hiddenCount(reveal: GapReveal, size: number | null): number | null {
  return size === null ? null : Math.max(0, size - reveal.top - reveal.bottom)
}

/** `reveal` after one click: up to `EXPAND_STEP` more lines on one end, or everything. */
export function revealMore(reveal: GapReveal, size: number, direction: ExpandDirection): GapReveal {
  const hidden = hiddenCount(reveal, size) ?? 0
  if (direction === 'all') return { ...reveal, top: reveal.top + hidden }
  const step = Math.min(EXPAND_STEP, hidden)
  return direction === 'down' ? { ...reveal, top: reveal.top + step } : { ...reveal, bottom: reveal.bottom + step }
}

/** The revealed lines of a gap, split at the part still hidden. */
export function revealedLines(gap: ContextGap, reveal: GapReveal, fileLines: string[]): { top: DiffLine[]; bottom: DiffLine[] } {
  const size = gapSize(gap, fileLines.length) ?? 0
  const end = gap.newStart + size - 1
  const top = reveal.top > 0 ? gapLines({ ...gap, newEnd: gap.newStart + Math.min(reveal.top, size) - 1 }, fileLines) : []
  const bottom = reveal.bottom > 0 ? gapLines({ ...gap, newStart: Math.max(gap.newStart + reveal.top, end - reveal.bottom + 1), newEnd: end }, fileLines) : []
  return { top, bottom }
}

/** Lines of a file body; a trailing newline does not add an empty last line. */
export function splitFileLines(content: string): string[] {
  const lines = content.split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  return lines
}
