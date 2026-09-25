import { expect, it } from 'vitest'
import { lineThreadId } from './chat.ts'
import type { DiffSelection } from '@review/shared'

it('keeps chat identities distinct for ranges and sides in the same file', () => {
  const anchor: DiffSelection = { path: 'src/a.ts', startLine: 10, endLine: 10, side: 'RIGHT', text: '' }
  const ids = [anchor, { ...anchor, endLine: 14 }, { ...anchor, side: 'LEFT' as const }].map(lineThreadId)
  expect(new Set(ids).size).toBe(3)
})
