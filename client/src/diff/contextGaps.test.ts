import { describe, expect, it } from 'vitest'
import { contextGaps, gapLines, gapSize, HIDDEN, parseHunkHeader, revealedLines, revealMore, splitFileLines } from './contextGaps'

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

describe('revealMore', () => {
  const size = 50
  it.each([
    ['down', { top: 0, bottom: 0 }, { top: 20, bottom: 0 }],
    ['up', { top: 0, bottom: 0 }, { top: 0, bottom: 20 }],
    ['up', { top: 20, bottom: 20 }, { top: 20, bottom: 30 }],
    ['all', { top: 20, bottom: 5 }, { top: 45, bottom: 5 }],
  ] as const)('%s from %o reveals %o', (direction, reveal, expected) => {
    expect(revealMore(reveal, size, direction)).toEqual(expected)
  })
})

describe('revealedLines', () => {
  const file = Array.from({ length: 40 }, (_, i) => `line ${i + 1}`)
  const gap = { id: 'after:0', newStart: 11, newEnd: 30, delta: 2 }

  it('takes the top lines under the hunk above and the bottom lines over the hunk below', () => {
    const { top, bottom } = revealedLines(gap, { top: 2, bottom: 3 }, file)
    expect(top.map((l) => l.newLine)).toEqual([11, 12])
    expect(bottom.map((l) => l.newLine)).toEqual([28, 29, 30])
    expect(bottom[0]).toEqual({ kind: 'normal', oldLine: 30, newLine: 28, text: 'line 28' })
  })

  it('sizes the trailing gap from the file', () => {
    const trailing = { id: 'after', newStart: 35, newEnd: null, delta: 0 }
    expect(gapSize(trailing, file.length)).toBe(6)
    expect(revealedLines(trailing, revealMore(HIDDEN, 6, 'down'), file).top.map((l) => l.newLine)).toEqual([35, 36, 37, 38, 39, 40])
  })
})
