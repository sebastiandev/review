import { useState } from 'react'
import type { AgentFinding } from '@review/shared'
import { splitInlineCode } from '../chat/inlineCode'

type AgentFindingCardProps = {
  finding: AgentFinding
  agent: string
  /** A draft comment already keeps this finding. */
  kept: boolean
  dismissed: boolean
  onKeep: () => Promise<void>
  /** Drops the kept comment when there is one; hides the card otherwise. */
  onDismiss: () => Promise<void>
  onDiscuss: () => void
}

/** Prose with backticked identifiers set in mono. */
export function InlineBody({ text }: { text: string }) {
  return (
    <>
      {splitInlineCode(text).map((segment, i) =>
        segment.kind === 'code' ? (
          <code key={i} className="inline-code">
            {segment.text}
          </code>
        ) : (
          segment.text
        ),
      )}
    </>
  )
}

/** One agent finding under its diff line: accent-bordered card with Keep in review / Dismiss / Discuss. */
export function AgentFindingCard({ finding, agent, kept, dismissed, onKeep, onDismiss, onDiscuss }: AgentFindingCardProps) {
  const [busy, setBusy] = useState(false)

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    try {
      await action()
    } finally {
      setBusy(false)
    }
  }

  if (dismissed) {
    return <span className="finding-dismissed">dismissed · {finding.severity}</span>
  }

  return (
    <div className="finding">
      <div className="artifact-ref finding-head">
        <span className="finding-agent">{agent} · opencode</span>
        <span className="finding-severity">{finding.severity}</span>
        {kept && <span className="artifact-push finding-kept">kept ✓</span>}
      </div>
      <div className="artifact-body">
        <InlineBody text={finding.body} />
      </div>
      <div className="artifact-actions">
        {!kept && (
          <button type="button" className="btn btn-primary btn-xs" disabled={busy} onClick={() => void run(onKeep)}>
            Keep in review
          </button>
        )}
        <button type="button" className="btn btn-secondary btn-xs" disabled={busy} onClick={() => void run(onDismiss)}>
          Dismiss
        </button>
        <button type="button" className="btn btn-ghost btn-xs" disabled={busy} onClick={onDiscuss}>
          Discuss
        </button>
      </div>
    </div>
  )
}
