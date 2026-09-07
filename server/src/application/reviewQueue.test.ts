import { describe, expect, it } from 'vitest'
import type { RunReviewResult } from '../domain/agentReview.ts'
import { reviewQueue } from './reviewQueue.ts'

const request = (prId: number) => ({ prId, agent: 'pr-reviewer', model: null, variant: null })

describe('reviewQueue', () => {
  it('runs one review at a time and frees the slot when it settles', async () => {
    let finish!: (r: RunReviewResult) => void
    const started: number[] = []
    const queue = reviewQueue({
      log: () => {},
      runReview: (req) =>
        new Promise((resolve) => {
          started.push(req.prId)
          finish = resolve
        }),
    })

    expect(queue.enqueue(request(1))).toBe('queued')
    expect(queue.enqueue(request(2))).toBe('busy')
    expect(started).toEqual([1])

    finish({} as RunReviewResult)
    await Promise.resolve()
    await Promise.resolve()
    expect(queue.enqueue(request(2))).toBe('queued')
    expect(started).toEqual([1, 2])
  })

  it('frees the slot when the run fails', async () => {
    const queue = reviewQueue({ log: () => {}, runReview: () => Promise.reject(new Error('boom')) })
    expect(queue.enqueue(request(1))).toBe('queued')
    await new Promise((r) => setTimeout(r, 0))
    expect(queue.enqueue(request(1))).toBe('queued')
  })
})
