import type { AgentReviewStatus, ReviewCoverage, Verdict } from '@review/shared'
import { agentStatusLabel } from '../pr/agentReview'

type AgentStatusProps = { status: AgentReviewStatus | null; verdict: Verdict | null; coverage: ReviewCoverage | null }

/** Agent-run status pushed right in a PR row's meta line; renders nothing when no run exists. */
export function AgentStatus({ status, verdict, coverage }: AgentStatusProps) {
  const label = agentStatusLabel(status, verdict, coverage)
  if (!label) return null
  return (
    <span className={`agent-status agent-status-${label.tone}`}>
      {label.tone === 'running' && <span className="spinner spinner-xs" aria-hidden />}
      {label.text}
    </span>
  )
}
