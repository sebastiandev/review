import { describe, expect, it } from 'vitest'
import { contextGaps, gapLines, parseHunkHeader, splitFileLines } from './contextGaps'

const hunk = (header: string) => ({ header, lines: [] })

describe('parseHunkHeader', () => {
  it.each([
    ['@@ -1,3 +1,3 @@', { oldStart: 1, oldCount: 3, newStart: 1, newCount: 3 }],
    ['@@ -10,7 +12,8 @@ def foo():', { oldStart: 10, oldCount: 7, newStart: 12, newCount: 8 }],
    ['@@ -0,0 +1 @@', { oldStart: 0, oldCount: 0, newStart: 1, newCount: 1 }],
  ])('%s', (header, expected) => {
    expect(parseHunkHeader(header)).toEqual(expected)
  })

  it('is null for anything else', () => {
    expect(parseHunkHeader('not a header')).toBeNull()
  })
})

describe('contextGaps', () => {
  it('finds the gap above, between and below hunks with the old/new offset of each', () => {
    const gaps = contextGaps([hunk('@@ -10,5 +12,6 @@'), hunk('@@ -30,4 +33,4 @@')])
    expect(gaps).toEqual([
      { id: 'before', newStart: 1, newEnd: 11, delta: -2 },
      { id: 'after:0', newStart: 18, newEnd: 32, delta: -3 },
      { id: 'after', newStart: 37, newEnd: null, delta: -3 },
    ])
  })

  it('skips the gap above a hunk starting at line 1 and between adjacent hunks', () => {
    const gaps = contextGaps([hunk('@@ -1,3 +1,3 @@'), hunk('@@ -4,2 +4,2 @@')])
    expect(gaps.map((g) => g.id)).toEqual(['after'])
  })

  it('is empty for a file without hunks', () => {
    expect(contextGaps([])).toEqual([])
  })
})

describe('gapLines', () => {
  const lines = ['a', 'b', 'c', 'd', 'e']

  it('numbers the lines on both sides', () => {
    expect(gapLines({ id: 'x', newStart: 2, newEnd: 3, delta: 5 }, lines)).toEqual([
      { kind: 'normal', oldLine: 7, newLine: 2, text: 'b' },
      { kind: 'normal', oldLine: 8, newLine: 3, text: 'c' },
    ])
  })

  it('runs to the end of the file for the trailing gap, and is empty past it', () => {
    expect(gapLines({ id: 'x', newStart: 4, newEnd: null, delta: 0 }, lines).map((l) => l.text)).toEqual(['d', 'e'])
    expect(gapLines({ id: 'x', newStart: 6, newEnd: null, delta: 0 }, lines)).toEqual([])
  })
})

describe('splitFileLines', () => {
  it('ignores the trailing newline', () => {
    expect(splitFileLines('a\nb\n')).toEqual(['a', 'b'])
    expect(splitFileLines('a\nb')).toEqual(['a', 'b'])
  })
})
