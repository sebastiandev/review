import type { CodeFont, DiffTheme, StyleMode, UiTheme } from './useTheme'

/** Labels and notes for the appearance pickers (Settings → Appearance and the diff toolbar). */

export const UI_THEME_INFO: Record<UiTheme, { label: string; note: string }> = {
  nocturne: { label: 'Nocturne', note: 'blurple on blue-grey' },
  ember: { label: 'Ember', note: 'warm ink, amber accent' },
  slate: { label: 'Slate', note: 'high contrast, reading first' },
  atelier: { label: 'Atelier', note: "the workbench's own blue-grey" },
  darkula: { label: 'Darkula', note: 'warm grey, olive accent' },
  neon: { label: 'Neon', note: 'near-black, cyan accent' },
  daylight: { label: 'Daylight', note: 'light ground, indigo accent' },
}

export const STYLE_MODE_INFO: Record<StyleMode, { label: string; note: string }> = {
  framed: { label: 'Framed', note: 'hairlines and edges' },
  tonal: { label: 'Tonal', note: 'borderless, surfaces only' },
}

/** `stack` is the CSS font-family the card renders its own name in; the diff body reads `--font-code` instead. */
export const CODE_FONT_INFO: Record<CodeFont, { label: string; note: string; stack: string }> = {
  'jetbrains-mono': { label: 'JetBrains Mono', note: 'tall x-height', stack: "'JetBrains Mono', monospace" },
  'ibm-plex-mono': { label: 'IBM Plex Mono', note: 'narrower, bookish', stack: "'IBM Plex Mono', monospace" },
  'fira-code': { label: 'Fira Code', note: 'ligatures', stack: "'Fira Code', monospace" },
  'source-code-pro': { label: 'Source Code Pro', note: 'neutral, compact', stack: "'Source Code Pro', monospace" },
}

/** Added / removed tint bases (rgb), mirrored from themes.css so swatches can render the pair at 0.85 alpha. */
export const DIFF_THEME_INFO: Record<DiffTheme, { label: string; add: string; del: string }> = {
  nocturne: { label: 'Nocturne', add: '111, 170, 126', del: '196, 123, 123' },
  muted: { label: 'Muted', add: '140, 150, 170', del: '170, 140, 150' },
  vivid: { label: 'Vivid', add: '86, 190, 120', del: '226, 96, 96' },
  paper: { label: 'Paper', add: '200, 205, 180', del: '205, 185, 170' },
  darkula: { label: 'Darkula', add: '83, 120, 80', del: '125, 72, 72' },
  neon: { label: 'Neon', add: '57, 255, 178', del: '255, 64, 140' },
  solar: { label: 'Solar', add: '133, 153, 0', del: '220, 50, 47' },
  acid: { label: 'Acid', add: '166, 226, 46', del: '249, 38, 114' },
}

/** Swatch colour for a tint base: the tint at 0.85 alpha so the pair reads at 9–12px. */
export function swatch(rgb: string): string {
  return `rgba(${rgb}, 0.85)`
}
