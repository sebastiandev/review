import { useEffect, useState } from 'react'

export const UI_THEMES = ['nocturne', 'ember', 'slate', 'atelier', 'darkula', 'neon', 'daylight'] as const
export const STYLE_MODES = ['framed', 'tonal'] as const
export const DIFF_THEMES = ['nocturne', 'muted', 'vivid', 'paper', 'darkula', 'neon', 'solar', 'acid'] as const
export const CODE_FONTS = ['jetbrains-mono', 'ibm-plex-mono', 'fira-code', 'source-code-pro'] as const

export type UiTheme = (typeof UI_THEMES)[number]
export type StyleMode = (typeof STYLE_MODES)[number]
export type DiffTheme = (typeof DIFF_THEMES)[number]
export type CodeFont = (typeof CODE_FONTS)[number]

/** The one light palette: diff tints derive from it (see themes.css `[data-theme="daylight"]`). */
export const LIGHT_THEMES: readonly UiTheme[] = ['daylight']

// Keys and attribute names are mirrored by the inline script in index.html that applies them before first paint.
const UI_KEY = 'review.theme'
const STYLE_KEY = 'review.styleMode'
const DIFF_KEY = 'review.diffTheme'
const CODE_FONT_KEY = 'review.codeFont'

/** `value` when it is one of `allowed`, else null. */
export function knownTheme<T extends string>(value: string | null | undefined, allowed: readonly T[]): T | null {
  return allowed.includes(value as T) ? (value as T) : null
}

function usePersistedAttribute<T extends string>(
  key: string,
  attribute: string,
  allowed: readonly T[],
  fallback: T,
  serverValue: string | undefined,
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => knownTheme(localStorage.getItem(key), allowed) ?? fallback)
  useEffect(() => {
    localStorage.setItem(key, value)
    document.documentElement.setAttribute(attribute, value)
  }, [key, attribute, value])
  // The persisted settings win over this machine's localStorage once they arrive.
  useEffect(() => {
    const known = knownTheme(serverValue, allowed)
    if (known) setValue(known)
  }, [serverValue, allowed])
  return [value, setValue]
}

/**
 * UI theme and its setter; mirrored onto `<html data-theme>` and localStorage for the next first paint.
 * `serverValue` (the settings row) overrides the local copy when it names a known theme.
 */
export function useUiTheme(serverValue: string | undefined): [UiTheme, (theme: UiTheme) => void] {
  return usePersistedAttribute(UI_KEY, 'data-theme', UI_THEMES, 'nocturne', serverValue)
}

/** Surface style (framed / tonal) on `<html data-style>`; same persistence rules as `useUiTheme`. */
export function useStyleMode(serverValue: string | undefined): [StyleMode, (mode: StyleMode) => void] {
  return usePersistedAttribute(STYLE_KEY, 'data-style', STYLE_MODES, 'framed', serverValue)
}

/** Diff line-tint theme and its setter; same persistence rules as `useUiTheme`. */
export function useDiffTheme(serverValue: string | undefined): [DiffTheme, (theme: DiffTheme) => void] {
  return usePersistedAttribute(DIFF_KEY, 'data-diff-theme', DIFF_THEMES, 'nocturne', serverValue)
}

/** Code face of the diff body on `<html data-code-font>`; same persistence rules as `useUiTheme`. */
export function useCodeFont(serverValue: string | undefined): [CodeFont, (font: CodeFont) => void] {
  return usePersistedAttribute(CODE_FONT_KEY, 'data-code-font', CODE_FONTS, 'jetbrains-mono', serverValue)
}
