import parseDiff from 'parse-diff'
import type { DiffDocument, DiffFile, DiffSourceRef } from '@review/shared'

/** Anything that can produce a unified diff. Implemented in infrastructure. */
export type DiffSource = {
  ref: DiffSourceRef
  read(): Promise<string>
  /** Full new-side content of a file in the diff, or null when the source cannot provide it. */
  fileContent(path: string): Promise<string | null>
}

/**
 * Turn a raw unified diff into the document the viewer consumes.
 * Pure: same patch, same result. Anchors are the new-side lines a comment may attach to
 * (added + context); deleted-only lines are not anchorable on the RIGHT side.
 */
export function buildDiffDocument(ref: DiffSourceRef, patch: string): DiffDocument {
  const files = parseDiff(patch)
  const anchors: Record<string, number[]> = {}
  const summaries: DiffFile[] = []

  for (const file of files) {
    const path = file.to && file.to !== '/dev/null' ? file.to : (file.from ?? '')
    const lines: number[] = []
    for (const chunk of file.chunks) {
      for (const change of chunk.changes) {
        if (change.type === 'add') lines.push(change.ln)
        else if (change.type === 'normal') lines.push(change.ln2)
      }
    }
    anchors[path] = lines
    summaries.push({
      path,
      status: fileStatus(file),
      additions: file.additions,
      deletions: file.deletions,
    })
  }

  return { source: ref, patch, files: summaries, anchors }
}

function fileStatus(file: parseDiff.File): DiffFile['status'] {
  if (file.new || file.from === '/dev/null') return 'added'
  if (file.deleted || file.to === '/dev/null') return 'deleted'
  if (file.from && file.to && file.from !== file.to) return 'renamed'
  return 'modified'
}

/**
 * The change of each file as a comparable string: its chunks' content lines (no line numbers,
 * no index headers), so the same edit rebased onto a new base still compares equal.
 */
export function fileChangeSignatures(patch: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const file of parseDiff(patch)) {
    const path = file.to && file.to !== '/dev/null' ? file.to : (file.from ?? '')
    const body = file.chunks.map((chunk) => chunk.changes.map((c) => `${c.type[0]}${c.content}`).join('\n')).join('\n@@\n')
    out.set(path, body)
  }
  return out
}

/** Paths whose change is identical in both patches: viewed marks can be carried across the heads. */
export function unchangedFiles(previousPatch: string, nextPatch: string): string[] {
  const previous = fileChangeSignatures(previousPatch)
  const next = fileChangeSignatures(nextPatch)
  return [...next].filter(([path, body]) => previous.get(path) === body).map(([path]) => path)
}
