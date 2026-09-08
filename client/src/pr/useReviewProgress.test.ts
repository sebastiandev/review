import { describe, expect, it } from 'vitest'
import { appendStep } from './useReviewProgress'

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
