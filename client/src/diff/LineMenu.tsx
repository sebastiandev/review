import type { LineRef } from './LineActionButton'

type LineMenuProps = {
  lineRef: LineRef
  onAsk: (ref: LineRef) => void
  onCopyRef: (ref: LineRef) => void
}

/** The `⋯` card: Ask the agent here · Copy line reference, with `{path}:{line}` as footer. */
export function LineMenu({ lineRef, onAsk, onCopyRef }: LineMenuProps) {
  return (
    <div className="menu line-menu" role="menu">
      <button type="button" role="menuitem" className="menu-row" disabled title="PR mode">
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
