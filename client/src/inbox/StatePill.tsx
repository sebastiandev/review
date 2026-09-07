type StatePillProps = { state: 'open' | 'merged' | 'closed'; isDraft: boolean }

/** `open` in accent, `draft` (and merged/closed) in neutral. */
export function StatePill({ state, isDraft }: StatePillProps) {
  const label = isDraft ? 'draft' : state
  return <span className={`pill${label === 'open' ? ' pill-open' : ''}`}>{label}</span>
}
