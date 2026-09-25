import type { DiffSelection } from '@review/shared'
import { basename } from '../files/scope'
import type { ParsedFile } from '../diff/parsePatch'

export type QuoteLine = { line: number; kind: 'add' | 'del' | 'normal'; text: string }

/** Preserve diff signs and colours in the dock's selected-code quote. */
export function selectedDiffLines(anchor: DiffSelection, file?: ParsedFile): QuoteLine[] {
  const lines = file?.hunks.flatMap((h) => h.lines).flatMap((row) => {
    const line = anchor.side === 'LEFT' ? row.oldLine : row.newLine
    return line != null && line >= anchor.startLine && line <= anchor.endLine ? [{ line, kind: row.kind, text: row.text }] : []
  }) ?? []
  return lines.length ? lines : anchor.text.split('\n').map((text, i) => ({ line: anchor.startLine + i, kind: 'normal', text }))
}

/** Reuse an existing chat only when it contains the selection on the same side of the same file. */
export function containsSelection(existing: DiffSelection, requested: DiffSelection): boolean {
  return existing.path === requested.path && existing.side === requested.side && existing.startLine <= requested.startLine && existing.endLine >= requested.endLine
}

/** Compact context label shared by chips, quote, and composer. */
export function selectionLabel(anchor: DiffSelection): string {
  return `${basename(anchor.path)}:${anchor.startLine}${anchor.endLine === anchor.startLine ? '' : `–${anchor.endLine}`}`
}
