import { describe, expect, it } from 'vitest'
import { buildReviewPrompt, InvalidPayload, parsePayload, severityOf } from './agentReview.ts'
import { GITHUB_REPO, NOW, remotePr } from './testing/fakes.ts'

const anchors = { 'src/a.py': [1, 2, 3] }
const payload = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ pr: 1, repo: 'acme/widgets', event: 'REQUEST_CHANGES', body: 'Summary.', comments: [], ...over })

describe('parsePayload', () => {
  it('maps event, body and anchored comments; drops and counts the rest', () => {
    const text = payload({
      comments: [
        { path: 'src/a.py', line: 2, side: 'RIGHT', body: 'Block: nope' },
        { path: 'src/a.py', line: 3, start_line: 2, side: 'RIGHT', body: 'Question: why?' },
        { path: 'src/a.py', line: 99, side: 'RIGHT', body: 'floating' },
        { path: 'other.py', line: 1, side: 'RIGHT', body: 'wrong file' },
      ],
    })
    expect(parsePayload(text, anchors)).toEqual({
      verdict: 'REQUEST_CHANGES',
      body: 'Summary.',
      invalid: 2,
      findings: [
        { path: 'src/a.py', line: 2, startLine: null, side: 'RIGHT', severity: 'block', body: 'Block: nope' },
        { path: 'src/a.py', line: 3, startLine: 2, side: 'RIGHT', severity: 'question', body: 'Question: why?' },
      ],
    })
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

  it('names the PR, the payload path and the github-mode rules', () => {
    const prompt = buildReviewPrompt(pr, GITHUB_REPO, '/payloads/p.json', [], null)
    expect(prompt).toContain('Review PR 415 in repo acme/widgets in github mode.')
    expect(prompt).toContain('gh pr view 415 --repo acme/widgets --json title,body,files and gh pr diff 415 --repo acme/widgets')
    expect(prompt).toContain('Write the review payload to /payloads/p.json using the github-mode schema.')
    expect(prompt).toContain('use REQUEST_CHANGES if you have any Block, otherwise COMMENT.')
    expect(prompt).not.toContain('ALREADY')
    expect(prompt).not.toContain('spec')
  })

  it('lists prior comments and the linked spec when given', () => {
    const prompt = buildReviewPrompt(pr, GITHUB_REPO, '/payloads/p.json', ['src/a.py:2: rename this'], '/wt/docs/SPEC.md')
    expect(prompt).toContain('You have ALREADY left these comments')
    expect(prompt).toContain('- src/a.py:2: rename this')
    expect(prompt).toContain('The PR references a spec at /wt/docs/SPEC.md; read it before reviewing.')
  })
})
