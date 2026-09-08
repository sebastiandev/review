import { useEffect, useState } from 'react'

export const UI_THEMES = ['nocturne', 'ember', 'slate'] as const
export const DIFF_THEMES = ['nocturne', 'muted', 'vivid', 'paper'] as const

export type UiTheme = (typeof UI_THEMES)[number]
export type DiffTheme = (typeof DIFF_THEMES)[number]

// Keys and attribute names are mirrored by the inline script in index.html that applies them before first paint.
const UI_KEY = 'review.theme'
const DIFF_KEY = 'review.diffTheme'

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

/** Diff line-tint theme and its setter; same persistence rules as `useUiTheme`. */
export function useDiffTheme(serverValue: string | undefined): [DiffTheme, (theme: DiffTheme) => void] {
  return usePersistedAttribute(DIFF_KEY, 'data-diff-theme', DIFF_THEMES, 'nocturne', serverValue)
}
