import { describe, expect, it } from 'vitest'
import type { AgentReviewDetail, InboxRow } from '@review/shared'
import { formatReview, parsePrTarget } from './cliReview.ts'

describe('parsePrTarget', () => {
  it.each([
    ['https://github.com/Shiphero/Shiphero-API/pull/46887', { owner: 'Shiphero', name: 'Shiphero-API', number: 46887 }],
    ['https://github.com/acme/widgets/pull/12/files#diff-abc', { owner: 'acme', name: 'widgets', number: 12 }],
    ['acme/widgets#12', { owner: 'acme', name: 'widgets', number: 12 }],
  ])('%s', (text, expected) => {
    expect(parsePrTarget(text)).toEqual(expected)
  })

  it.each([['12'], ['#12'], ['https://gitlab.com/a/b/-/merge_requests/1'], ['acme/widgets']])('rejects %s', (text) => {
    expect(parsePrTarget(text)).toBeNull()
  })
})

describe('formatReview', () => {
  const pr = { number: 12, title: 'Fix widgets', url: 'https://github.com/acme/widgets/pull/12' } as InboxRow
  const detail: AgentReviewDetail = {
    review: {
      id: 1,
      prId: 1,
      headSha: 'sha',
      status: 'ready',
      agent: 'pr-reviewer',
      model: { providerID: 'openai', modelID: 'gpt-5' },
      variant: 'high',
      sessionId: null,
      verdict: 'REQUEST_CHANGES',
      summary: 'One thing to fix.',
      error: null,
      invalidAnchorCount: 1,
      startedAt: null,
      finishedAt: null,
    },
    findings: [
      { id: 1, agentReviewId: 1, path: 'src/a.py', line: 4, startLine: 2, side: 'RIGHT', severity: 'block', body: 'Block: wrong helper' },
      { id: 2, agentReviewId: 1, path: 'src/b.py', line: 9, startLine: null, side: 'LEFT', severity: 'question', body: 'why remove this?' },
    ],
  }

  it('prints feedback, conclusion and one entry per comment with its range and severity', () => {
    const text = formatReview(pr, detail)
    expect(text).toContain('#12 Fix widgets')
    expect(text).toContain('agent: pr-reviewer · openai/gpt-5 · high')
    expect(text).toContain('Feedback\n  One thing to fix.')
    expect(text).toContain('Conclusion: REQUEST_CHANGES')
    expect(text).toContain('Comments (2) · 1 dropped for bad anchors')
    expect(text).toContain('  src/a.py:2-4  [BLOCK]\n    wrong helper')
    expect(text).toContain('  src/b.py:9 (old)  [QUESTION]\n    why remove this?')
  })

  it('says (none) without comments', () => {
    const text = formatReview(pr, { review: { ...detail.review, invalidAnchorCount: 0 }, findings: [] })
    expect(text).toContain('Comments (0)\n  (none)')
  })
})
