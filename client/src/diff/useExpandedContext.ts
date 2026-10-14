import { useCallback, useEffect, useMemo, useState } from 'react'
import { contextGaps, gapSize, hiddenCount, HIDDEN, revealedLines, revealMore, splitFileLines, type ContextGap, type ExpandDirection, type GapReveal } from './contextGaps'
import type { DiffHunk, DiffLine } from './parsePatch'

/** One gap as rendered: revealed lines above and below the part still hidden. */
export type GapView = { top: DiffLine[]; bottom: DiffLine[]; hidden: number | null }

export type ExpandedContext = {
  gaps: ContextGap[]
  view: (gap: ContextGap) => GapView
  /** The file's new-side lines; null while loading or when the source has none (patch files). */
  fileLines: string[] | null
  error: string | null
  expand: (gap: ContextGap, direction: ExpandDirection) => void
}

type FileState = { path: string; status: 'loading' | 'ready' | 'unavailable'; lines: string[] | null }

/**
 * Context lines around the hunks of one file, revealed GitHub-style: 20 lines at a time from
 * either end of a gap, or all of it. The file's new-side content is fetched once per path,
 * up front, so expanding is instant and the highlighter can tokenize the whole file.
 */
export function useExpandedContext(path: string, hunks: DiffHunk[], loadFile: (path: string) => Promise<string | null>): ExpandedContext {
  const gaps = useMemo(() => contextGaps(hunks), [hunks])
  const [file, setFile] = useState<FileState>({ path, status: 'loading', lines: null })
  const [reveals, setReveals] = useState<{ path: string; byGap: Record<string, GapReveal> }>({ path, byGap: {} })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    setFile({ path, status: 'loading', lines: null })
    setReveals({ path, byGap: {} })
    setError(null)
    loadFile(path).then(
      (content) => live && setFile({ path, status: content === null ? 'unavailable' : 'ready', lines: content === null ? null : splitFileLines(content) }),
      () => live && setFile({ path, status: 'unavailable', lines: null }),
    )
    return () => {
      live = false
    }
  }, [path, loadFile])

  const fileLines = file.path === path ? file.lines : null
  const byGap = reveals.path === path ? reveals.byGap : {}

  const expand = useCallback(
    (gap: ContextGap, direction: ExpandDirection) => {
      if (!fileLines) {
        if (file.status === 'unavailable') setError('file content is not available for this diff')
        return
      }
      const size = gapSize(gap, fileLines.length) ?? 0
      setReveals((r) => ({ path, byGap: { ...r.byGap, [gap.id]: revealMore(r.byGap[gap.id] ?? HIDDEN, size, direction) } }))
    },
    [fileLines, file.status, path],
  )

  const view = useCallback(
    (gap: ContextGap): GapView => {
      const reveal = byGap[gap.id] ?? HIDDEN
      const hidden = hiddenCount(reveal, gapSize(gap, fileLines?.length ?? null))
      return fileLines ? { ...revealedLines(gap, reveal, fileLines), hidden } : { top: [], bottom: [], hidden }
    },
    [byGap, fileLines],
  )

  return { gaps, view, fileLines, error, expand }
}
