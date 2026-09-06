import { useEffect, useState } from 'react'

export type Theme = 'dark' | 'light' | 'system'

const STORAGE_KEY = 'revu.theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'

function storedTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored === 'dark' || stored === 'light' ? stored : 'system'
}

function resolveTheme(theme: Theme): 'dark' | 'light' {
  if (theme !== 'system') return theme
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light'
}

/** Current theme choice and its setter; persists and mirrors the resolved value onto `<html data-theme>`. */
export function useTheme(): [Theme, (theme: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(storedTheme)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, theme)
    const apply = () => document.documentElement.setAttribute('data-theme', resolveTheme(theme))
    apply()
    if (theme !== 'system') return
    const media = window.matchMedia(DARK_QUERY)
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])

  return [theme, setTheme]
}
