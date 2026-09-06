import { describe, expect, it } from 'vitest'
import { groupSelectedRows, type SelectedRow } from './groupSelectedRows'

const row = (path: string, line: number, side: SelectedRow['side'], text = `L${line}`): SelectedRow => ({
  path,
  line,
  side,
  text,
})

describe('groupSelectedRows', () => {
  it('returns no selections for no rows', () => {
    expect(groupSelectedRows([])).toEqual([])
  })

  it('folds contiguous lines of one file into a single range with joined text', () => {
    const rows = [row('a.py', 10, 'new', 'x = 1'), row('a.py', 11, 'new', 'y = 2'), row('a.py', 12, 'new', 'z = 3')]
    expect(groupSelectedRows(rows)).toEqual([
      { path: 'a.py', startLine: 10, endLine: 12, side: 'RIGHT', text: 'x = 1\ny = 2\nz = 3' },
    ])
  })

  it('splits when the line numbers are not consecutive', () => {
    const rows = [row('a.py', 10, 'new'), row('a.py', 11, 'new'), row('a.py', 40, 'new')]
    expect(groupSelectedRows(rows).map((s) => [s.startLine, s.endLine])).toEqual([
      [10, 11],
      [40, 40],
    ])
  })

  it('splits across files', () => {
    const rows = [row('a.py', 1, 'new'), row('a.py', 2, 'new'), row('b.py', 3, 'new')]
    expect(groupSelectedRows(rows).map((s) => [s.path, s.startLine, s.endLine])).toEqual([
      ['a.py', 1, 2],
      ['b.py', 3, 3],
    ])
  })

  it.each([
    ['old', 'LEFT'],
    ['new', 'RIGHT'],
  ] as const)('derives side %s -> %s', (side, expected) => {
    expect(groupSelectedRows([row('a.py', 5, side)])[0]?.side).toBe(expected)
  })

  it('keeps deleted and inserted runs apart even when line numbers continue', () => {
    const rows = [row('a.py', 10, 'old'), row('a.py', 11, 'new')]
    expect(groupSelectedRows(rows).map((s) => s.side)).toEqual(['LEFT', 'RIGHT'])
  })
})
