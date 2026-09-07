import { DotsThree } from '@phosphor-icons/react'

export type LineRef = { path: string; line: number }

type LineActionButtonProps = {
  lineRef: LineRef
  menuOpen: boolean
  onToggleMenu: () => void
  onCopyRef: (ref: LineRef) => void
}

/** 18px `⋯` button on a diff line; its menu offers "Copy line reference" (the rest arrives in phase 1). */
export function LineActionButton({ lineRef, menuOpen, onToggleMenu, onCopyRef }: LineActionButtonProps) {
  return (
    <>
      <button
        type="button"
        className="line-action"
        aria-label="Line actions"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={onToggleMenu}
      >
        <DotsThree size={11} weight="bold" />
      </button>
      {menuOpen && (
        <div className="menu line-menu" role="menu">
          <button type="button" role="menuitem" className="menu-row" onClick={() => onCopyRef(lineRef)}>
            Copy line reference
          </button>
          <div className="line-menu-ref">
            {lineRef.path}:{lineRef.line}
          </div>
        </div>
      )}
    </>
  )
}
