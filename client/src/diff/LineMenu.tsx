import type { LineRef } from './LineActionButton'

type LineMenuProps = {
  lineRef: LineRef
  /** Present in PR mode only; without it the row is disabled. */
  onComment?: (ref: LineRef) => void
  onAsk: (ref: LineRef) => void
  onCopyRef: (ref: LineRef) => void
}

/** The `⋯` card: Add review comment (PR mode) · Ask the agent here · Copy line reference, with `{path}:{line}` as footer. */
export function LineMenu({ lineRef, onComment, onAsk, onCopyRef }: LineMenuProps) {
  return (
    <div className="menu line-menu" role="menu">
      <button
        type="button"
        role="menuitem"
        className="menu-row"
        disabled={!onComment}
        title={onComment ? undefined : 'PR mode'}
        onClick={() => onComment?.(lineRef)}
      >
        Add review comment
      </button>
      <button type="button" role="menuitem" className="menu-row" onClick={() => onAsk(lineRef)}>
        Ask the agent here
      </button>
      <button type="button" role="menuitem" className="menu-row" onClick={() => onCopyRef(lineRef)}>
        Copy line reference
      </button>
      <div className="line-menu-ref">
        {lineRef.path}:{lineRef.line}
      </div>
    </div>
  )
}
