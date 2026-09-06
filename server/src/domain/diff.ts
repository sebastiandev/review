import parseDiff from 'parse-diff'
import type { DiffDocument, DiffFile, DiffSourceRef } from '@revu/shared'

/** Anything that can produce a unified diff. Implemented in infrastructure. */
export type DiffSource = {
  ref: DiffSourceRef
  read(): Promise<string>
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
