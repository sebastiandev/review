import { describe, expect, it } from 'vitest'
import type { InboxRow } from '@review/shared'
import { clampIndex, groupByRepo, groupCount, matchPrs, paletteCount, type PaletteRow } from './paletteRows'

function row(number: number, title: string, repo: string, author: string, headRef = 'main'): PaletteRow {
  return { pr: { number, title, headRef, author } as InboxRow, repo, author }
}

const rows = [
  row(412, 'Make the poll interval configurable', 'sebastiandev/atelier', 'sebastiandev', 'feat/poll'),
  row(2841, 'Rate-limit the inventory sync webhook', 'shiphero/shiphero-api', 'russelh15', 'fix/webhook-rate-limit'),
  row(405, 'Loop editor: outcome transitions', 'sebastiandev/atelier', 'gabriela-r'),
]

describe('matchPrs', () => {
  it('returns every row for an empty or blank query', () => {
    expect(matchPrs(rows, '')).toEqual(rows)
    expect(matchPrs(rows, '   ')).toEqual(rows)
  })

  it.each([
    ['title', 'POLL interval', [412]],
    ['number', '2841', [2841]],
    ['author', 'gabriela', [405]],
    ['branch', 'webhook-rate', [2841]],
    ['repo', 'shiphero-api', [2841]],
  ])('matches on %s', (_field, query, numbers) => {
    expect(matchPrs(rows, query).map((r) => r.pr.number)).toEqual(numbers)
  })
})

describe('groupByRepo', () => {
  it('groups in order of first appearance and keeps the flat order inside a group', () => {
    expect(groupByRepo(rows).map((g) => [g.repo, g.rows.map((r) => r.pr.number)])).toEqual([
      ['sebastiandev/atelier', [412, 405]],
      ['shiphero/shiphero-api', [2841]],
    ])
  })
})

describe('labels', () => {
  it('counts pending without a query and matched-of-total with one', () => {
    expect(paletteCount(3, 3, '')).toBe('3 pending')
    expect(paletteCount(1, 3, 'x')).toBe('1 of 3')
  })

  it('pluralises prs', () => {
    expect(groupCount(1)).toBe('1 pr')
    expect(groupCount(4)).toBe('4 prs')
  })
})

describe('clampIndex', () => {
  it.each([
    [0, 0, 0],
    [5, 3, 2],
    [-1, 3, 0],
    [1, 3, 1],
  ])('clamps %i within %i → %i', (index, length, expected) => {
    expect(clampIndex(index, length)).toBe(expected)
  })
})
