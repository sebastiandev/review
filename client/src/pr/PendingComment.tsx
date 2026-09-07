import { useState } from 'react'
import { Check } from '@phosphor-icons/react'
import type { DraftCommentRow } from '@review/shared'
import { CommentComposer } from './CommentComposer'

type PendingCommentProps = {
  comment: DraftCommentRow
  reference: string
  onEdit: (id: number, body: string) => Promise<void>
  onDelete: (id: number) => Promise<void>
  onSelect: (id: number, selected: boolean) => Promise<void>
}

/** Your pending comment on a line: accent-bordered card with inline edit, delete and the "include" checkbox. */
export function PendingComment({ comment, reference, onEdit, onDelete, onSelect }: PendingCommentProps) {
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const invalid = !comment.anchorValid

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    try {
      await action()
    } finally {
      setBusy(false)
    }
  }

  if (editing) {
    return (
      <CommentComposer
        reference={reference}
        placeholder="Edit your comment"
        initial={comment.body}
        submitLabel="Save"
        busy={busy}
        onSubmit={(body) => void run(() => onEdit(comment.id, body)).then(() => setEditing(false))}
        onCancel={() => setEditing(false)}
      />
    )
  }

  return (
    <div className={`mine-card${invalid ? ' mine-card-invalid' : ''}`}>
      <div className="artifact-ref mine-head">
        <button
          type="button"
          role="checkbox"
          aria-checked={comment.selected}
          className={`checkbox${comment.selected && !invalid ? ' checkbox-on' : ''}`}
          disabled={invalid || busy}
          title={invalid ? 'Cannot be submitted: the line is no longer in the diff' : 'Include in the review'}
          onClick={() => void run(() => onSelect(comment.id, !comment.selected))}
        >
          {comment.selected && !invalid && <Check size={10} weight="bold" />}
        </button>
        <span>{invalid ? 'You · no longer anchored to the diff' : 'You · pending in this review'}</span>
        <span className="artifact-push mine-actions">
          <button type="button" className="btn btn-ghost btn-xs" disabled={busy} onClick={() => setEditing(true)}>
            Edit
          </button>
          <button type="button" className="btn btn-ghost btn-xs" disabled={busy} onClick={() => void run(() => onDelete(comment.id))}>
            Delete
          </button>
        </span>
      </div>
      <div className="artifact-body">{comment.body}</div>
    </div>
  )
}
