import { expect, it } from 'vitest'
import { containsSelection, selectionLabel } from './chatContext'
import type { DiffSelection } from '@review/shared'

const range: DiffSelection = { path: 'src/a.ts', side: 'RIGHT', startLine: 10, endLine: 14, text: 'code' }
it.each([
  [{ startLine: 12, endLine: 12 }, true], [{ startLine: 10, endLine: 14 }, true],
  [{ startLine: 9 }, false], [{ endLine: 15 }, false], [{ side: 'LEFT' }, false], [{ path: 'other.ts' }, false],
] as [Partial<DiffSelection>, boolean][])('contains only matching file/side/range: %j', (patch, expected) => {
  expect(containsSelection(range, { ...range, ...patch })).toBe(expected)
})
it('labels single lines and ranges distinctly', () => {
  expect(selectionLabel(range)).toBe('a.ts:10–14')
  expect(selectionLabel({ ...range, endLine: 10 })).toBe('a.ts:10')
})
