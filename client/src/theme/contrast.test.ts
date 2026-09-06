import { describe, expect, it } from 'vitest'
import tokensCss from './tokens.css?raw'
import { contrastRatio, themeTokens } from './contrast'

const cases: [theme: string, surface: string][] = [
  ['dark', 'diff-add-bg'],
  ['dark', 'diff-del-bg'],
  ['light', 'diff-add-bg'],
  ['light', 'diff-del-bg'],
]

describe('fg on diff surfaces', () => {
  it.each(cases)('%s: fg on %s reaches 7:1', (theme, surface) => {
    const tokens = themeTokens(tokensCss, theme)
    const fg = tokens['fg']
    const bg = tokens[surface]
    expect(fg).toBeDefined()
    expect(bg).toBeDefined()
    expect(contrastRatio(fg!, bg!)).toBeGreaterThanOrEqual(7)
  })
})

describe('themeTokens', () => {
  it('throws when the theme block is missing', () => {
    expect(() => themeTokens(tokensCss, 'sepia')).toThrow('no theme block for sepia')
  })
})
