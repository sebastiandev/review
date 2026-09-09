import { describe, expect, it } from 'vitest'
import nocturneCss from './nocturne.css?raw'
import themesCss from './themes.css?raw'
import fontsCss from './fonts.css?raw'
import { declaredVariables } from './cssBlocks'
import { CODE_FONTS, DIFF_THEMES, STYLE_MODES, UI_THEMES } from './useTheme'
import { CODE_FONT_INFO, DIFF_THEME_INFO } from './catalog'

const DIFF_VARIABLES = ['--diff-add-rgb', '--diff-del-rgb', '--diff-add-alpha', '--diff-del-alpha', '--diff-add-fg', '--diff-del-fg']
/** Every palette must re-point the whole colour surface: ground, text, accent and both ramps. */
const PALETTE_VARIABLES = [
  '--color-bg',
  '--color-surface',
  '--color-text',
  '--color-divider',
  '--color-accent',
  ...[100, 200, 300, 400, 500, 600, 700, 800, 900].flatMap((step) => [`--color-accent-${step}`, `--color-neutral-${step}`]),
  '--shadow-sm',
  '--shadow-md',
  '--shadow-lg',
]
const STYLE_VARIABLES = ['--seam', '--hairline', '--chrome-bg', '--panel-bg', '--pop-bg', '--ctl-bg', '--btn-bg', '--r-pop']

describe('UI themes', () => {
  // Nocturne is the stylesheet's own palette; the others override its :root variables.
  const overriding = UI_THEMES.filter((t) => t !== 'nocturne')
  const base = new Set(declaredVariables(nocturneCss, ':root'))

  it.each(overriding)('%s overrides only variables Nocturne defines', (theme) => {
    const names = declaredVariables(themesCss, `[data-theme="${theme}"]`)
    expect(names.filter((n) => !base.has(n))).toEqual([])
  })

  it.each(overriding)('%s re-points the full palette', (theme) => {
    const names = new Set(declaredVariables(themesCss, `[data-theme="${theme}"]`))
    expect(PALETTE_VARIABLES.filter((n) => !names.has(n))).toEqual([])
  })

  it('daylight inverts both ramps (100 is ink, 900 is paper)', () => {
    const block = themesCss.match(/\[data-theme="daylight"\]\s*\{([^}]*)\}/)![1]!
    const value = (name: string) => block.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`))![1]!
    const luminance = (hex: string) => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16)
    expect(luminance(value('--color-neutral-100'))).toBeLessThan(luminance(value('--color-neutral-900')))
    expect(luminance(value('--color-accent-100'))).toBeLessThan(luminance(value('--color-accent-900')))
  })
})

describe('surface styles', () => {
  it.each(STYLE_MODES)('%s sets every surface token', (mode) => {
    const names = new Set(declaredVariables(themesCss, `[data-style="${mode}"]`))
    expect(STYLE_VARIABLES.filter((n) => !names.has(n))).toEqual([])
  })

  it('tonal drops the authored dividers but keeps the split hairline on a ramp step', () => {
    const block = themesCss.match(/\[data-style="tonal"\]\s*\{([^}]*)\}/)![1]!
    expect(block).toMatch(/--color-divider:\s*transparent/)
    expect(block).toMatch(/--hairline:\s*var\(--color-neutral-800\)/)
  })
})

describe('diff themes', () => {
  it.each(DIFF_THEMES)('%s defines exactly the six diff variables', (theme) => {
    expect(declaredVariables(themesCss, `[data-diff-theme="${theme}"]`).sort()).toEqual([...DIFF_VARIABLES].sort())
  })

  it.each(DIFF_THEMES)('%s swatch bases mirror the stylesheet', (theme) => {
    const block = themesCss.match(new RegExp(`\\[data-diff-theme="${theme}"\\]\\s*\\{([^}]*)\\}`))![1]!
    expect(block).toContain(`--diff-add-rgb: ${DIFF_THEME_INFO[theme].add};`)
    expect(block).toContain(`--diff-del-rgb: ${DIFF_THEME_INFO[theme].del};`)
  })

  it('daylight derives its tints (alpha + ink) instead of authoring a light twin', () => {
    const names = declaredVariables(themesCss, '[data-theme="daylight"][data-diff-theme]').sort()
    expect(names).toEqual(['--diff-add-alpha', '--diff-add-fg', '--diff-del-alpha', '--diff-del-fg'])
  })
})

describe('code fonts', () => {
  it.each(CODE_FONTS.filter((f) => f !== 'jetbrains-mono'))('%s re-points --font-code only', (font) => {
    expect(declaredVariables(fontsCss, `[data-code-font='${font}']`)).toEqual(['--font-code'])
  })

  it.each(CODE_FONTS)('%s is a self-hosted face', (font) => {
    const family = CODE_FONT_INFO[font].label.replace(/ /g, '-').toLowerCase()
    expect(fontsCss).toContain(`@fontsource/${family}/400.css`)
  })
})

describe('declaredVariables', () => {
  it('throws when the block is missing', () => {
    expect(() => declaredVariables(themesCss, '[data-theme="sepia"]')).toThrow('no block for [data-theme="sepia"]')
  })
})
