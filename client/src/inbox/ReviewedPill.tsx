import type { Verdict } from '@review/shared'
import { VERDICT_LABEL, verdictPillClass } from '../past/pastRows'

type ReviewedPillProps = { verdict: Verdict | null }

/** `approved` / `changes requested` / `commented` for the verdict submitted on the current head; nothing when pending. */
export function ReviewedPill({ verdict }: ReviewedPillProps) {
  if (!verdict) return null
  return (
    <span className={verdictPillClass(verdict)} title="Your review on this commit">
      {VERDICT_LABEL[verdict]}
    </span>
  )
}
