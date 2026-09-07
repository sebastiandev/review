import type { DiffSelection } from '@revu/shared'

type AskPillProps = {
  selections: DiffSelection[]
  /** Offset inside the diff body's scroll content, just below the selection end. */
  left: number
  top: number
  onAsk: (selections: DiffSelection[]) => void
}

/** The floating outlined "Ask" button shown near the end of a diff text selection. */
export function AskPill({ selections, left, top, onAsk }: AskPillProps) {
  return (
    <button
      type="button"
      className="btn btn-primary ask-pill"
      style={{ left, top }}
      // Keep the text selection alive while clicking the pill.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onAsk(selections)}
    >
      Ask
    </button>
  )
}
