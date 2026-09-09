import { describe, expect, it } from 'vitest'
import { appendStep, progressStore } from './useReviewProgress'

describe('appendStep', () => {
  it('appends in order', () => {
    const steps = appendStep([{ tool: 'read', title: 'Read a' }], { tool: 'grep', title: 'Grep b' })
    expect(steps.map((s) => s.title)).toEqual(['Read a', 'Grep b'])
  })

  it('keeps only the most recent 40', () => {
    let steps = [] as ReturnType<typeof appendStep>
    for (let i = 0; i < 45; i++) steps = appendStep(steps, { tool: 'read', title: `Read ${i}` })
    expect(steps).toHaveLength(40)
    expect(steps[0]!.title).toBe('Read 5')
    expect(steps[39]!.title).toBe('Read 44')
  })
})

describe('progressStore', () => {
  const progress = (agentReviewId: number, title: string) => ({ type: 'review.progress', prId: 1, agentReviewId, tool: 'read', title }) as const

  it('keeps steps per run so they survive leaving the PR', () => {
    const store = progressStore()
    store.apply(progress(7, 'Read a'))
    store.apply(progress(8, 'Read other'))
    store.apply(progress(7, 'Read b'))
    expect(store.steps(7).map((s) => s.title)).toEqual(['Read a', 'Read b'])
    expect(store.steps(8).map((s) => s.title)).toEqual(['Read other'])
    expect(store.steps(null)).toEqual([])
  })

  it('drops a run when it ends and notifies subscribers', () => {
    const store = progressStore()
    let notified = 0
    store.subscribe(() => notified++)
    store.apply(progress(7, 'Read a'))
    store.apply({ type: 'review.ready', prId: 1, agentReviewId: 7, verdict: 'COMMENT', findingCount: 0 })
    expect(store.steps(7)).toEqual([])
    expect(notified).toBe(2)
  })
})
