import { describe, expect, it } from 'vitest'
import { linesFromBlocks, overlaps } from './lineMap'

describe('linesFromBlocks', () => {
  it('spans from the earliest start to the latest end', () => {
    expect(linesFromBlocks({ start: 22, end: 24 }, { start: 30, end: 33 })).toEqual({ startLine: 22, endLine: 33 })
  })

  it('is the block itself when the selection stays inside one block', () => {
    expect(linesFromBlocks({ start: 47, end: 47 }, { start: 47, end: 47 })).toEqual({ startLine: 47, endLine: 47 })
  })

  it('does not depend on selection direction', () => {
    const forward = linesFromBlocks({ start: 5, end: 6 }, { start: 10, end: 12 })
    const backward = linesFromBlocks({ start: 10, end: 12 }, { start: 5, end: 6 })
    expect(backward).toEqual(forward)
  })

  it('covers a nested block that starts inside and ends beyond the other', () => {
    expect(linesFromBlocks({ start: 3, end: 9 }, { start: 5, end: 6 })).toEqual({ startLine: 3, endLine: 9 })
  })
})

describe('overlaps', () => {
  it.each([
    ['thread inside the block', { startLine: 23, endLine: 23 }, { start: 22, end: 24 }, true],
    ['thread covering the block', { startLine: 20, endLine: 30 }, { start: 22, end: 24 }, true],
    ['thread touching the last line', { startLine: 24, endLine: 26 }, { start: 22, end: 24 }, true],
    ['thread ending just before', { startLine: 20, endLine: 21 }, { start: 22, end: 24 }, false],
    ['thread starting just after', { startLine: 25, endLine: 25 }, { start: 22, end: 24 }, false],
  ])('%s', (_, thread, block, expected) => {
    expect(overlaps(thread, block)).toBe(expected)
  })
})
