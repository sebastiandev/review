import { describe, expect, it } from 'vitest'
import { sectionInView } from './sections'

describe('sectionInView', () => {
  const tops = [
    { id: 'accounts', top: 0 },
    { id: 'repositories', top: 300 },
    { id: 'agent', top: 700 },
  ]

  it.each([
    ['at the top', 0, 'accounts'],
    ['just before the second section starts', 250, 'accounts'],
    ['within the slack of the second section', 270, 'repositories'],
    ['deep inside the second section', 500, 'repositories'],
    ['past the last section', 2000, 'agent'],
  ])('%s', (_, scrollTop, expected) => {
    expect(sectionInView(tops, scrollTop)).toBe(expected)
  })

  it('is null without sections', () => {
    expect(sectionInView([], 0)).toBeNull()
  })
})
