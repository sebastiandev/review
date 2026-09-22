import { describe, expect, it } from 'vitest'
import { buildReviewPrompt, extractInlinePayload, InvalidPayload, parsePayload, severityOf } from './agentReview.ts'
import { GITHUB_REPO, NOW, remotePr } from './testing/fakes.ts'

const anchors = { 'src/a.py': [1, 2, 3] }
const payload = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ pr: 1, repo: 'acme/widgets', event: 'REQUEST_CHANGES', body: 'Summary.', comments: [], ...over })

describe('parsePayload', () => {
  it('keeps valid comments inline and preserves invalid ones in the summary', () => {
    const text = payload({
      comments: [
        { path: 'src/a.py', line: 2, side: 'RIGHT', body: 'Block: nope' },
        { path: 'src/a.py', line: 3, start_line: 2, side: 'RIGHT', body: 'Question: why?' },
        { path: 'src/a.py', line: 99, side: 'RIGHT', body: 'floating' },
        { path: 'other.py', line: 1, side: 'RIGHT', body: 'wrong file' },
      ],
    })
    const parsed = parsePayload(text, anchors)
    expect(parsed).toMatchObject({
      verdict: 'REQUEST_CHANGES',
      invalid: 2,
      coverage: 'unknown',
      findings: [
        { path: 'src/a.py', line: 2, startLine: null, side: 'RIGHT', severity: 'block', body: 'Block: nope' },
        { path: 'src/a.py', line: 3, startLine: 2, side: 'RIGHT', severity: 'question', body: 'Question: why?' },
      ],
    })
    expect(parsed.body).toContain('Summary.')
    expect(parsed.body).toContain('src/a.py:99')
    expect(parsed.body).toContain('floating')
    expect(parsed.body).toContain('other.py:1')
    expect(parsed.body).toContain('wrong file')
    expect(parsed.body).not.toContain('Block: nope')
    expect(parsed.body).not.toContain('Question: why?')
  })

  it.each([
    ['not json', 'nope{', /not valid JSON/],
    ['an array', '[]', /not an object/],
    ['a bad event', payload({ event: 'LGTM' }), /event must be/],
    ['a non-string body', payload({ body: 3 }), /body must be/],
    ['comments not a list', payload({ comments: {} }), /comments must be/],
    ['a comment missing its path', payload({ comments: [{ line: 1, side: 'RIGHT', body: 'x' }] }), /comments\[0\]\.path/],
    ['a comment with a fractional line', payload({ comments: [{ path: 'a', line: 1.5, side: 'RIGHT', body: 'x' }] }), /comments\[0\]\.line/],
    ['a comment with an unknown side', payload({ comments: [{ path: 'a', line: 1, side: 'UP', body: 'x' }] }), /comments\[0\]\.side/],
  ])('rejects %s with InvalidPayload', (_label, text, message) => {
    expect(() => parsePayload(text, anchors)).toThrow(InvalidPayload)
    expect(() => parsePayload(text, anchors)).toThrow(message)
  })
})

describe('severityOf', () => {
  it.each([
    ['Block: x', 'block'],
    ['  question: x', 'question'],
    ['NOTE: x', 'note'],
    ['Plain remark', 'note'],
    ['Blocker without colon', 'note'],
  ])('%j -> %s', (body, severity) => {
    expect(severityOf(body)).toBe(severity)
  })
})

describe('buildReviewPrompt', () => {
  const pr = { ...remotePr({ number: 415 }), id: 1, repoId: 1, addedByUser: false, reviewOnOpen: false, specRef: null, doneAt: null, worktreePath: '/wt', syncedAt: NOW }

  const input = { pr, repo: GITHUB_REPO, worktreePath: '/wt', diffPath: '/payloads/p.diff', priorComments: [], specPath: null }

  it('supplies the source context and a parseable revision-bound JSON contract', () => {
    const prompt = buildReviewPrompt(input)
    expect(prompt).toContain(input.diffPath)
    expect(prompt).toContain(input.worktreePath)
    expect(prompt).toContain(pr.url)
    const contract = JSON.parse(extractInlinePayload(prompt)!)
    expect(contract).toMatchObject({ pr: pr.number, repo: 'acme/widgets', commit_id: pr.headSha, coverage: 'complete', event: 'COMMENT' })
    expect(Array.isArray(contract.comments)).toBe(true)
  })

  it('lists prior comments and the linked spec when given', () => {
    const prompt = buildReviewPrompt({ ...input, priorComments: ['src/a.py:2: rename this'], specPath: '/wt/docs/SPEC.md' })
    expect(prompt).toContain('You have ALREADY left these comments')
    expect(prompt).toContain('- src/a.py:2: rename this')
    expect(prompt).toContain('The PR references a spec at /wt/docs/SPEC.md; read it before reviewing.')
  })
})
