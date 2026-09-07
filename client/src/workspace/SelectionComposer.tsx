import type { DiffSelection } from '@review/shared'
import { CommentComposer } from '../pr/CommentComposer'

type SelectionComposerProps = {
  selection: DiffSelection
  onSubmit: (body: string) => void
  onCancel: () => void
  onAsk: () => void
}

function rangeLabel(selection: DiffSelection): string {
  const range = selection.startLine === selection.endLine ? `${selection.startLine}` : `${selection.startLine}-${selection.endLine}`
  return `${selection.path}:${range}`
}

/** Pane-level card for a comment on a markdown selection: the quoted text over the comment composer. */
export function SelectionComposer({ selection, onSubmit, onCancel, onAsk }: SelectionComposerProps) {
  return (
    <section className="ichat sel-composer" aria-label="Comment on selection">
      <div className="ichat-head">
        <span className="ichat-dot" aria-hidden />
        <span className="ichat-title">Proposed change</span>
        <span className="ichat-ref">{rangeLabel(selection)}</span>
        <button type="button" className="ichat-btn" title="Close" aria-label="Close" onClick={onCancel}>
          ×
        </button>
      </div>
      <blockquote className="sel-quote">{selection.text}</blockquote>
      <CommentComposer
        reference={rangeLabel(selection)}
        placeholder="Comment on this selection"
        submitLabel="Add to review"
        onSubmit={onSubmit}
        onCancel={onCancel}
        onAsk={onAsk}
      />
    </section>
  )
}
