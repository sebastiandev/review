import type { MouseEvent } from 'react'

/** Distance from the top of the selection to the toolbar's top edge. */
const ABOVE = 42
/** Keeps the toolbar clear of the top bar and the viewport edges. */
const TOP_MIN = 52
const EDGE = 8
/** Widest the toolbar gets with the longest basename; used to clamp `left` before it is measured. */
const WIDTH_ESTIMATE = 380

type SelectionToolbarProps = {
  /** Shown in the label as `{basename} · selection`. */
  basename: string
  /** Selection rect in viewport coordinates. */
  rect: DOMRect
  /** Present in PR mode only; without it the Comment action is disabled. */
  onComment?: () => void
  onAsk: () => void
  onCopyRef: () => void
}

/** The selection survives the click because the buttons do not take focus. */
function keepSelection(e: MouseEvent) {
  e.preventDefault()
}

/** Floating toolbar over a text selection: Comment (disabled in diff mode) · Ask the agent · Copy reference. */
export function SelectionToolbar({ basename, rect, onComment, onAsk, onCopyRef }: SelectionToolbarProps) {
  const top = Math.max(TOP_MIN, rect.top - ABOVE)
  const left = Math.max(EDGE, Math.min(rect.left, window.innerWidth - WIDTH_ESTIMATE - EDGE))
  return (
    <div className="sel-toolbar" role="toolbar" aria-label="Selection actions" style={{ top, left }}>
      <span className="sel-toolbar-label">{basename} · selection</span>
      <button
        type="button"
        className="sel-action"
        disabled={!onComment}
        title={onComment ? undefined : 'PR mode'}
        onMouseDown={keepSelection}
        onClick={onComment}
      >
        Comment
      </button>
      <button type="button" className="sel-action" onMouseDown={keepSelection} onClick={onAsk}>
        Ask the agent
      </button>
      <button type="button" className="sel-action" onMouseDown={keepSelection} onClick={onCopyRef}>
        Copy reference
      </button>
    </div>
  )
}
