import { useEffect, useState } from 'react'

export const UI_THEMES = ['nocturne', 'ember', 'slate'] as const
export const DIFF_THEMES = ['nocturne', 'muted', 'vivid', 'paper'] as const

export type UiTheme = (typeof UI_THEMES)[number]
export type DiffTheme = (typeof DIFF_THEMES)[number]

// Keys and attribute names are mirrored by the inline script in index.html that applies them before first paint.
const UI_KEY = 'review.theme'
const DIFF_KEY = 'review.diffTheme'

function stored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  const value = localStorage.getItem(key)
  return allowed.includes(value as T) ? (value as T) : fallback
}

function usePersistedAttribute<T extends string>(
  key: string,
  attribute: string,
  allowed: readonly T[],
  fallback: T,
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => stored(key, allowed, fallback))
  useEffect(() => {
    localStorage.setItem(key, value)
    document.documentElement.setAttribute(attribute, value)
  }, [key, attribute, value])
  return [value, setValue]
}

/** UI theme and its setter; persisted and mirrored onto `<html data-theme>`. */
export function useUiTheme(): [UiTheme, (theme: UiTheme) => void] {
  return usePersistedAttribute(UI_KEY, 'data-theme', UI_THEMES, 'nocturne')
}

/** Diff line-tint theme and its setter; persisted and mirrored onto `<html data-diff-theme>`. */
export function useDiffTheme(): [DiffTheme, (theme: DiffTheme) => void] {
  return usePersistedAttribute(DIFF_KEY, 'data-diff-theme', DIFF_THEMES, 'nocturne')
}
