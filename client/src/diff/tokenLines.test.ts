import { describe, expect, it } from 'vitest'
import { diffLineTokens, tokenLines } from './tokenLines'

const scopesOf = (line: { text: string; scopes: string[] }[], text: string) => line.find((t) => t.text.includes(text))?.scopes

describe('tokenLines', () => {
  it('keeps a multi-line docstring a string on its continuation lines', () => {
    const lines = tokenLines('def f():\n    """\n    turn in a lock for update\n    """\n', 'python')
    expect(scopesOf(lines[2]!, 'lock for')).toEqual(['triple-quoted-string string'])
  })

  it('returns one entry per line, empty lines included', () => {
    expect(tokenLines('a\n\nb', null)).toEqual([[{ text: 'a', scopes: [] }], [], [{ text: 'b', scopes: [] }]])
  })

  it('marks Python attribute access as a property', () => {
    const [line] = tokenLines('self.qspec = qspec', 'python')
    expect(scopesOf(line!, 'qspec')).toEqual(['property'])
  })
})

describe('diffLineTokens', () => {
  const file = ['class A:', '    """', '    Params:', '    - read: take locks for a read', '    """']
  const hunk = { header: '@@ -3,2 +3,3 @@', lines: [
    { kind: 'normal' as const, oldLine: 3, newLine: 3, text: '    Params:' },
    { kind: 'add' as const, oldLine: null, newLine: 4, text: '    - read: take locks for a read' },
    { kind: 'normal' as const, oldLine: 4, newLine: 5, text: '    """' },
  ] }

  it('colours a hunk that starts inside a docstring from the whole file', () => {
    const tokens = diffLineTokens([hunk], file, 'python')(hunk.lines[1]!)
    expect(scopesOf(tokens, 'locks for')).toEqual(['triple-quoted-string string'])
  })

  it('falls back to the hunk block when the file is not loaded', () => {
    const tokens = diffLineTokens([hunk], null, 'python')(hunk.lines[1]!)
    expect(scopesOf(tokens, 'locks')).toEqual([])
  })
})
