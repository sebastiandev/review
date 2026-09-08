import { useState } from 'react'
import { Check } from '@phosphor-icons/react'
import type { AgentFinding, AgentReviewDetail } from '@review/shared'
import { InlineBody } from './AgentFindingCard'
import { VERDICT_TEXT, provenance } from './agentReview'
import type { ReviewStep } from './useReviewProgress'

type AgentReviewPanelProps = {
  detail: AgentReviewDetail
  /** Tool calls the running agent has completed so far, oldest first. */
  steps: ReviewStep[]
  now: number
  busy: boolean
  /** Server-side rejection of the last keep / re-run. */
  error: string | null
  onClose: () => void
  onJump: (finding: AgentFinding) => void
  onKeepAll: () => void
  onKeepSelected: (findingIds: number[]) => void
  onRerun: () => void
}

/** Screen 4: the run's suggested conclusion and one card per finding, over the center pane. */
export function AgentReviewPanel({ detail, steps, now, busy, error, onClose, onJump, onKeepAll, onKeepSelected, onRerun }: AgentReviewPanelProps) {
  const { review, findings } = detail
  const [unchecked, setUnchecked] = useState<ReadonlySet<number>>(new Set())
  const selected = findings.filter((f) => !unchecked.has(f.id)).map((f) => f.id)

  const toggle = (id: number) => {
    setUnchecked((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="panel-backdrop" onClick={onClose}>
      <div className="panel" role="dialog" aria-label="Automatic review" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h4>Automatic review</h4>
          <span className="sheet-hint">{provenance(review, now)}</span>
          <button type="button" className="btn btn-ghost btn-xs modal-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>

        {(review.status === 'queued' || review.status === 'running') && (
          <>
            <p className="panel-running">
              <span className="spinner" aria-hidden />
              {review.status === 'queued'
                ? 'Queued — waiting for the previous run…'
                : steps.length === 0
                  ? 'Reviewing — the agent is starting…'
                  : `Reviewing — ${steps.length} step${steps.length === 1 ? '' : 's'} so far`}
            </p>
            {steps.length > 0 && (
              <ol className="panel-steps mono" aria-label="Agent progress">
                {steps.map((step, i) => (
                  <li key={i} className={i === steps.length - 1 ? 'panel-step panel-step-last' : 'panel-step'}>
                    <span className="panel-step-tool">{step.tool}</span>
                    <span className="panel-step-title">{step.title}</span>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}

        {review.status === 'failed' && (
          <>
            <div className="panel-error">{review.error ?? 'The run failed without a message.'}</div>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={onRerun}>
                Re-run
              </button>
            </div>
          </>
        )}

        {review.status === 'ready' && (
          <>
            <div className="conclusion">
              <div className="overline conclusion-overline">Suggested conclusion</div>
              <div className="conclusion-verdict">{review.verdict ? VERDICT_TEXT[review.verdict] : '—'}</div>
              {review.summary && (
                <div className="conclusion-summary">
                  <InlineBody text={review.summary} />
                </div>
              )}
            </div>
            <div className="overline panel-count">
              {findings.length} {findings.length === 1 ? 'finding' : 'findings'}
              {review.invalidAnchorCount > 0 && ` · ${review.invalidAnchorCount} dropped (off-diff)`}
            </div>
            <div className="panel-findings">
              {findings.map((finding) => {
                const checked = !unchecked.has(finding.id)
                return (
                  <div key={finding.id} className="panel-finding" onClick={() => onJump(finding)}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      className={`checkbox${checked ? ' checkbox-on' : ''}`}
                      title="Keep this finding"
                      onClick={(e) => {
                        e.stopPropagation()
                        toggle(finding.id)
                      }}
                    >
                      {checked && <Check size={10} weight="bold" />}
                    </button>
                    <div className="panel-finding-text">
                      <div className="artifact-ref">
                        <span className="panel-finding-ref">
                          {finding.path}:{finding.line}
                        </span>
                        <span>{finding.severity}</span>
                      </div>
                      <div className="artifact-body">
                        <InlineBody text={finding.body} />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            {error && <p className="modal-error">{error}</p>}
            <div className="modal-actions">
              <button type="button" className="btn btn-primary" disabled={busy || findings.length === 0} onClick={onKeepAll}>
                Accept all into my review
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy || selected.length === 0}
                onClick={() => onKeepSelected(selected)}
              >
                Keep {selected.length} selected
              </button>
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={onRerun}>
                Re-run
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
