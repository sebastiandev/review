import { describe, expect, it } from 'vitest'
import { parseSlashCommand, slashPrefix } from './slashCommand'

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
