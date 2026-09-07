import parseDiff from 'parse-diff'

export type LineKind = 'add' | 'del' | 'normal'

/** One diff line with its numbers on each side (`null` where the side has no such line). */
export type DiffLine = {
  kind: LineKind
  oldLine: number | null
  newLine: number | null
  /** Line text without the leading `+`/`-`/space marker. */
  text: string
}

export type DiffHunk = {
  /** The `@@ … @@` header line as written in the patch. */
  header: string
  lines: DiffLine[]
}

export type ParsedFile = {
  path: string
  hunks: DiffHunk[]
}

/** One side-by-side row: a removed/context line on the left, an added/context line on the right. */
export type SplitRow = { left: DiffLine | null; right: DiffLine | null }

function toLine(change: parseDiff.Change): DiffLine | null {
  // parse-diff emits the "\ No newline at end of file" marker as a change that repeats the previous line's numbers.
  if (change.content.startsWith('\\')) return null
  const text = change.content.slice(1)
  switch (change.type) {
    case 'add':
      return { kind: 'add', oldLine: null, newLine: change.ln, text }
    case 'del':
      return { kind: 'del', oldLine: change.ln, newLine: null, text }
    case 'normal':
      return { kind: 'normal', oldLine: change.ln1, newLine: change.ln2, text }
  }
}

/** Path a file is identified by: the new path, or the old one for deletions. Mirrors the server. */
function pathOf(file: parseDiff.File): string {
  return file.to && file.to !== '/dev/null' ? file.to : (file.from ?? '')
}

/** Parses a unified diff into per-file hunks of numbered lines. */
export function parsePatch(patch: string): ParsedFile[] {
  return parseDiff(patch).map((file) => ({
    path: pathOf(file),
    hunks: file.chunks.map((chunk) => ({
      header: chunk.content,
      lines: chunk.changes.map(toLine).filter((line): line is DiffLine => line !== null),
    })),
  }))
}

/** Pairs a hunk's lines into side-by-side rows: each run of removals aligns with the run of additions that follows it. */
export function splitRows(lines: DiffLine[]): SplitRow[] {
  const rows: SplitRow[] = []
  let dels: DiffLine[] = []
  let adds: DiffLine[] = []
  const flush = () => {
    for (let i = 0; i < Math.max(dels.length, adds.length); i++) {
      rows.push({ left: dels[i] ?? null, right: adds[i] ?? null })
    }
    dels = []
    adds = []
  }
  for (const line of lines) {
    if (line.kind === 'del') dels.push(line)
    else if (line.kind === 'add') adds.push(line)
    else {
      flush()
      rows.push({ left: line, right: line })
    }
  }
  flush()
  return rows
}
