import { useState } from 'react'
import type { Verdict } from '@review/shared'
import { Modal } from '../shell/Modal'

type SubmitModalProps = {
  prNumber: number
  pendingCount: number
  busy: boolean
  /** Server-side rejection to show under the verdicts. */
  error: string | null
  onSubmit: (verdict: Verdict, body: string) => void
  onClose: () => void
}

/** Phase-4 fills the Approve / Request changes hints from the agent run. */
const VERDICTS: { verdict: Verdict; label: string; hint: string }[] = [
  { verdict: 'COMMENT', label: 'Comment', hint: 'Submit notes without a verdict' },
  { verdict: 'APPROVE', label: 'Approve', hint: 'Agent not run' },
  { verdict: 'REQUEST_CHANGES', label: 'Request changes', hint: '' },
]

/** Human label for a verdict in status text. */
export function verdictLabel(verdict: Verdict): string {
  return VERDICTS.find((v) => v.verdict === verdict)?.label.toLowerCase() ?? verdict
}

/** "Submit review": three verdict buttons, overall feedback, the merge note, Submit / Cancel. */
export function SubmitModal({ prNumber, pendingCount, busy, error, onSubmit, onClose }: SubmitModalProps) {
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
            key={v.verdict}
            type="button"
            role="radio"
            aria-checked={verdict === v.verdict}
            className={`verdict${verdict === v.verdict ? ' verdict-on' : ''}`}
            onClick={() => setVerdict(v.verdict)}
          >
            <span className="verdict-label">{v.label}</span>
            {v.hint && <span className="verdict-hint">{v.hint}</span>}
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
