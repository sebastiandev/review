import { useState } from 'react'
import type { Verdict } from '@review/shared'
import { Modal } from '../shell/Modal'
import { VERDICT_TEXT } from './agentReview'

type SubmitModalProps = {
  prNumber: number
  pendingCount: number
  /** Hint under each verdict, from `submitHints`. */
  hints: Record<Verdict, string>
  busy: boolean
  /** Server-side rejection to show under the verdicts. */
  error: string | null
  onSubmit: (verdict: Verdict, body: string) => void
  onClose: () => void
}

const VERDICTS: Verdict[] = ['COMMENT', 'APPROVE', 'REQUEST_CHANGES']

/** Human label for a verdict in status text. */
export function verdictLabel(verdict: Verdict): string {
  return VERDICT_TEXT[verdict].toLowerCase()
}

/** "Submit review": three verdict buttons, overall feedback, the merge note, Submit / Cancel. */
export function SubmitModal({ prNumber, pendingCount, hints, busy, error, onSubmit, onClose }: SubmitModalProps) {
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [body, setBody] = useState('')

  return (
    <Modal label="Submit review" maxWidth={560} onClose={onClose}>
      <div className="sheet-head">
        <h4>Submit review</h4>
        <span className="sheet-hint">
          #{prNumber} · {pendingCount} pending
        </span>
      </div>
      <div className="verdicts" role="radiogroup" aria-label="Verdict">
        {VERDICTS.map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={verdict === v}
            className={`verdict${verdict === v ? ' verdict-on' : ''}`}
            onClick={() => setVerdict(v)}
          >
            <span className="verdict-label">{VERDICT_TEXT[v]}</span>
            {hints[v] && <span className="verdict-hint">{hints[v]}</span>}
          </button>
        ))}
      </div>
      <textarea className="input submit-body" placeholder="Overall feedback" value={body} onChange={(e) => setBody(e.target.value)} />
      <p className="modal-note submit-note">Markdown selections on the same line are merged into one comment before pushing.</p>
      {error && <p className="modal-error">{error}</p>}
      <div className="modal-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!verdict || busy}
          onClick={() => verdict && onSubmit(verdict, body.trim())}
        >
          {busy ? 'Submitting…' : 'Submit'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  )
}
