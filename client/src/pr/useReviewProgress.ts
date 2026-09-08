import { useState } from 'react'
import { useServerEvent } from '../events/useServerEvents'

export type ReviewStep = { tool: string; title: string }

const KEEP = 40

/** Append `step`, keeping the last `KEEP`. */
export function appendStep(steps: ReviewStep[], step: ReviewStep): ReviewStep[] {
  const next = [...steps, step]
  return next.length > KEEP ? next.slice(next.length - KEEP) : next
}

/**
 * The completed tool calls of the agent run `agentReviewId`, as `review.progress` events arrive.
 * Resets when the run changes; empty for runs that finished before this component mounted.
 */
export function useReviewProgress(agentReviewId: number | null): ReviewStep[] {
  const [state, setState] = useState<{ id: number | null; steps: ReviewStep[] }>({ id: agentReviewId, steps: [] })
  useServerEvent((event) => {
    if (event.type !== 'review.progress' || event.agentReviewId !== agentReviewId) return
    setState((current) => ({ id: agentReviewId, steps: appendStep(current.id === agentReviewId ? current.steps : [], event) }))
  })
  return state.id === agentReviewId ? state.steps : []
}
