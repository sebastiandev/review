import { useCallback, useEffect, useMemo, useState } from 'react'
import { contextGaps, gapLines, splitFileLines, type ContextGap } from './contextGaps'
import type { DiffHunk, DiffLine } from './parsePatch'

export type ExpandedContext = {
  gaps: ContextGap[]
  /** Lines of an expanded gap, by gap id; absent while collapsed or loading. */
  lines: Record<string, DiffLine[]>
  /** True once the file content is known and this gap has no lines (trailing gap at EOF). */
  isEmpty: (gap: ContextGap) => boolean
  loading: string | null
  error: string | null
  expand: (gap: ContextGap) => void
  collapse: (gap: ContextGap) => void
}

/**
 * Context lines around the hunks of one file, expanded on demand. The file's new-side content is
 * fetched once (through `loadFile`) on the first expand and sliced for every gap after that.
 * Resets when `path` changes.
 */
export function useExpandedContext(path: string, hunks: DiffHunk[], loadFile: (path: string) => Promise<string | null>): ExpandedContext {
  const gaps = useMemo(() => contextGaps(hunks), [hunks])
  const [state, setState] = useState<{ path: string; fileLines: string[] | null; open: Set<string>; loading: string | null; error: string | null }>({
    path,
    fileLines: null,
    open: new Set(),
    loading: null,
    error: null,
  })
  useEffect(() => {
    setState({ path, fileLines: null, open: new Set(), loading: null, error: null })
  }, [path])

  const expand = useCallback(
    (gap: ContextGap) => {
      if (state.fileLines) {
        setState((s) => ({ ...s, open: new Set([...s.open, gap.id]) }))
        return
      }
      setState((s) => ({ ...s, loading: gap.id, error: null }))
      void loadFile(path).then(
        (content) =>
          setState((s) =>
            s.path !== path
              ? s
              : content === null
                ? { ...s, loading: null, error: 'file content is not available for this diff' }
                : { ...s, loading: null, fileLines: splitFileLines(content), open: new Set([...s.open, gap.id]) },
          ),
        (e: unknown) => setState((s) => ({ ...s, loading: null, error: e instanceof Error ? e.message : String(e) })),
      )
    },
    [state.fileLines, loadFile, path],
  )
  const collapse = useCallback((gap: ContextGap) => {
    setState((s) => {
      const open = new Set(s.open)
      open.delete(gap.id)
      return { ...s, open }
    })
  }, [])

  const lines = useMemo(() => {
    const out: Record<string, DiffLine[]> = {}
    if (!state.fileLines) return out
    for (const gap of gaps) if (state.open.has(gap.id)) out[gap.id] = gapLines(gap, state.fileLines)
    return out
  }, [gaps, state.open, state.fileLines])

  const isEmpty = useCallback(
    (gap: ContextGap) => state.fileLines !== null && gapLines(gap, state.fileLines).length === 0,
    [state.fileLines],
  )

  return { gaps, lines, isEmpty, loading: state.loading, error: state.error, expand, collapse }
}
