import { describe, expect, it } from 'vitest'
import nocturneCss from './nocturne.css?raw'
import themesCss from './themes.css?raw'
import { declaredVariables } from './cssBlocks'
import { DIFF_THEMES, UI_THEMES } from './useTheme'

const DIFF_VARIABLES = ['--diff-add-bg', '--diff-del-bg', '--diff-add-fg', '--diff-del-fg']

describe('UI themes', () => {
  // Nocturne is the stylesheet's own palette; the other two override the same set of its :root variables.
  const overriding = UI_THEMES.filter((t) => t !== 'nocturne')
  const base = new Set(declaredVariables(nocturneCss, ':root'))

  it.each(overriding)('%s overrides only variables Nocturne defines', (theme) => {
    const names = declaredVariables(themesCss, `[data-theme="${theme}"]`)
    expect(names.length).toBeGreaterThan(0)
    expect(names.filter((n) => !base.has(n))).toEqual([])
  })

  it('ember and slate override the same set of variables', () => {
    const [first, ...rest] = overriding.map((t) => declaredVariables(themesCss, `[data-theme="${t}"]`).sort())
    for (const names of rest) expect(names).toEqual(first)
  })
})

describe('diff themes', () => {
  it.each(DIFF_THEMES)('%s defines exactly the four diff variables', (theme) => {
    expect(declaredVariables(themesCss, `[data-diff-theme="${theme}"]`).sort()).toEqual([...DIFF_VARIABLES].sort())
  })
})

describe('declaredVariables', () => {
  it('throws when the block is missing', () => {
    expect(() => declaredVariables(themesCss, '[data-theme="sepia"]')).toThrow('no block for [data-theme="sepia"]')
  })
})
