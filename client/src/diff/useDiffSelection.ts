import { useCallback, useEffect, useState, type RefObject } from 'react'
import type { DiffSelection } from '@revu/shared'
import { groupSelectedRows, type SelectedRow } from './groupSelectedRows'

export type DiffSelectionState = {
  selections: DiffSelection[]
  /** Bounding rect of the selection end, for positioning the pill. Null when nothing is selected. */
  rect: DOMRect | null
}

const EMPTY: DiffSelectionState = { selections: [], rect: null }

function rowOf(node: Node | null): HTMLElement | null {
  const element = node instanceof Element ? node : node?.parentElement ?? null
  return element?.closest<HTMLElement>('[data-path][data-line]') ?? null
}

function selectedRow(tr: HTMLElement): SelectedRow | null {
  const path = tr.dataset.path
  const line = Number(tr.dataset.line)
  const side = tr.dataset.side
  if (!path || !Number.isFinite(line) || (side !== 'old' && side !== 'new')) return null
  return { path, line, side, text: tr.querySelector('.diff-text')?.textContent ?? '' }
}

function endRect(range: Range): DOMRect {
  const end = range.cloneRange()
  end.collapse(false)
  const rects = end.getClientRects()
  const last = rects[rects.length - 1]
  return last ?? range.getBoundingClientRect()
}

function readSelection(container: HTMLElement): DiffSelectionState {
  const selection = document.getSelection()
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return EMPTY
  const range = selection.getRangeAt(0)
  if (!rowOf(range.startContainer) && !rowOf(range.endContainer)) return EMPTY
  const rows: SelectedRow[] = []
  for (const tr of container.querySelectorAll<HTMLElement>('[data-path][data-line]')) {
    if (!range.intersectsNode(tr)) continue
    const row = selectedRow(tr)
    if (row) rows.push(row)
  }
  if (rows.length === 0) return EMPTY
  return { selections: groupSelectedRows(rows), rect: endRect(range) }
}

/** Tracks the user's text selection inside the diff container as DiffSelection ranges. */
export function useDiffSelection(container: RefObject<HTMLElement | null>): DiffSelectionState & { clear: () => void } {
  const [state, setState] = useState<DiffSelectionState>(EMPTY)

  const clear = useCallback(() => {
    document.getSelection()?.removeAllRanges()
    setState(EMPTY)
  }, [])

  useEffect(() => {
    const element = container.current
    if (!element) return
    const update = () => setState(readSelection(element))
    const onSelectionChange = () => {
      // Only clear here; the full read happens on mouseup so the pill does not chase the drag.
      const selection = document.getSelection()
      if (!selection || selection.isCollapsed) setState(EMPTY)
    }
    element.addEventListener('mouseup', update)
    document.addEventListener('selectionchange', onSelectionChange)
    return () => {
      element.removeEventListener('mouseup', update)
      document.removeEventListener('selectionchange', onSelectionChange)
    }
  }, [container])

  return { ...state, clear }
}
