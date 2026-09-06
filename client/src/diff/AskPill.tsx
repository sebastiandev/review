import type { DiffSelection } from '@revu/shared'

type AskPillProps = {
  selections: DiffSelection[]
  /** Offset inside the diff pane's scroll content, just below the selection end. */
  left: number
  top: number
  onAsk: (selections: DiffSelection[]) => void
}

/** The single floating "Ask" pill shown near the end of a diff selection. */
export function AskPill({ selections, left, top, onAsk }: AskPillProps) {
  return (
    <button
      type="button"
      className="ask-pill"
      style={{ left, top }}
      // Keep the text selection alive while clicking the pill.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onAsk(selections)}
    >
      Ask
    </button>
  )
}
