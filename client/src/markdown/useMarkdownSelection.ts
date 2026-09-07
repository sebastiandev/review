import { useCallback, useEffect, useState, type RefObject } from 'react'
import { rangeOfSelection, type LineRange } from './lineMap'

/** A non-empty text selection inside the rendered document, with the source lines it covers. */
export type MarkdownSelection = LineRange & {
  /** Selected text with whitespace runs collapsed. */
  text: string
  /** Bounding rect of the selection, viewport coordinates, for the toolbar. */
  rect: DOMRect
}

function readSelection(container: HTMLElement): MarkdownSelection | null {
  const selection = document.getSelection()
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  if (!container.contains(range.commonAncestorContainer)) return null
  const lines = rangeOfSelection(range)
  if (!lines) return null
  const text = selection.toString().replace(/\s+/g, ' ').trim()
  if (!text) return null
  return { ...lines, text, rect: range.getBoundingClientRect() }
}

/** Tracks the text selection inside the document column; read on mouseup/keyup so it does not chase the drag. */
export function useMarkdownSelection(container: RefObject<HTMLElement | null>): {
  selection: MarkdownSelection | null
  clear: () => void
} {
  const [selection, setSelection] = useState<MarkdownSelection | null>(null)

  const clear = useCallback(() => {
    document.getSelection()?.removeAllRanges()
    setSelection(null)
  }, [])

  useEffect(() => {
    const element = container.current
    if (!element) return
    const update = () => setSelection(readSelection(element))
    const onSelectionChange = () => {
      const current = document.getSelection()
      if (!current || current.isCollapsed) setSelection(null)
    }
    window.addEventListener('mouseup', update)
    window.addEventListener('keyup', update)
    document.addEventListener('selectionchange', onSelectionChange)
    return () => {
      window.removeEventListener('mouseup', update)
      window.removeEventListener('keyup', update)
      document.removeEventListener('selectionchange', onSelectionChange)
    }
  }, [container])

  return { selection, clear }
}
