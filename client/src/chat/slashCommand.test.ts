import { describe, expect, it } from 'vitest'
import { completeMention, mentionAt, parseSlashCommand, slashPrefix } from './slashCommand'

const KNOWN = ['review', 'review-pr', 'checkpoint']

describe('parseSlashCommand', () => {
  it.each([
    ['/models', { kind: 'local', name: 'models' }],
    ['/agents', { kind: 'local', name: 'agents' }],
    ['/variants', { kind: 'local', name: 'variants' }],
    ['/review foo bar', { kind: 'server', name: 'review', args: 'foo bar' }],
    ['/review', { kind: 'server', name: 'review', args: '' }],
    ['/review-pr 42', { kind: 'server', name: 'review-pr', args: '42' }],
    ['/unknown x', { kind: 'text' }],
    ['plain text', { kind: 'text' }],
    ['', { kind: 'text' }],
  ])('%j', (draft, expected) => {
    expect(parseSlashCommand(draft, KNOWN)).toEqual(expected)
  })

  it('keeps multi-line arguments after the command name', () => {
    expect(parseSlashCommand('/review look at\n```a.py:1-2\nx\n```\n', KNOWN)).toEqual({
      kind: 'server',
      name: 'review',
      args: 'look at\n```a.py:1-2\nx\n```',
    })
  })

  it('treats a local command with arguments as text', () => {
    expect(parseSlashCommand('/models gpt', KNOWN)).toEqual({ kind: 'text' })
  })
})

describe('slashPrefix', () => {
  it.each([
    ['/', ''],
    ['/rev', 'rev'],
    ['/review ', null],
    ['review', null],
    ['', null],
  ])('%j -> %j', (draft, expected) => {
    expect(slashPrefix(draft)).toBe(expected)
  })
})

describe('mentionAt', () => {
  it.each([
    ['at the start', '@src', 4, { start: 0, query: 'src' }],
    ['after a space', 'look at @ker', 12, { start: 8, query: 'ker' }],
    ['bare @', 'see @', 5, { start: 4, query: '' }],
    ['caret before the mention ends', '@abc def', 2, { start: 0, query: 'a' }],
  ])('%s', (_, draft, caret, expected) => {
    expect(mentionAt(draft, caret)).toEqual(expected)
  })

  it.each([
    ['an email-like token', 'mail me@host', 12],
    ['after the mention is closed with a space', '@src/a.py ', 10],
    ['no @', 'plain text', 10],
  ])('is null for %s', (_, draft, caret) => {
    expect(mentionAt(draft, caret)).toBeNull()
  })
})

describe('completeMention', () => {
  it('replaces the typed prefix with the path and a trailing space', () => {
    const result = completeMention('look at @ker please', { start: 8, query: 'ker' }, 12, 'kernel/a.py')
    expect(result).toEqual({ draft: 'look at @kernel/a.py  please', caret: 8 + '@kernel/a.py '.length })
  })
})
