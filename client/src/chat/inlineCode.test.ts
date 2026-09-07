import { describe, expect, it } from 'vitest'
import { splitInlineCode } from './inlineCode'

describe('splitInlineCode', () => {
  it('returns prose untouched when there are no backticks', () => {
    expect(splitInlineCode('plain words')).toEqual([{ kind: 'text', text: 'plain words' }])
  })

  it('lifts backticked identifiers into code segments', () => {
    expect(splitInlineCode('move `clamp` into `domain/settings`.')).toEqual([
      { kind: 'text', text: 'move ' },
      { kind: 'code', text: 'clamp' },
      { kind: 'text', text: ' into ' },
      { kind: 'code', text: 'domain/settings' },
      { kind: 'text', text: '.' },
    ])
  })

  it('keeps an unmatched backtick as prose', () => {
    expect(splitInlineCode('odd ` tick')).toEqual([{ kind: 'text', text: 'odd ` tick' }])
  })
})
