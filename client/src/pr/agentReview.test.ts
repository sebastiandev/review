import { describe, expect, it } from 'vitest'
import type { AgentFinding, AgentReview, AgentReviewDetail, DraftCommentRow } from '@review/shared'
import { agentStatusLabel, findingsByLine, labelFor, provenance, quoteForDiscussion, submitHints } from './agentReview'

function review(over: Partial<AgentReview> = {}): AgentReview {
  return {
    id: 7,
    prId: 1,
    headSha: 'abc',
    status: 'ready',
    agent: 'reviewer',
    model: { providerID: 'anthropic', modelID: 'claude-sonnet-4.5' },
    variant: 'high',
    sessionId: null,
    verdict: 'REQUEST_CHANGES',
    summary: 'Two blockers.',
    error: null,
    invalidAnchorCount: 0,
    startedAt: null,
    finishedAt: '2026-09-07T10:00:00Z',
    ...over,
  }
}

function finding(over: Partial<AgentFinding> & Pick<AgentFinding, 'id'>): AgentFinding {
  return { agentReviewId: 7, path: 'a.py', line: 10, startLine: null, side: 'RIGHT', severity: 'note', body: 'b', ...over }
}

function draft(over: Partial<DraftCommentRow> & Pick<DraftCommentRow, 'id'>): DraftCommentRow {
  return {
    path: 'a.py',
    line: 10,
    startLine: null,
    side: 'RIGHT',
    body: '',
    agentBody: null,
    origin: 'human',
    selected: true,
    anchorValid: true,
    inReplyTo: null,
    findingId: null,
    ...over,
  }
}

describe('findingsByLine', () => {
  it('groups findings of the file by side:line and leaves other files out', () => {
    const grouped = findingsByLine(
      [finding({ id: 1 }), finding({ id: 2, line: 10 }), finding({ id: 3, side: 'LEFT', line: 4 }), finding({ id: 4, path: 'b.py' })],
      'a.py',
    )
    expect(Object.keys(grouped).sort()).toEqual(['new:10', 'old:4'])
    expect(grouped['new:10']?.map((f) => f.id)).toEqual([1, 2])
    expect(grouped['old:4']?.map((f) => f.id)).toEqual([3])
  })

  it('is empty when no finding belongs to the file', () => {
    expect(findingsByLine([finding({ id: 1 })], 'zzz.py')).toEqual({})
  })
})

describe('labelFor', () => {
  it.each([
    [null, { label: 'Run agent review', disabled: false, action: 'run' }],
    [review({ status: 'queued' }), { label: 'Reviewing…', disabled: false, action: 'open' }],
    [review({ status: 'running' }), { label: 'Reviewing…', disabled: false, action: 'open' }],
    [review({ status: 'ready' }), { label: 'Agent review · 4', disabled: false, action: 'open' }],
    [review({ status: 'failed' }), { label: 'Review failed', disabled: false, action: 'open' }],
  ])('maps %o', (input, expected) => {
    expect(labelFor(input, 4)).toEqual(expected)
  })
})

describe('submitHints', () => {
  it('reports agreement as kept findings over the run total when a ready run exists', () => {
    const detail: AgentReviewDetail = { review: review(), findings: [finding({ id: 1 }), finding({ id: 2 }), finding({ id: 3 }), finding({ id: 4 })] }
    const drafts = [draft({ id: 1, findingId: 1 }), draft({ id: 2, findingId: 2 }), draft({ id: 3 })]
    expect(submitHints({ agentReview: detail, drafts })).toEqual({
      COMMENT: 'Submit notes without a verdict',
      APPROVE: 'Agent agreed on 2 of 4 findings',
      REQUEST_CHANGES: 'Agent suggests this',
    })
  })

  it('says the agent was not run when there is no ready run', () => {
    expect(submitHints({ agentReview: null, drafts: [] }).APPROVE).toBe('Agent not run')
    expect(submitHints({ agentReview: { review: review({ status: 'running', verdict: null }), findings: [] }, drafts: [] }).APPROVE).toBe(
      'Agent not run',
    )
  })

  it('leaves the request-changes hint empty when the agent suggested something else', () => {
    const detail: AgentReviewDetail = { review: review({ verdict: 'APPROVE' }), findings: [] }
    expect(submitHints({ agentReview: detail, drafts: [] }).REQUEST_CHANGES).toBe('')
  })
})

describe('agentStatusLabel', () => {
  it.each([
    [null, null, null],
    ['queued', null, { text: 'agent reviewing…', tone: 'running' }],
    ['running', null, { text: 'agent reviewing…', tone: 'running' }],
    ['ready', 'REQUEST_CHANGES', { text: 'agent: request changes', tone: 'ready' }],
    ['ready', 'APPROVE', { text: 'agent: approve', tone: 'ready' }],
    ['failed', null, { text: 'agent failed', tone: 'failed' }],
  ] as const)('%s / %s', (status, verdict, expected) => {
    expect(agentStatusLabel(status, verdict)).toEqual(expected)
  })
})

describe('provenance', () => {
  it('names opencode, agent, model, variant and the finish time', () => {
    expect(provenance(review(), Date.parse('2026-09-07T10:03:12Z'))).toBe('opencode · reviewer · claude-sonnet-4.5 · high · 3m ago')
  })

  it('skips the parts a run lacks', () => {
    expect(provenance(review({ model: null, variant: null, finishedAt: null }), 0)).toBe('opencode · reviewer')
  })
})

describe('quoteForDiscussion', () => {
  it('flattens the finding onto one quoted line', () => {
    expect(quoteForDiscussion('Missing  null\ncheck on `x`.')).toBe('> Missing null check on `x`. ')
  })
})
