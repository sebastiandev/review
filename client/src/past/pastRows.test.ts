import { describe, expect, it } from 'vitest'
import type { PastReviewRow } from '@review/shared'
import { filterVerdict, verdictPillClass, withWorktreePaths } from './pastRows'

describe('filterVerdict', () => {
  it.each([
    ['all', null],
    ['approved', 'APPROVE'],
    ['changes', 'REQUEST_CHANGES'],
    ['commented', 'COMMENT'],
  ] as const)('%s → %s', (filter, verdict) => {
    expect(filterVerdict(filter)).toBe(verdict)
  })
})

describe('verdictPillClass', () => {
  it.each([
    ['APPROVE', 'pill pill-approved'],
    ['REQUEST_CHANGES', 'pill pill-changes'],
    ['COMMENT', 'pill'],
  ] as const)('%s → %s', (verdict, className) => {
    expect(verdictPillClass(verdict)).toBe(className)
  })
})

describe('withWorktreePaths', () => {
  const row = (submissionId: number, prId: number): PastReviewRow => ({
    submissionId,
    prId,
    repo: 'acme/widgets',
    number: prId,
    title: `PR ${prId}`,
    url: '',
    verdict: 'COMMENT',
    agentVerdict: null,
    agentAgreement: 'not run',
    body: '',
    submittedAt: '2026-09-07T10:00:00.000Z',
  })

  it('attaches the path of the PR that still has a worktree and null otherwise', () => {
    const lines = withWorktreePaths([row(1, 10), row(2, 11)], [{ prId: 10, path: '/wt/10' }])
    expect(lines.map((l) => l.worktreePath)).toEqual(['/wt/10', null])
  })
})
