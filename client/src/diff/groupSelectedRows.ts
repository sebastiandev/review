import type { DiffSelection } from '@review/shared'

/** One rendered diff row touched by the DOM selection, in document order. */
export type SelectedRow = {
  path: string
  line: number
  /** Diff side: 'old' for deleted lines (and the left split column), 'new' otherwise. */
  side: 'old' | 'new'
  text: string
}

function sideOf(row: SelectedRow): DiffSelection['side'] {
  return row.side === 'old' ? 'LEFT' : 'RIGHT'
}

function continues(previous: SelectedRow, row: SelectedRow): boolean {
  return previous.path === row.path && previous.side === row.side && row.line === previous.line + 1
}

/** Folds ordered rows into one DiffSelection per contiguous run of lines on the same file and side. */
export function groupSelectedRows(rows: SelectedRow[]): DiffSelection[] {
  const groups: DiffSelection[] = []
  let previous: SelectedRow | undefined
  for (const row of rows) {
    const current = groups[groups.length - 1]
    if (current && previous && continues(previous, row)) {
      current.endLine = row.line
      current.text += `\n${row.text}`
    } else {
      groups.push({ path: row.path, startLine: row.line, endLine: row.line, side: sideOf(row), text: row.text })
    }
    previous = row
  }
  return groups
}
