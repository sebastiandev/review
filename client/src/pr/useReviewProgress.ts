import { useSyncExternalStore } from 'react'
import type { ServerEvent } from '@review/shared'
import { useServerEvent } from '../events/useServerEvents'

export type ReviewStep = { tool: string; title: string }

const KEEP = 40

/** Append `step`, keeping the last `KEEP`. */
export function appendStep(steps: ReviewStep[], step: ReviewStep): ReviewStep[] {
  const next = [...steps, step]
  return next.length > KEEP ? next.slice(next.length - KEEP) : next
}

/**
 * Progress of every run this page has seen, by `agentReviewId`. Lives outside React so the steps
 * survive leaving and re-opening the PR; a run's entry is dropped when it ends.
 */
export function progressStore() {
  let runs = new Map<number, ReviewStep[]>()
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach((l) => l())
  return {
    apply(event: ServerEvent) {
      if (event.type === 'review.progress') {
        runs = new Map(runs).set(event.agentReviewId, appendStep(runs.get(event.agentReviewId) ?? [], event))
        notify()
      } else if (event.type === 'review.ready' || event.type === 'review.failed') {
        if (!runs.has(event.agentReviewId)) return
        runs = new Map(runs)
        runs.delete(event.agentReviewId)
        notify()
      }
    },
    steps(agentReviewId: number | null): ReviewStep[] {
      return (agentReviewId !== null && runs.get(agentReviewId)) || NONE
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

const NONE: ReviewStep[] = []
const store = progressStore()

/** Mount once at the app root: feeds every `review.*` event into the shared progress store. */
export function useCollectReviewProgress(): void {
  useServerEvent((event) => store.apply(event))
}

/** The completed tool calls of the agent run `agentReviewId` seen since this page loaded. */
export function useReviewProgress(agentReviewId: number | null): ReviewStep[] {
  return useSyncExternalStore(store.subscribe, () => store.steps(agentReviewId))
}
